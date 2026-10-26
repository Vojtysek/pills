import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import {
  adminApi,
  describeDevice,
  savedToken,
  saveToken,
  UnauthorizedError,
  type AdminDevice,
  type AdminStats,
  type BroadcastRecord,
} from '../lib/admin-api.ts';

// Admin dashboard for the push server: statistics, broadcasts and the list of devices with notifications on.
// Loaded lazily (see AdminRoute in layout.tsx), so regular users never download it.

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(savedToken);

  function logout() {
    saveToken(null);
    setToken(null);
  }

  return (
    <div className="page admin">
      <div className="page-header">
        <h1>Administrace</h1>
        {token ? (
          <button className="button secondary" type="button" onClick={logout}>
            Odhlásit
          </button>
        ) : (
          <Link className="back" to="/">
            Do aplikace
          </Link>
        )}
      </div>
      {token ? (
        <Dashboard token={token} onUnauthorized={logout} />
      ) : (
        <Login
          onLogin={(t) => {
            saveToken(t);
            setToken(t);
          }}
        />
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.stats(value.trim()); // verifies the token
      onLogin(value.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="token">Přístupový klíč (ADMIN_TOKEN ze serveru)</label>
        <input
          id="token"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      {error && <p className="small error">{error}</p>}
      <button className="button" type="submit" disabled={busy || !value.trim()}>
        {busy ? 'Ověřuji…' : 'Přihlásit'}
      </button>
    </form>
  );
}

type Data = { stats: AdminStats; devices: AdminDevice[]; broadcasts: BroadcastRecord[] };

function Dashboard({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof UnauthorizedError) onUnauthorized();
      else setError(e instanceof Error ? e.message : String(e));
    },
    [onUnauthorized]
  );

  // Bumped to reload everything after an action.
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    Promise.all([adminApi.stats(token), adminApi.devices(token), adminApi.broadcasts(token)]).then(
      ([stats, devices, broadcasts]) => {
        if (!active) return;
        setData({ stats, devices, broadcasts });
        setError(null);
      },
      (e) => active && handle(e)
    );
    return () => {
      active = false;
    };
  }, [token, handle, version]);

  if (!data) return error ? <p className="error">{error}</p> : <p className="muted">Načítám…</p>;

  return (
    <>
      {error && <p className="small error">{error}</p>}
      <Stats stats={data.stats} devices={data.devices} onRefresh={reload} />
      <BroadcastForm token={token} deviceCount={data.stats.devices} onSent={reload} onError={handle} />
      <Devices token={token} devices={data.devices} onChange={reload} onError={handle} />
      <History broadcasts={data.broadcasts} />
    </>
  );
}

