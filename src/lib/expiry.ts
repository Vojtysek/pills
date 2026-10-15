// Expiry dates are stored as the last day the pack may be used ("YYYY-MM-DD").

export const SOON_DAYS = 30;
const REMINDER_HOUR = 9;

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'unknown';

function parseDay(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function daysUntil(expiresOn: string, now = new Date()): number {
  return Math.round((parseDay(expiresOn).getTime() - startOfToday(now).getTime()) / 86_400_000);
}

export function expiryStatus(expiresOn: string | null, now = new Date()): ExpiryStatus {
  if (!expiresOn) return 'unknown';
  const days = daysUntil(expiresOn, now);
  if (days < 0) return 'expired';
  if (days <= SOON_DAYS) return 'soon';
  return 'ok';
}

/** "08/2027" for month-only expiry (last day of month), "15. 3. 2027" otherwise. */
export function formatExpiry(expiresOn: string): string {
  const [y, m, d] = expiresOn.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return d === lastDay ? `${String(m).padStart(2, '0')}/${y}` : `${d}. ${m}. ${y}`;
}

/** Parses what the user typed: "8/2027", "08 27", "15.3.2027". Returns the last valid day. */
export function parseExpiryInput(input: string): string | null {
  const parts = input.trim().split(/[^0-9]+/).filter(Boolean).map(Number);
  let [d, m, y]: (number | undefined)[] = [];
  if (parts.length === 2) [m, y] = parts;
  else if (parts.length === 3) [d, m, y] = parts;
  else return null;
  if (y! < 100) y = 2000 + y!;
  if (!(y! >= 2000 && y! <= 2099 && m! >= 1 && m! <= 12)) return null;
  const lastDay = new Date(y!, m!, 0).getDate();
  const day = d ?? lastDay;
  if (!(day >= 1 && day <= lastDay)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** When to remind: SOON_DAYS before expiry, and the morning after the last valid day. Past dates are skipped. */
export function reminderDates(expiresOn: string, now = new Date()): { kind: 'soon' | 'expired'; date: Date }[] {
  const lastDay = parseDay(expiresOn);
  const soon = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() - SOON_DAYS, REMINDER_HOUR);
  const expired = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1, REMINDER_HOUR);
  return [
    { kind: 'soon' as const, date: soon },
    { kind: 'expired' as const, date: expired },
  ].filter((r) => r.date > now);
}
