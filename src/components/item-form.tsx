import { useState, type FormEvent } from 'react';

import type { NewCabinetItem } from '../db/cabinet.ts';
import { formatExpiry, parseExpiryInput } from '../lib/expiry.ts';

type Props = {
  initial: NewCabinetItem;
  /** Items from SÚKL keep their official name; custom items can be renamed. */
  nameEditable: boolean;
  submitTitle: string;
  onSubmit: (item: NewCabinetItem) => Promise<void>;
};

export function ItemForm({ initial, nameEditable, submitTitle, onSubmit }: Props) {
  const [name, setName] = useState(initial.name);
  const [expiry, setExpiry] = useState(initial.expiresOn ? formatExpiry(initial.expiresOn) : '');
  const [note, setNote] = useState(initial.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiresOn = expiry.trim() ? parseExpiryInput(expiry) : null;
  const expiryInvalid = expiry.trim() !== '' && expiresOn === null;
  const canSave = name.trim() !== '' && !expiryInvalid && !saving;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...initial, name: name.trim(), expiresOn, note: note.trim() || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {nameEditable && (
        <div className="field">
          <label htmlFor="name">Název</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
      )}
      <div className="field">
        <label htmlFor="expiry">Použitelné do (EXP)</label>
        <input
          id="expiry"
          placeholder="MM.RRRR"
          inputMode="decimal"
          autoComplete="off"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          aria-invalid={expiryInvalid}
        />
        {expiryInvalid && <p className="small error">Zadejte datum jako 08.2027 nebo 15.8.2027</p>}
      </div>
      <div className="field">
        <label htmlFor="note">Poznámka</label>
        <input
          id="note"
          placeholder="Např. pro děti, otevřeno 1. 10."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {error && <p className="small error">{error}</p>}
      <button className="button" type="submit" disabled={!canSave}>
        {saving ? 'Ukládám…' : submitTitle}
      </button>
    </form>
  );
}
