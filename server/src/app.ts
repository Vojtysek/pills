import { timingSafeEqual } from 'node:crypto';

import { Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import { sendNow, type Sender } from './scheduler.ts';
import type { PushSubscriptionJSON, Reminder, Store } from './store.ts';

export type AppOptions = {
  store: Store;
  send: Sender;
  vapidPublicKey: string;
  /** Origins of the web app allowed to call the API, e.g. https://lekarnicka.example.cz */
  allowedOrigins: string[];
  /** Secret for the admin dashboard; the admin API is disabled when empty. */
  adminToken?: string;
  now?: () => number;
};

const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_REMINDERS = 2000;
const TEST_COOLDOWN_MS = 30_000;
const DAY_MS = 24 * 3600 * 1000;

export function createApp({ store, send, vapidPublicKey, allowedOrigins, adminToken, now = Date.now }: AppOptions) {
  const app = new Hono().basePath('/api');
  const lastTest = new Map<string, number>();

  app.use(
    '*',
    cors({
      origin: allowedOrigins,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    })
  );
  app.use('*', bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: 'Request too large' }, 413) }));

  app.get('/health', (c) => c.json({ ok: true, devices: store.deviceCount() }));

  app.get('/config', (c) => c.json({ vapidPublicKey }));

  // --- Devices (called by the app) ---------------------------------------------------------------

  // The app sends its whole schedule whenever the cabinet changes, so the server never has to merge.
  app.put('/devices/:id', async (c) => {
    const deviceId = c.req.param('id');
    if (!DEVICE_ID.test(deviceId)) return c.json({ error: 'Invalid device id' }, 400);

    const parsed = parseSchedule(await readJson(c.req.raw));
    if (typeof parsed === 'string') return c.json({ error: parsed }, 400);

    store.replaceSchedule(deviceId, parsed.subscription, parsed.reminders, {
      now: now(),
      userAgent: c.req.header('User-Agent') ?? null,
    });
    return c.json({ ok: true, reminders: parsed.reminders.length });
  });

  app.delete('/devices/:id', (c) => {
    const deviceId = c.req.param('id');
    if (!DEVICE_ID.test(deviceId)) return c.json({ error: 'Invalid device id' }, 400);
    store.deleteDevice(deviceId);
    return c.json({ ok: true });
  });

  app.post('/devices/:id/test', async (c) => {
    const deviceId = c.req.param('id');
    if (!DEVICE_ID.test(deviceId)) return c.json({ error: 'Invalid device id' }, 400);
    const device = store.getDevice(deviceId);
    if (!device) return c.json({ error: 'Unknown device' }, 404);

    const last = lastTest.get(deviceId) ?? 0;
    if (now() - last < TEST_COOLDOWN_MS) return c.json({ error: 'Try again in a moment' }, 429);
    if (lastTest.size > 1000) lastTest.clear(); // only needs to remember the last half minute
    lastTest.set(deviceId, now());

    const result = await sendNow(store, send, [device], TEST_MESSAGE, 'test');
    if (result.gone) return c.json({ error: 'Subscription expired' }, 410);
    if (result.failed) return c.json({ error: 'Push service did not accept the message' }, 502);
    return c.json({ ok: true });
  });

  // --- Admin dashboard ---------------------------------------------------------------------------

  const admin = new Hono();
  admin.use('*', requireToken(adminToken));

  admin.get('/stats', (c) => c.json(store.stats(now() - 7 * DAY_MS)));

  admin.get('/devices', (c) =>
    c.json(
      store.listDevices().map(({ subscription, ...device }) => ({
        ...device,
        pushService: pushService(subscription.endpoint),
      }))
    )
  );

  admin.delete('/devices/:id', (c) =>
    store.deleteDevice(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'Unknown device' }, 404)
  );

  admin.post('/devices/:id/test', async (c) => {
    const device = store.getDevice(c.req.param('id'));
    if (!device) return c.json({ error: 'Unknown device' }, 404);
    return c.json(await sendNow(store, send, [device], TEST_MESSAGE, 'test'));
  });

  admin.post('/broadcast', async (c) => {
    const message = parseBroadcast(await readJson(c.req.raw));
    if (typeof message === 'string') return c.json({ error: message }, 400);
    const at = now();
    const result = await sendNow(store, send, store.listDevices(), { ...message, tag: `broadcast-${at}` }, 'broadcast');
    store.saveBroadcast({ at, ...message, ...result });
    return c.json(result);
  });

  admin.get('/broadcasts', (c) => c.json(store.listBroadcasts()));

  app.route('/admin', admin);

  return app;
}

const TEST_MESSAGE = {
  title: 'Lékárnička',
  body: 'Upozornění fungují. Takhle vám dáme vědět, když bude lék brzy prošlý.',
  url: '/settings',
  tag: 'test',
};

function requireToken(token: string | undefined): MiddlewareHandler {
  const expected = token ? Buffer.from(token) : null;
  return async (c, next) => {
    if (!expected) return c.json({ error: 'Admin API is not configured' }, 404);
    const given = Buffer.from(c.req.header('Authorization')?.replace(/^Bearer /, '') ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  };
}

/** Which push service a subscription uses, which tells the platform apart. */
export function pushService(endpoint: string): string {
  const host = new URL(endpoint).hostname;
  if (host.endsWith('push.apple.com')) return 'apple';
  if (host.endsWith('googleapis.com')) return 'google';
  if (host.endsWith('mozilla.com')) return 'mozilla';
  if (host.endsWith('notify.windows.com')) return 'microsoft';
  return host;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Validates the schedule body; returns an error message when it's not acceptable. */
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
      !isAppPath(r.url)
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

export function parseBroadcast(body: unknown): { title: string; body: string; url: string } | string {
  if (!isObject(body)) return 'Body must be an object';
  if (!isString(body.title, 100)) return 'Title is required (max 100 characters)';
  if (!isString(body.body, 300)) return 'Text is required (max 300 characters)';
  const url = body.url === undefined || body.url === '' ? '/' : body.url;
  if (!isAppPath(url)) return 'Link must be a path in the app, e.g. /symptoms';
  return { title: body.title, body: body.body, url };
}

function isAppPath(value: unknown): value is string {
  // A path inside the app, never another site ("//evil.com" is protocol-relative).
  return isString(value, 300) && value.startsWith('/') && !value.startsWith('//');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}
