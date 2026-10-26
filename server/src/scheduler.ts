import type { DeliveryKind, Device, PushSubscriptionJSON, Store } from './store.ts';

export type PushMessage = { title: string; body: string; url: string; tag: string };

/** Sends one push message. Resolves when the push service accepted it. */
export type Sender = (subscription: PushSubscriptionJSON, message: PushMessage) => Promise<void>;

/** Thrown by a Sender when the subscription no longer exists (the user uninstalled or revoked permission). */
export class SubscriptionGoneError extends Error {}

// Gives up on a reminder after this many failed attempts (one per minute while the push service is failing).
const MAX_ATTEMPTS = 60;

export type SendResult = { sent: number; failed: number; gone: number };

/** Sends every reminder that is due. Run periodically. */
export async function sendDue(store: Store, send: Sender, now = Date.now()): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, gone: 0 };
  const goneDevices = new Set<string>();
  for (const reminder of store.due(now)) {
    if (goneDevices.has(reminder.deviceId)) continue;
    try {
      await send(reminder.subscription, { title: reminder.title, body: reminder.body, url: reminder.url, tag: reminder.id });
      store.markSent(reminder.deviceId, reminder.id);
      store.logDelivery('reminder', true, now);
      result.sent++;
    } catch (error) {
      if (error instanceof SubscriptionGoneError) {
        store.deleteDevice(reminder.deviceId);
        goneDevices.add(reminder.deviceId);
        result.gone++;
      } else if (reminder.attempts + 1 >= MAX_ATTEMPTS) {
        console.error(`Giving up on reminder ${reminder.id} for device ${reminder.deviceId.slice(0, 6)}…`, error);
        store.markSent(reminder.deviceId, reminder.id);
        store.logDelivery('reminder', false, now);
        result.failed++;
      } else {
        store.markFailed(reminder.deviceId, reminder.id);
        result.failed++;
      }
    }
  }
  return result;
}

/**
 * Sends a message to the given devices right away (test notifications, broadcasts), a few at a time.
 * Devices whose subscription is gone are removed.
 */
export async function sendNow(
  store: Store,
  send: Sender,
  devices: Device[],
  message: PushMessage,
  kind: DeliveryKind,
  concurrency = 10
): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, gone: 0 };
  let next = 0;
  async function worker() {
    while (next < devices.length) {
      const device = devices[next++];
      try {
        await send(device.subscription, message);
        store.logDelivery(kind, true);
        result.sent++;
      } catch (error) {
        if (error instanceof SubscriptionGoneError) {
          store.deleteDevice(device.id);
          result.gone++;
        } else {
          console.error(`Sending ${kind} to device ${device.id.slice(0, 6)}… failed`, error);
          store.logDelivery(kind, false);
          result.failed++;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, devices.length) }, worker));
  return result;
}
