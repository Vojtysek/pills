import { openDB, type DBSchema } from 'idb';
import { useEffect, useState } from 'react';

// The user's medicine cabinet, stored in the browser (IndexedDB). Nothing leaves the device
// except reminder texts sent to the user's own ntfy server (see lib/reminders.ts).

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

const dbPromise = openDB<CabinetSchema>('lekarnicka', 1, {
  upgrade(db) {
    db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
  },
});

const changes = new EventTarget();

function notifyChange() {
  changes.dispatchEvent(new Event('change'));
}

/** Soonest expiry first; items without a date at the end. */
export async function listItems(): Promise<CabinetItem[]> {
  const items = await (await dbPromise).getAll('items');
  return items.sort(
    (a, b) =>
      (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999') || a.name.localeCompare(b.name, 'cs')
  );
}

export async function getItem(id: number): Promise<CabinetItem | undefined> {
  return (await dbPromise).get('items', id);
}

export async function addItem(item: NewCabinetItem): Promise<CabinetItem> {
  const db = await dbPromise;
  const draft = { ...item, createdAt: new Date().toISOString() } as Omit<CabinetItem, 'id'>;
  // autoIncrement assigns the id when the key is missing.
  const id = await db.add('items', draft as CabinetItem);
  notifyChange();
  return { ...draft, id };
}

export async function updateItem(item: CabinetItem): Promise<void> {
  await (await dbPromise).put('items', item);
  notifyChange();
}

export async function deleteItem(id: number): Promise<void> {
  await (await dbPromise).delete('items', id);
  notifyChange();
}

/** Replaces the whole cabinet, e.g. when restoring a backup. */
export async function replaceAll(items: CabinetItem[]): Promise<void> {
  const db = await dbPromise;
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
    changes.addEventListener('change', load);
    return () => {
      active = false;
      changes.removeEventListener('change', load);
    };
  }, []);
  return items;
}
