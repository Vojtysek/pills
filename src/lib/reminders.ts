import type { CabinetItem } from '../db/cabinet.ts';
import { formatExpiry, reminderDates } from './expiry.ts';

// Expiry reminders are scheduled on an ntfy server (https://ntfy.sh, or self-hosted) as delayed
// messages. The user subscribes to their topic in the ntfy app and gets a push notification on the day.
//
// Requests use ntfy's JSON publishing with a text/plain body and GET for cancelling, so the
// browser sends them without a CORS preflight. The server needs `message-delay-limit` raised
// (the default only allows scheduling 3 days ahead) and ntfy ≥ 2.16 to cancel scheduled messages.

export type ReminderSettings = { server: string; topic: string };

const STORAGE_KEY = 'reminders';
const DEFAULT_SERVER = import.meta.env.VITE_NTFY_URL ?? '';

export function loadSettings(): ReminderSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReminderSettings) : null;
  } catch {
    return null;
  }
}

export function saveSettings(settings: ReminderSettings | null) {
  try {
    if (settings) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode): reminders just stay off.
  }
}

/** Suggested settings for a new device: the default server and an unguessable topic. */
export function newSettings(): ReminderSettings {
  const random = crypto.getRandomValues(new Uint8Array(9));
  const suffix = Array.from(random, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
  return { server: DEFAULT_SERVER, topic: `lekarnicka-${suffix}` };
}

function baseUrl(settings: ReminderSettings): string {
  return settings.server.replace(/\/+$/, '');
}

function sequenceId(item: CabinetItem, kind: 'soon' | 'expired'): string {
  return `item-${item.id}-${kind}`;
}

async function publish(settings: ReminderSettings, message: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${baseUrl(settings)}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ topic: settings.topic, tags: ['pill'], ...message }),
  });
  if (!res.ok) throw await ntfyError(res);
}

async function cancel(settings: ReminderSettings, id: string): Promise<void> {
  // 404 just means nothing was scheduled under this id.
  const res = await fetch(`${baseUrl(settings)}/${settings.topic}/${id}/delete`);
  if (!res.ok && res.status !== 404) throw await ntfyError(res);
}

// ntfy error codes: https://github.com/binwiederhier/ntfy/blob/main/server/errors.go
const DELAY_TOO_LARGE = 40006;

async function ntfyError(res: Response): Promise<Error> {
  const text = await res.text();
  let body: { code?: number; error?: string } = {};
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON (proxy error page etc.)
  }
  if (body.code === DELAY_TOO_LARGE) {
    return new Error(
      'Server ntfy nedovoluje naplánovat zprávu tak daleko dopředu. ' +
        'V konfiguraci serveru zvyšte message-delay-limit (např. 8760h = 1 rok).'
    );
  }
  return new Error(`ntfy odmítl požadavek (${res.status}): ${body.error ?? text}`);
}

/**
 * Makes the server's scheduled reminders match the item: publishing with the same sequence id
 * replaces an earlier schedule, and reminders that no longer apply are cancelled.
 */
export async function syncReminders(item: CabinetItem): Promise<void> {
  const settings = loadSettings();
  if (!settings) return;

  const dates = item.expiresOn ? reminderDates(item.expiresOn) : [];
  const expiry = item.expiresOn ? formatExpiry(item.expiresOn) : '';
  const click = `${location.origin}/item/${item.id}`;
  for (const kind of ['soon', 'expired'] as const) {
    const due = dates.find((d) => d.kind === kind);
    if (!due) {
      await cancel(settings, sequenceId(item, kind));
      continue;
    }
    await publish(settings, {
      sequence_id: sequenceId(item, kind),
      delay: String(Math.floor(due.date.getTime() / 1000)),
      title: kind === 'soon' ? `${item.name} brzy projde` : `${item.name} je prošlý`,
      message: kind === 'soon' ? `Použitelné do ${expiry}.` : `Platnost skončila ${expiry}. Odneste ho do lékárny.`,
      click,
    });
  }
}

export async function cancelReminders(item: CabinetItem): Promise<void> {
  const settings = loadSettings();
  if (!settings) return;
  await Promise.all([cancel(settings, sequenceId(item, 'soon')), cancel(settings, sequenceId(item, 'expired'))]);
}

export async function sendTestReminder(settings: ReminderSettings): Promise<void> {
  await publish(settings, {
    title: 'Lékárnička',
    message: 'Upozornění fungují. Takhle vám dáme vědět, když bude lék brzy prošlý.',
  });
}
