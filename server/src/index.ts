import { serve } from '@hono/node-server';
import webpush, { WebPushError } from 'web-push';

import { createApp } from './app.ts';
import { sendDue, SubscriptionGoneError, type Sender } from './scheduler.ts';
import { openStore } from './store.ts';

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    console.error(`Missing environment variable ${name}. See server/.env.example.`);
    process.exit(1);
  }
  return value;
}

const vapidPublicKey = env('VAPID_PUBLIC_KEY');
webpush.setVapidDetails(env('VAPID_SUBJECT'), vapidPublicKey, env('VAPID_PRIVATE_KEY'));

const adminToken = process.env.ADMIN_TOKEN ?? '';
if (adminToken && adminToken.length < 32) {
  console.error('ADMIN_TOKEN must be at least 32 characters.');
  process.exit(1);
}

const send: Sender = async (subscription, message) => {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(message), { TTL: 7 * 24 * 3600, urgency: 'normal' });
  } catch (error) {
    // 404/410: the push service forgot this subscription (app removed, permission revoked).
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      throw new SubscriptionGoneError(error.message);
    }
    throw error;
  }
};

const store = openStore(env('DATABASE_PATH', './data/lekarnicka.db'));
const app = createApp({
  store,
  send,
  vapidPublicKey,
  adminToken,
  allowedOrigins: env('ALLOWED_ORIGINS')
    .split(',')
    .map((origin) => origin.trim()),
});

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await sendDue(store, send);
    if (result.sent || result.failed || result.gone) console.log(new Date().toISOString(), 'push', result);
  } catch (error) {
    console.error('Scheduler error', error);
  } finally {
    running = false;
  }
}
const timer = setInterval(tick, 60_000);
void tick();

const pruneTimer = setInterval(() => store.pruneDeliveryLog(), 24 * 3600 * 1000);
store.pruneDeliveryLog();

const port = Number(env('PORT', '3000'));
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () =>
  console.log(`Lékárnička push server on :${port}${adminToken ? ' (admin API enabled)' : ''}`)
);

function shutdown() {
  clearInterval(timer);
  clearInterval(pruneTimer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
