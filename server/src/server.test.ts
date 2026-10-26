import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp, pushService } from './app.ts';
import { sendDue, sendNow, SubscriptionGoneError, type PushMessage, type Sender } from './scheduler.ts';
import { openStore, type PushSubscriptionJSON, type Store } from './store.ts';

const deviceId = 'dev_0123456789abcdef';
const subscription = {
  endpoint: 'https://web.push.apple.com/QGuQyavXutnMH',
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ', auth: 'tBHItJI5svbpez7KI4CCXg' },
};
const reminder = (id: string, at: number) => ({ id, at, title: `T ${id}`, body: 'B', url: '/item/3' });
const ADMIN = 'a'.repeat(40);
const ORIGIN = 'https://lekarnicka.example';

let store: Store;
let sent: { endpoint: string; message: PushMessage }[];
let send: Sender;
let clock: number;

beforeEach(() => {
  store = openStore(':memory:');
  sent = [];
  send = async (sub, message) => void sent.push({ endpoint: sub.endpoint, message });
  clock = 1_000_000;
});
afterEach(() => store.close());

let instance: ReturnType<typeof createApp>;
beforeEach(() => {
  instance = createApp({ store, send, vapidPublicKey: 'PUBKEY', allowedOrigins: [ORIGIN], adminToken: ADMIN, now: () => clock });
});
const app = () => instance;

