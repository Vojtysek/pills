import { serve } from '@hono/node-server';
import webpush, { WebPushError } from 'web-push';

import { createApp } from './app.ts';
import { sendDue, SubscriptionGoneError, type Sender } from './scheduler.ts';
import { openStore } from './store.ts';

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    console.error(`Missing environment variable ${name}. See server/.env.example.`);
    process.exit(1);
  }
  return value;
}

const vapidPublicKey = env('VAPID_PUBLIC_KEY');
webpush.setVapidDetails(env('VAPID_SUBJECT'), vapidPublicKey, env('VAPID_PRIVATE_KEY'));

const store = openStore(env('DATABASE_PATH', './data/lekarnicka.db'));
const app = createApp({
  store,
  vapidPublicKey,
  allowedOrigins: env('ALLOWED_ORIGINS')
    .split(',')
    .map((origin) => origin.trim()),
});

const send: Sender = async (reminder) => {
  try {
    await webpush.sendNotification(
      reminder.subscription,
      JSON.stringify({ title: reminder.title, body: reminder.body, url: reminder.url, tag: reminder.id }),
      { TTL: 7 * 24 * 3600, urgency: 'normal' }
    );
  } catch (error) {
    // 404/410: the push service forgot this subscription (app removed, permission revoked).
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      throw new SubscriptionGoneError(error.message);
    }
    throw error;
  }
};

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

const port = Number(env('PORT', '3000'));
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () =>
  console.log(`Lékárnička push server on :${port}`)
);

function shutdown() {
  clearInterval(timer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
