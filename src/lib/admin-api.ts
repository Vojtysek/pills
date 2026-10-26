// Client for the push server's admin API (server/src/app.ts, /api/admin/*), used by the /admin page.
// The token is kept for the browser tab only (sessionStorage).

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const TOKEN_KEY = 'admin-token';

export type AdminDevice = {
  id: string;
  userAgent: string | null;
  createdAt: number;
  lastSeenAt: number;
  reminders: number;
  nextReminderAt: number | null;
  pushService: string;
};

export type DeliveryCounts = { ok: number; failed: number };

export type AdminStats = {
  devices: number;
  scheduledReminders: number;
  nextReminderAt: number | null;
  delivered: Partial<Record<'reminder' | 'test' | 'broadcast', DeliveryCounts>>;
};

export type BroadcastRecord = {
  id: number;
  at: number;
  title: string;
  body: string;
  url: string;
  sent: number;
  failed: number;
  gone: number;
};

export type SendResult = { sent: number; failed: number; gone: number };

export class UnauthorizedError extends Error {}

export function savedToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the token just isn't remembered across reloads.
  }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/admin${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (res.status === 401) throw new UnauthorizedError('Neplatný přístupový klíč.');
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `Chyba serveru ${res.status}`);
  return body as T;
}

export const adminApi = {
  stats: (token: string) => call<AdminStats>(token, '/stats'),
  devices: (token: string) => call<AdminDevice[]>(token, '/devices'),
  broadcasts: (token: string) => call<BroadcastRecord[]>(token, '/broadcasts'),
  deleteDevice: (token: string, id: string) => call<{ ok: true }>(token, `/devices/${id}`, { method: 'DELETE' }),
  testDevice: (token: string, id: string) => call<SendResult>(token, `/devices/${id}/test`, { method: 'POST' }),
  broadcast: (token: string, message: { title: string; body: string; url: string }) =>
    call<SendResult>(token, '/broadcast', { method: 'POST', body: JSON.stringify(message) }),
};

/** Rough device description from the browser's user agent, e.g. "iPhone · Safari". */
export function describeDevice(userAgent: string | null, pushService: string): string {
  const ua = userAgent ?? '';
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  const fallback = { apple: 'Apple', google: 'Chrome', mozilla: 'Firefox', microsoft: 'Edge' }[pushService] ?? pushService;
  return [device, browser].filter(Boolean).join(' · ') || fallback;
}
