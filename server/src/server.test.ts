import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.ts';
import { sendDue, SubscriptionGoneError, type Sender } from './scheduler.ts';
import { openStore, type DueReminder, type Store } from './store.ts';

const deviceId = 'dev_0123456789abcdef';
const subscription = {
  endpoint: 'https://web.push.apple.com/QGuQyavXutnMH...',
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ', auth: 'tBHItJI5svbpez7KI4CCXg' },
};
const reminder = (id: string, at: number) => ({ id, at, title: `T ${id}`, body: 'B', url: '/item/3' });

let store: Store;
beforeEach(() => {
  store = openStore(':memory:');
});
afterEach(() => store.close());

describe('API', () => {
  const app = () => createApp({ store, vapidPublicKey: 'PUBKEY', allowedOrigins: ['https://lekarnicka.example'] });
  const put = (id: string, body: unknown) =>
    app().request(`/api/devices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: 'https://lekarnicka.example' },
      body: JSON.stringify(body),
    });

  it('serves the VAPID key with CORS for the app origin only', async () => {
    const res = await app().request('/api/config', { headers: { Origin: 'https://lekarnicka.example' } });
    expect(await res.json()).toEqual({ vapidPublicKey: 'PUBKEY' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://lekarnicka.example');

    const other = await app().request('/api/config', { headers: { Origin: 'https://evil.example' } });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('replaces the whole schedule of a device', async () => {
    expect((await put(deviceId, { subscription, reminders: [reminder('a', 1), reminder('b', 2)] })).status).toBe(200);
    expect((await put(deviceId, { subscription, reminders: [reminder('c', 3)] })).status).toBe(200);
    expect(store.due(10).map((r) => r.id)).toEqual(['c']);
  });

  it('rejects bad input', async () => {
    expect((await put('short', { subscription, reminders: [] })).status).toBe(400);
    expect((await put(deviceId, { subscription: { endpoint: 'http://insecure' }, reminders: [] })).status).toBe(400);
    expect((await put(deviceId, { subscription, reminders: [reminder('a', 1), reminder('a', 2)] })).status).toBe(400);
    expect((await put(deviceId, { subscription, reminders: [{ ...reminder('a', 1), url: 'https://phish' }] })).status).toBe(400);
    expect(store.deviceCount()).toBe(0);
  });

  it('deletes a device and its reminders', async () => {
    await put(deviceId, { subscription, reminders: [reminder('a', 1)] });
    const res = await app().request(`/api/devices/${deviceId}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(store.due(10)).toEqual([]);
  });
});

describe('sendDue', () => {
  it('sends only due reminders, each exactly once', async () => {
    store.replaceSchedule(deviceId, subscription, [reminder('past', 100), reminder('future', 10_000)]);
    const sent: DueReminder[] = [];
    const send: Sender = async (r) => void sent.push(r);

    expect(await sendDue(store, send, 1000)).toEqual({ sent: 1, failed: 0, gone: 0 });
    expect(await sendDue(store, send, 1000)).toEqual({ sent: 0, failed: 0, gone: 0 });
    expect(sent.map((r) => [r.id, r.subscription.endpoint])).toEqual([['past', subscription.endpoint]]);
  });

  it('retries failed sends on the next run', async () => {
    store.replaceSchedule(deviceId, subscription, [reminder('a', 100)]);
    await sendDue(store, async () => Promise.reject(new Error('push service down')), 1000);
    expect(store.due(1000)[0].attempts).toBe(1);
    expect((await sendDue(store, async () => {}, 1000)).sent).toBe(1);
  });

  it('forgets devices whose subscription is gone', async () => {
    store.replaceSchedule(deviceId, subscription, [reminder('a', 100), reminder('b', 200)]);
    const result = await sendDue(store, async () => Promise.reject(new SubscriptionGoneError('410')), 1000);
    expect(result).toEqual({ sent: 0, failed: 0, gone: 1 });
    expect(store.deviceCount()).toBe(0);
  });
});