function request(path: string, init: RequestInit & { json?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  return app().request(`/api${path}`, {
    ...init,
    headers,
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  });
}

const register = (id = deviceId, reminders = [reminder('a', 1)], sub: PushSubscriptionJSON = subscription) =>
  request(`/devices/${id}`, { method: 'PUT', json: { subscription: sub, reminders } });

describe('device API', () => {
  it('serves the VAPID key with CORS for the app origin only', async () => {
    const res = await request('/config');
    expect(await res.json()).toEqual({ vapidPublicKey: 'PUBKEY' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);

    const other = await app().request('/api/config', { headers: { Origin: 'https://evil.example' } });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('replaces the whole schedule of a device', async () => {
    expect((await register(deviceId, [reminder('a', 1), reminder('b', 2)])).status).toBe(200);
    expect((await register(deviceId, [reminder('c', 3)])).status).toBe(200);
    expect(store.due(10).map((r) => r.id)).toEqual(['c']);
  });

  it('rejects bad input', async () => {
    expect((await register('short')).status).toBe(400);
    expect((await register(deviceId, [], { endpoint: 'http://insecure', keys: subscription.keys })).status).toBe(400);
    expect((await register(deviceId, [reminder('a', 1), reminder('a', 2)])).status).toBe(400);
    expect((await register(deviceId, [{ ...reminder('a', 1), url: 'https://phish' }])).status).toBe(400);
    expect((await register(deviceId, [{ ...reminder('a', 1), url: '//phish.example' }])).status).toBe(400);
    expect(store.deviceCount()).toBe(0);
  });

  it('deletes a device and its reminders', async () => {
    await register();
    expect((await request(`/devices/${deviceId}`, { method: 'DELETE' })).status).toBe(200);
    expect(store.due(10)).toEqual([]);
  });

  it('sends a test notification, at most once per 30 seconds', async () => {
    expect((await request(`/devices/${deviceId}/test`, { method: 'POST' })).status).toBe(404);
    await register();
    expect((await request(`/devices/${deviceId}/test`, { method: 'POST' })).status).toBe(200);
    expect(sent.map((s) => s.message.tag)).toEqual(['test']);

    expect((await request(`/devices/${deviceId}/test`, { method: 'POST' })).status).toBe(429);
    clock += 31_000;
    expect((await request(`/devices/${deviceId}/test`, { method: 'POST' })).status).toBe(200);
    expect(sent).toHaveLength(2);
  });
});

describe('admin API', () => {
  it('requires the admin token', async () => {
    expect((await request('/admin/stats')).status).toBe(401);
    expect((await request('/admin/stats', { token: 'b'.repeat(40) })).status).toBe(401);
    expect((await request('/admin/stats', { token: ADMIN })).status).toBe(200);
  });

  it('is disabled without a configured token', async () => {
    const noAdmin = createApp({ store, send, vapidPublicKey: 'K', allowedOrigins: [ORIGIN] });
    const res = await noAdmin.request('/api/admin/stats', { headers: { Authorization: 'Bearer ' } });
    expect(res.status).toBe(404);
  });

  it('lists devices without exposing reminder contents', async () => {
    await register(deviceId, [reminder('a', 5000), reminder('b', 3000)]);
    const [device] = (await (await request('/admin/devices', { token: ADMIN })).json()) as Record<string, unknown>[];
    expect(device).toMatchObject({ id: deviceId, pushService: 'apple', reminders: 2, nextReminderAt: 3000 });
    expect(JSON.stringify(device)).not.toContain('T a');
    expect(device.subscription).toBeUndefined();
  });

  it('broadcasts to every device, records history and statistics', async () => {
    await register(deviceId);
    await register('dev_fedcba9876543210', [], { ...subscription, endpoint: 'https://fcm.googleapis.com/fcm/send/x' });

    const res = await request('/admin/broadcast', {
      method: 'POST',
      token: ADMIN,
      json: { title: 'Nová verze', body: 'Přibylo vyhledávání podle potíží.', url: '/symptoms' },
    });
    expect(await res.json()).toEqual({ sent: 2, failed: 0, gone: 0 });
    expect(sent.map((s) => s.message.title)).toEqual(['Nová verze', 'Nová verze']);

    const [history] = (await (await request('/admin/broadcasts', { token: ADMIN })).json()) as Record<string, unknown>[];
    expect(history).toMatchObject({ title: 'Nová verze', url: '/symptoms', sent: 2 });

    const stats = await (await request('/admin/stats', { token: ADMIN })).json();
    expect(stats).toMatchObject({ devices: 2, scheduledReminders: 1, delivered: { broadcast: { ok: 2, failed: 0 } } });
  });

  it('validates broadcasts', async () => {
    const post = (json: unknown) => request('/admin/broadcast', { method: 'POST', token: ADMIN, json });
    expect((await post({ title: '', body: 'x' })).status).toBe(400);
    expect((await post({ title: 'x', body: 'y', url: 'https://elsewhere' })).status).toBe(400);
    expect((await post({ title: 'x', body: 'y' })).status).toBe(200); // link defaults to the app's home
  });

  it('deletes a device', async () => {
    await register();
    expect((await request(`/admin/devices/${deviceId}`, { method: 'DELETE', token: ADMIN })).status).toBe(200);
    expect((await request(`/admin/devices/${deviceId}`, { method: 'DELETE', token: ADMIN })).status).toBe(404);
  });
});

describe('sendDue', () => {
  it('sends only due reminders, each exactly once', async () => {
    store.replaceSchedule(deviceId, subscription, [reminder('past', 100), reminder('future', 10_000)]);
    expect(await sendDue(store, send, 1000)).toEqual({ sent: 1, failed: 0, gone: 0 });
    expect(await sendDue(store, send, 1000)).toEqual({ sent: 0, failed: 0, gone: 0 });
    expect(sent.map((s) => [s.message.tag, s.endpoint])).toEqual([['past', subscription.endpoint]]);
  });

  it('retries failed sends on the next run', async () => {
    store.replaceSchedule(deviceId, subscription, [reminder('a', 100)]);
    await sendDue(store, async () => Promise.reject(new Error('push service down')), 1000);
    expect(store.due(1000)[0].attempts).toBe(1);
    expect((await sendDue(store, send, 1000)).sent).toBe(1);
  });

  it('forgets devices whose subscription is gone', async () => {
    store.replaceSchedule(deviceId, subscription, [reminder('a', 100), reminder('b', 200)]);
    const result = await sendDue(store, async () => Promise.reject(new SubscriptionGoneError('410')), 1000);
    expect(result).toEqual({ sent: 0, failed: 0, gone: 1 });
    expect(store.deviceCount()).toBe(0);
  });
});

describe('sendNow', () => {
  it('sends to many devices and drops gone ones', async () => {
    for (let i = 0; i < 25; i++) store.replaceSchedule(`dev_${String(i).padStart(16, '0')}`, subscription, []);
    let calls = 0;
    const flaky: Sender = async () => {
      if (++calls % 5 === 0) throw new SubscriptionGoneError('gone');
    };
    const message = { title: 't', body: 'b', url: '/', tag: 'x' };
    expect(await sendNow(store, flaky, store.listDevices(), message, 'broadcast', 4)).toEqual({ sent: 20, failed: 0, gone: 5 });
    expect(store.deviceCount()).toBe(20);
  });
});

describe('migrations', () => {
  it('upgrades a database created by the first version without losing devices', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'lek-')), 'old.db');
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE device (id TEXT PRIMARY KEY, subscription TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE reminder (device_id TEXT NOT NULL REFERENCES device (id) ON DELETE CASCADE, id TEXT NOT NULL,
        at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (device_id, id));
    `);
    old.prepare('INSERT INTO device VALUES (?, ?, ?)').run(deviceId, JSON.stringify(subscription), 42);
    old.close();

    const upgraded = openStore(path);
    expect(upgraded.listDevices()).toEqual([
      expect.objectContaining({ id: deviceId, createdAt: 42, lastSeenAt: 42, userAgent: null, reminders: 0 }),
    ]);
    upgraded.close();
    // Opening again is a no-op.
    openStore(path).close();
  });
});

describe('pushService', () => {
  it('names the platform from the endpoint', () => {
    expect(pushService('https://web.push.apple.com/abc')).toBe('apple');
    expect(pushService('https://fcm.googleapis.com/fcm/send/abc')).toBe('google');
    expect(pushService('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe('mozilla');
  });
});
