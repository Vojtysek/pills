import { useState, type ChangeEvent } from 'react';

import { listItems, replaceAll, type CabinetItem } from '../db/cabinet.ts';
import { useReference } from '../db/reference.ts';
import { disablePush, enablePush, pushSupport, sendTestNotification, usePushState } from '../lib/push.ts';

export function SettingsPage() {
  const ref = useReference();
  return (
    <div className="page">
      <h1>Nastavení</h1>
      <Notifications />
      <Backup />
      <h2>Data</h2>
      <p className="small muted">
        Databáze léčivých přípravků SÚKL, stav k {ref.version}. Údaje o vaší lékárničce jsou uložené jen v tomto
        prohlížeči.
      </p>
    </div>
  );
}

function Notifications() {
  const push = usePushState();
  const support = pushSupport();
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function run(action: () => Promise<void>) {
    setActionError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const test = () =>
    run(async () => {
      setTesting(true);
      try {
        await sendTestNotification();
        setNotice('Odesláno. Oznámení by mělo během pár sekund dorazit.');
      } finally {
        setTesting(false);
      }
    });

  const error = actionError ?? push.error;

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Upozornění na expiraci</h2>
      <p className="small muted">
        Pošleme oznámení 30 dní před koncem použitelnosti a den po něm. Na server odchází jen název léku a datum.
      </p>

      {support === 'install-first' && (
        <p className="small">
          Na iPhonu fungují oznámení jen z aplikace na ploše: v Safari klepněte na <b>Sdílet</b> →{' '}
          <b>Přidat na plochu</b> a otevřete Lékárničku z plochy.
        </p>
      )}
      {support === 'unsupported' && <p className="small">Tento prohlížeč oznámení nepodporuje.</p>}
      {support === 'no-server' && <p className="small muted">Oznámení nejsou v této instalaci nastavená.</p>}

      {support === 'supported' &&
        (push.enabled ? (
          <>
            <p className="small">{push.syncing ? 'Ukládám…' : 'Zapnuto'}</p>
            <button className="button secondary" type="button" disabled={push.syncing || testing} onClick={test}>
              {testing ? 'Odesílám…' : 'Poslat testovací oznámení'}
            </button>
            <button className="button danger" type="button" disabled={push.syncing} onClick={() => run(disablePush)}>
              Vypnout upozornění
            </button>
          </>
        ) : (
          <button className="button" type="button" disabled={push.syncing} onClick={() => run(enablePush)}>
            {push.syncing ? 'Zapínám…' : 'Zapnout upozornění'}
          </button>
        ))}
      {notice && <p className="small muted">{notice}</p>}
      {error && <p className="small error">{error}</p>}
    </section>
  );
}

function Backup() {
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  async function exportBackup() {
    const items = await listItems();
    const blob = new Blob([JSON.stringify({ app: 'lekarnicka', version: 1, items }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lekarnicka-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { app?: string; items?: CabinetItem[] };
      if (data.app !== 'lekarnicka' || !Array.isArray(data.items)) throw new Error('Tohle není záloha Lékárničky.');
      if (!confirm(`Nahradit současnou lékárničku zálohou (${data.items.length} léků)?`)) return;
      await replaceAll(data.items);
      setStatus({ text: `Obnoveno ${data.items.length} léků.` });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Záloha</h2>
      <p className="small muted">
        Lékárnička je uložená jen v tomto zařízení. Zálohu si můžete stáhnout a obnovit v jiném telefonu.
      </p>
      <button className="button secondary" type="button" onClick={exportBackup}>
        Stáhnout zálohu
      </button>
      <label className="button secondary">
        Obnovit ze zálohy
        <input type="file" accept="application/json,.json" hidden onChange={importBackup} />
      </label>
      {status && <p className={`small ${status.error ? 'error' : 'muted'}`}>{status.text}</p>}
    </section>
  );
}
