import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CabinetItem } from '../../db/cabinet.ts';
import { cancelReminders, saveSettings, syncReminders } from '../reminders.ts';

const item: CabinetItem = {
  id: 3,
  sukl: '0221079',
  name: 'HYLAK FORTE',
  detail: 'POR SOL 100ML',
  atc: 'A07FA01',
  expiresOn: '2027-08-31',
  note: null,
  createdAt: '2026-10-15T12:00:00Z',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  vi.stubGlobal('location', { origin: 'https://lekarnicka.example' });
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function calls() {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url,
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(init.body) : undefined,
  }));
}

describe('syncReminders', () => {
  it('does nothing until reminders are set up', async () => {
    await syncReminders(item);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('schedules both reminders on ntfy with stable sequence ids', async () => {
    saveSettings({ server: 'https://ntfy.example.cz/', topic: 'lekarnicka-abc' });
    await syncReminders(item);

    const [soon, expired] = calls();
    expect(soon).toMatchObject({
      url: 'https://ntfy.example.cz/',
      method: 'POST',
      body: {
        topic: 'lekarnicka-abc',
        sequence_id: 'item-3-soon',
        delay: String(new Date(2027, 7, 1, 9).getTime() / 1000),
        title: 'HYLAK FORTE brzy projde',
        click: 'https://lekarnicka.example/item/3',
      },
    });
    expect(expired.body).toMatchObject({
      sequence_id: 'item-3-expired',
      delay: String(new Date(2027, 8, 1, 9).getTime() / 1000),
    });
    // text/plain avoids a CORS preflight.
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toMatch(/^text\/plain/);
  });

  it('cancels reminders whose date has passed or when the date is removed', async () => {
    saveSettings({ server: 'https://ntfy.example.cz', topic: 't' });
    await syncReminders({ ...item, expiresOn: '2026-10-20' }); // "soon" date already passed
    expect(calls().map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://ntfy.example.cz/t/item-3-soon/delete',
      'POST https://ntfy.example.cz/',
    ]);

    fetchMock.mockClear();
    await syncReminders({ ...item, expiresOn: null });
    expect(calls().map((c) => c.url)).toEqual([
      'https://ntfy.example.cz/t/item-3-soon/delete',
      'https://ntfy.example.cz/t/item-3-expired/delete',
    ]);
  });

  it('reports server errors', async () => {
    saveSettings({ server: 'https://ntfy.example.cz', topic: 't' });
    fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }));
    await expect(syncReminders(item)).rejects.toThrow('(502): Bad Gateway');
  });

  it('explains the delay limit, the usual misconfiguration', async () => {
    saveSettings({ server: 'https://ntfy.example.cz', topic: 't' });
    // The exact response ntfy.sh returns for a reminder months ahead.
    const body = '{"code":40006,"http":400,"error":"invalid delay parameter: too large, please refer to the docs"}';
    fetchMock.mockResolvedValue(new Response(body, { status: 400 }));
    await expect(syncReminders(item)).rejects.toThrow('message-delay-limit');
  });
});

describe('cancelReminders', () => {
  it('treats nothing-to-cancel as success', async () => {
    saveSettings({ server: 'https://ntfy.example.cz', topic: 't' });
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(cancelReminders(item)).resolves.toBeUndefined();
  });
});
