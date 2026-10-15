import { useSyncExternalStore } from 'react';

import { listItems, onCabinetChange, type CabinetItem } from '../db/cabinet.ts';
import { formatExpiry, reminderDates } from './expiry.ts';

// Expiry notifications via Web Push. A web app can't schedule notifications on the phone itself,
// so the app sends its reminder schedule to the push server (server/), which sends each one when due.
// The whole schedule is re-sent after every cabinet change, so the server never gets out of sync.

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const STORAGE_KEY = 'push';

export type ScheduledReminder = { id: string; at: number; title: string; body: string; url: string };

/** Reminders for all items, 30 days before expiry and the morning after; past ones are left out. */
export function buildSchedule(items: CabinetItem[], now = new Date()): ScheduledReminder[] {
  return items.flatMap((item) => {
    if (!item.expiresOn) return [];
    const expiry = formatExpiry(item.expiresOn);
    return reminderDates(item.expiresOn, now).map(({ kind, date }) => ({
      id: `item-${item.id}-${kind}`,
      at: date.getTime(),
      title: kind === 'soon' ? `${item.name} brzy projde` : `${item.name} je prošlý`,
      body: kind === 'soon' ? `Použitelné do ${expiry}.` : `Platnost skončila ${expiry}. Odneste ho do lékárny.`,
      url: `/item/${item.id}`,
    }));
  });
}

// --- State -------------------------------------------------------------------------------------

export type PushState = { enabled: boolean; syncing: boolean; error: string | null };

let state: PushState = { enabled: loadSaved()?.enabled ?? false, syncing: false, error: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<PushState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function usePushState(): PushState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
}

type Saved = { deviceId: string; enabled: boolean };

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(saved: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage blocked: notifications just won't survive a reload.
  }
}

/** This installation's id on the push server; created and saved on first use so every call agrees. */
function deviceId(): string {
  const saved = loadSaved();
  if (saved) return saved.deviceId;
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  save({ deviceId: id, enabled: false });
  return id;
}

// --- Support -----------------------------------------------------------------------------------

export type PushSupport = 'supported' | 'unsupported' | 'install-first' | 'no-server';

export function pushSupport(): PushSupport {
  if (!API_URL) return 'no-server';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed =
    matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  // Safari only offers Web Push to apps added to the Home Screen (iOS 16.4+).
  if (ios && !installed) return 'install-first';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'supported';
}

// --- Server ------------------------------------------------------------------------------------

async function api(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_URL}/api${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(`Server upozornění odpověděl chybou ${res.status}${body?.error ? `: ${body.error}` : ''}`);
  }
  return res;
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function subscription(createIfMissing: boolean): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing || !createIfMissing) return existing;
  const { vapidPublicKey } = (await (await api('/config')).json()) as { vapidPublicKey: string };
  // Subscribing talks to the browser's push service (Apple/Google/Mozilla) and can hang when it's unreachable.
  return withTimeout(
    registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidPublicKey) }),
    20_000,
    'Prohlížeč se nedokázal spojit se službou pro oznámení. Zkuste to znovu později.'
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function upload(sub: PushSubscription) {
  const reminders = buildSchedule(await listItems());
  await api(`/devices/${deviceId()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), reminders }),
  });
}

// --- Actions -----------------------------------------------------------------------------------

/** Must be called from a tap/click: browsers only show the permission prompt for user actions. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Oznámení nejsou povolená. Povolte je v nastavení telefonu pro tuto aplikaci.');
  }
  setState({ syncing: true, error: null });
  try {
    const sub = await subscription(true);
    await upload(sub!);
    save({ deviceId: deviceId(), enabled: true });
    setState({ enabled: true, error: null });
  } finally {
    setState({ syncing: false });
  }
}

export async function disablePush(): Promise<void> {
  setState({ syncing: true, error: null });
  try {
    await api(`/devices/${deviceId()}`, { method: 'DELETE' });
    await (await subscription(false))?.unsubscribe();
    save({ deviceId: deviceId(), enabled: false });
    setState({ enabled: false });
  } finally {
    setState({ syncing: false });
  }
}

let queued: Promise<void> = Promise.resolve();

/** Re-sends the schedule. Runs one at a time; errors are kept in the state for the Settings screen. */
export function syncSchedule(): Promise<void> {
  queued = queued.then(async () => {
    if (!state.enabled || pushSupport() !== 'supported') return;
    setState({ syncing: true });
    try {
      // The browser can drop a subscription (e.g. after the permission was reset); renew it while allowed.
      const sub = await subscription(Notification.permission === 'granted');
      if (!sub) {
        save({ deviceId: deviceId(), enabled: false });
        setState({ enabled: false, error: 'Oznámení byla v telefonu vypnutá. Zapněte je znovu.' });
        return;
      }
      await upload(sub);
      setState({ error: null });
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setState({ syncing: false });
    }
  });
  return queued;
}

/** Keeps the server's schedule in step with the cabinet. Call once at startup. */
export function startPushSync() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCabinetChange(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncSchedule(), 800);
  });
  // Also on every start: refreshes the subscription and drops reminders whose dates passed.
  void syncSchedule();
}
