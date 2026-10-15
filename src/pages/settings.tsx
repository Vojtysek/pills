import { useState, type ChangeEvent } from 'react';

import { listItems, replaceAll, type CabinetItem } from '../db/cabinet.ts';
import { useReference } from '../db/reference.ts';
import {
  cancelReminders,
  loadSettings,
  newSettings,
  saveSettings,
  sendTestReminder,
  syncReminders,
  type ReminderSettings,
} from '../lib/reminders.ts';

export function SettingsPage() {
  const ref = useReference();
  return (
    <div className="page">
      <h1>Nastavení</h1>
      <Reminders />
      <Backup />
      <h2>Data</h2>
      <p className="small muted">
        Databáze léčivých přípravků SÚKL, stav k {ref.version}. Údaje o vaší lékárničce jsou uložené jen v tomto
        prohlížeči.
      </p>
    </div>
  );
}

function Reminders() {
  const [saved, setSaved] = useState<ReminderSettings | null>(loadSettings);
  const [draft, setDraft] = useState<ReminderSettings>(() => saved ?? newSettings());
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setStatus(null);
    try {
      setStatus({ text: await action() });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  const enable = () =>
    run(async () => {
      const settings = { server: draft.server.trim(), topic: draft.topic.trim() };
      await sendTestReminder(settings);
      saveSettings(settings);
      setSaved(settings);
      const items = await listItems();
      for (const item of items) await syncReminders(item);
      return `Zapnuto. Odeslali jsme testovací zprávu a naplánovali upozornění pro ${items.length} léků.`;
    });

  const disable = () =>
    run(async () => {
      for (const item of await listItems()) await cancelReminders(item);
      saveSettings(null);
      setSaved(null);
      return 'Upozornění jsou vypnutá a naplánované zprávy zrušené.';
    });

  const subscribeUrl = saved ? `${saved.server.replace(/\/+$/, '')}/${saved.topic}` : null;

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Upozornění na expiraci</h2>
      <p className="small muted">
        Upozornění posílá server{' '}
        <a href="https://ntfy.sh" target="_blank" rel="noreferrer">
          ntfy
        </a>{' '}
        30 dní před expirací a den po ní. Do telefonu si nainstalujte aplikaci ntfy a přihlaste se k odběru svého
        tématu.
      </p>

      {saved ? (
        <>
          <p className="small">
            Zapnuto · server <code>{saved.server}</code>
            <br />
            Téma: <code>{saved.topic}</code>
          </p>
          <p className="small muted">
            V aplikaci ntfy: <i>Přidat odběr</i> → zadejte téma výše a u „Použít jiný server“ adresu serveru. Nebo
            otevřete{' '}
            <a href={subscribeUrl!} target="_blank" rel="noreferrer">
              téma v prohlížeči
            </a>
            .
          </p>
          <button className="button secondary" type="button" disabled={busy} onClick={() => run(async () => {
            await sendTestReminder(saved);
            return 'Testovací zpráva odeslána.';
          })}>
            Poslat testovací zprávu
          </button>
          <button className="button danger" type="button" disabled={busy} onClick={disable}>
            Vypnout upozornění
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="server">Adresa serveru ntfy</label>
            <input
              id="server"
              type="url"
              placeholder="https://ntfy.example.cz"
              value={draft.server}
              onChange={(e) => setDraft({ ...draft, server: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="topic">Téma (funguje jako heslo — nesdílejte ho)</label>
            <input
              id="topic"
              autoComplete="off"
              value={draft.topic}
              onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
            />
          </div>
          <button
            className="button"
            type="button"
            disabled={busy || !/^https?:\/\/\S+$/.test(draft.server.trim()) || !/^[\w-]{1,64}$/.test(draft.topic.trim())}
            onClick={enable}>
            Zapnout upozornění
          </button>
        </>
      )}
      {status && <p className={`small ${status.error ? 'error' : 'muted'}`}>{status.text}</p>}
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
      for (const item of await listItems()) await cancelReminders(item).catch(() => {});
      await replaceAll(data.items);
      for (const item of data.items) await syncReminders(item).catch(() => {});
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
