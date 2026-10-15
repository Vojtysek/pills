import type { DueReminder, Store } from './store.ts';

/** Sends one push message. Resolves when the push service accepted it. */
export type Sender = (reminder: DueReminder) => Promise<void>;

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
      await send(reminder);
      store.markSent(reminder.deviceId, reminder.id);
      result.sent++;
    } catch (error) {
      if (error instanceof SubscriptionGoneError) {
        store.deleteDevice(reminder.deviceId);
        goneDevices.add(reminder.deviceId);
        result.gone++;
      } else if (reminder.attempts + 1 >= MAX_ATTEMPTS) {
        console.error(`Giving up on reminder ${reminder.id} for device ${reminder.deviceId.slice(0, 6)}…`, error);
        store.markSent(reminder.deviceId, reminder.id);
        result.failed++;
      } else {
        store.markFailed(reminder.deviceId, reminder.id);
        result.failed++;
      }
    }
  }
  return result;
}