function Stats({ stats, devices, onRefresh }: { stats: AdminStats; devices: AdminDevice[]; onRefresh: () => void }) {
  const byPlatform = countBy(devices.map((d) => describeDevice(d.userAgent, d.pushService).split(' · ')[0]));
  const delivered = (kind: keyof AdminStats['delivered']) => {
    const d = stats.delivered[kind];
    return d ? `${d.ok}${d.failed ? ` (${d.failed} chyb)` : ''}` : '0';
  };
  return (
    <section>
      <div className="page-header">
        <h2>Přehled</h2>
        <button className="button secondary" type="button" onClick={onRefresh}>
          Obnovit
        </button>
      </div>
      <div className="stats">
        <Stat label="Zařízení s upozorněním" value={String(stats.devices)} />
        <Stat label="Naplánovaná upozornění" value={String(stats.scheduledReminders)} />
        <Stat label="Nejbližší upozornění" value={stats.nextReminderAt ? formatDate(stats.nextReminderAt) : '—'} />
        <Stat label="Odesláno za 7 dní" value={delivered('reminder')} hint="upozornění na expiraci" />
        <Stat label="Hromadné zprávy (7 dní)" value={delivered('broadcast')} />
        <Stat label="Testovací (7 dní)" value={delivered('test')} />
      </div>
      {byPlatform.length > 0 && (
        <p className="small muted">{byPlatform.map(([name, n]) => `${name}: ${n}`).join(' · ')}</p>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="small muted">{label}</span>
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

const LINKS = [
  { url: '/', label: 'Lékárnička' },
  { url: '/symptoms', label: 'Potíže' },
  { url: '/settings', label: 'Nastavení' },
  { url: '/add', label: 'Přidat lék' },
];

function BroadcastForm({
  token,
  deviceCount,
  onSent,
  onError,
}: {
  token: string;
  deviceCount: number;
  onSent: () => void;
  onError: (e: unknown) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirm(`Odeslat oznámení „${title}“ na ${deviceCount} zařízení?`)) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await adminApi.broadcast(token, { title: title.trim(), body: body.trim(), url });
      setResult(
        `Odesláno: ${r.sent}` + (r.failed ? `, chyby: ${r.failed}` : '') + (r.gone ? `, odhlášená zařízení odebrána: ${r.gone}` : '')
      );
      setTitle('');
      setBody('');
      onSent();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Hromadné oznámení</h2>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="b-title">Nadpis ({title.length}/100)</label>
          <input id="b-title" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="b-body">Text ({body.length}/300)</label>
          <textarea id="b-body" rows={3} maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="b-url">Po klepnutí otevřít</label>
          <select id="b-url" value={url} onChange={(e) => setUrl(e.target.value)}>
            {LINKS.map((l) => (
              <option key={l.url} value={l.url}>
                {l.label} ({l.url})
              </option>
            ))}
          </select>
        </div>
        <button className="button" type="submit" disabled={busy || !title.trim() || !body.trim() || deviceCount === 0}>
          {busy ? 'Odesílám…' : `Odeslat všem (${deviceCount})`}
        </button>
        {result && <p className="small muted">{result}</p>}
      </form>
    </section>
  );
}

function Devices({
  token,
  devices,
  onChange,
  onError,
}: {
  token: string;
  devices: AdminDevice[];
  onChange: () => void;
  onError: (e: unknown) => void;
}) {
  const [status, setStatus] = useState<Record<string, string>>({});

  async function test(device: AdminDevice) {
    setStatus((s) => ({ ...s, [device.id]: 'Odesílám…' }));
    try {
      const r = await adminApi.testDevice(token, device.id);
      setStatus((s) => ({ ...s, [device.id]: r.sent ? 'Odesláno' : r.gone ? 'Zařízení se odhlásilo' : 'Nepodařilo se' }));
      if (r.gone) onChange();
    } catch (e) {
      setStatus((s) => ({ ...s, [device.id]: '' }));
      onError(e);
    }
  }

  async function remove(device: AdminDevice) {
    if (!confirm('Odebrat zařízení? Přestanou mu chodit upozornění, dokud je uživatel znovu nezapne.')) return;
    try {
      await adminApi.deleteDevice(token, device.id);
      onChange();
    } catch (e) {
      onError(e);
    }
  }

  return (
    <section>
      <h2>Zařízení ({devices.length})</h2>
      {devices.length === 0 && <p className="small muted">Zatím nikdo nemá zapnutá upozornění.</p>}
      <ul className="list">
        {devices.map((d) => (
          <li key={d.id} className="card device">
            <div className="device-head">
              <span className="row-title">{describeDevice(d.userAgent, d.pushService)}</span>
              <code className="muted">{d.id.slice(0, 8)}…</code>
            </div>
            <p className="small muted">
              Přidáno {formatDate(d.createdAt)} · naposledy aktivní {formatDate(d.lastSeenAt)}
              <br />
              Upozornění: {d.reminders}
              {d.nextReminderAt ? ` · nejbližší ${formatDate(d.nextReminderAt)}` : ''}
            </p>
            <div className="device-actions">
              <button className="button secondary" type="button" onClick={() => test(d)}>
                Test
              </button>
              <button className="button danger" type="button" onClick={() => remove(d)}>
                Odebrat
              </button>
              {status[d.id] && <span className="small muted">{status[d.id]}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function History({ broadcasts }: { broadcasts: BroadcastRecord[] }) {
  if (broadcasts.length === 0) return null;
  return (
    <section>
      <h2>Odeslané hromadné zprávy</h2>
      <ul className="list">
        {broadcasts.map((b) => (
          <li key={b.id} className="card">
            <span className="row-title">{b.title}</span>
            <p className="small">{b.body}</p>
            <p className="small muted">
              {formatDate(b.at)} · odkaz {b.url} · doručeno {b.sent}
              {b.failed ? ` · chyby ${b.failed}` : ''}
              {b.gone ? ` · odhlášeno ${b.gone}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function countBy(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}
