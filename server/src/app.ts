import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import type { PushSubscriptionJSON, Reminder, Store } from './store.ts';

export type AppOptions = {
  store: Store;
  vapidPublicKey: string;
  /** Origins of the web app allowed to call the API, e.g. https://lekarnicka.example.cz */
  allowedOrigins: string[];
};

const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_REMINDERS = 2000;

export function createApp({ store, vapidPublicKey, allowedOrigins }: AppOptions) {
  const app = new Hono().basePath('/api');

  app.use('*', cors({ origin: allowedOrigins, allowMethods: ['GET', 'PUT', 'DELETE'], maxAge: 86400 }));
  app.use('*', bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: 'Request too large' }, 413) }));

  app.get('/health', (c) => c.json({ ok: true, devices: store.deviceCount() }));

  app.get('/config', (c) => c.json({ vapidPublicKey }));

  // The app sends its whole schedule whenever the cabinet changes, so the server never has to merge.
  app.put('/devices/:id', async (c) => {
    const deviceId = c.req.param('id');
    if (!DEVICE_ID.test(deviceId)) return c.json({ error: 'Invalid device id' }, 400);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }
    const parsed = parseSchedule(body);
    if (typeof parsed === 'string') return c.json({ error: parsed }, 400);

    store.replaceSchedule(deviceId, parsed.subscription, parsed.reminders);
    return c.json({ ok: true, reminders: parsed.reminders.length });
  });

  app.delete('/devices/:id', (c) => {
    const deviceId = c.req.param('id');
    if (!DEVICE_ID.test(deviceId)) return c.json({ error: 'Invalid device id' }, 400);
    store.deleteDevice(deviceId);
    return c.json({ ok: true });
  });

  return app;
}

/** Validates the request body; returns an error message when it's not acceptable. */
export function parseSchedule(body: unknown): { subscription: PushSubscriptionJSON; reminders: Reminder[] } | string {
  if (!isObject(body)) return 'Body must be an object';
  const { subscription, reminders } = body;

  if (
    !isObject(subscription) ||
    !isString(subscription.endpoint, 2048) ||
    !/^https:\/\//.test(subscription.endpoint) ||
    !isObject(subscription.keys) ||
    !isString(subscription.keys.p256dh, 256) ||
    !isString(subscription.keys.auth, 256)
  ) {
    return 'Invalid push subscription';
  }
  if (!Array.isArray(reminders) || reminders.length > MAX_REMINDERS) return 'Invalid reminders';

  const clean: Reminder[] = [];
  const ids = new Set<string>();
  for (const r of reminders) {
    if (
      !isObject(r) ||
      !isString(r.id, 100) ||
      ids.has(r.id) ||
      typeof r.at !== 'number' ||
      !Number.isFinite(r.at) ||
      !isString(r.title, 200) ||
      !isString(r.body, 500) ||
      !isString(r.url, 300) ||
      !r.url.startsWith('/')
    ) {
      return 'Invalid reminder';
    }
    ids.add(r.id);
    clean.push({ id: r.id, at: r.at, title: r.title, body: r.body, url: r.url });
  }
  return {
    subscription: {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    },
    reminders: clean,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}
