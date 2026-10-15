import { openDB, type DBSchema } from 'idb';
import { useEffect, useState } from 'react';

// The user's medicine cabinet, stored in the browser (IndexedDB). Only the reminder schedule
// (medicine names and dates) is sent to the push server, and only if notifications are on (lib/push.ts).

export type CabinetItem = {
  id: number;
  /** null for items outside the SÚKL database (supplements, plasters, devices). */
  sukl: string | null;
  name: string;
  /** Pack details shown under the name, e.g. "POR SOL 100ML". */
  detail: string | null;
  atc: string | null;
  /** Last day the pack may be used, YYYY-MM-DD. */
  expiresOn: string | null;
  note: string | null;
  createdAt: string;
};

export type NewCabinetItem = Pick<CabinetItem, 'sukl' | 'name' | 'detail' | 'atc' | 'expiresOn' | 'note'>;

interface CabinetSchema extends DBSchema {
  items: { key: number; value: CabinetItem };
}

let opening: ReturnType<typeof openDB<CabinetSchema>> | null = null;

/** Opened on first use, so importing this module has no side effects. */
function database() {
  opening ??= openDB<CabinetSchema>('lekarnicka', 1, {
    upgrade(db) {
      db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
    },
  });
  return opening;
}

const changes = new EventTarget();

function notifyChange() {
  changes.dispatchEvent(new Event('change'));
}

/** Calls `listener` after every change to the cabinet. Returns an unsubscribe function. */
export function onCabinetChange(listener: () => void): () => void {
  changes.addEventListener('change', listener);
  return () => changes.removeEventListener('change', listener);
}

/** Soonest expiry first; items without a date at the end. */
export async function listItems(): Promise<CabinetItem[]> {
  const items = await (await database()).getAll('items');
  return items.sort(
    (a, b) =>
      (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999') || a.name.localeCompare(b.name, 'cs')
  );
}

export async function getItem(id: number): Promise<CabinetItem | undefined> {
  return (await database()).get('items', id);
}

export async function addItem(item: NewCabinetItem): Promise<CabinetItem> {
  const db = await database();
  const draft = { ...item, createdAt: new Date().toISOString() } as Omit<CabinetItem, 'id'>;
  // autoIncrement assigns the id when the key is missing.
  const id = await db.add('items', draft as CabinetItem);
  notifyChange();
  return { ...draft, id };
}

export async function updateItem(item: CabinetItem): Promise<void> {
  await (await database()).put('items', item);
  notifyChange();
}

export async function deleteItem(id: number): Promise<void> {
  await (await database()).delete('items', id);
  notifyChange();
}

/** Replaces the whole cabinet, e.g. when restoring a backup. */
export async function replaceAll(items: CabinetItem[]): Promise<void> {
  const db = await database();
  const tx = db.transaction('items', 'readwrite');
  await tx.store.clear();
  for (const item of items) await tx.store.put(item);
  await tx.done;
  notifyChange();
}

/** All items, kept up to date when anything changes. `null` while loading. */
export function useCabinetItems(): CabinetItem[] | null {
  const [items, setItems] = useState<CabinetItem[] | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => listItems().then((loaded) => active && setItems(loaded));
    load();
    const unsubscribe = onCabinetChange(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return items;
}
