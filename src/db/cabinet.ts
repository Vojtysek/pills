import { deleteDatabaseAsync, openDatabaseSync } from 'expo-sqlite';

import { REFERENCE_DB_VERSION } from './reference-version';

// The user's own medicine cabinet. Lives in its own database so that replacing the bundled
// SÚKL database with a newer month never touches user data.

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
  lot: string | null;
  note: string | null;
  notificationIds: string[];
  createdAt: string;
};

export type NewCabinetItem = Pick<CabinetItem, 'sukl' | 'name' | 'detail' | 'atc' | 'expiresOn' | 'lot' | 'note'>;

const MIGRATIONS = [
  `CREATE TABLE item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sukl TEXT,
    name TEXT NOT NULL,
    detail TEXT,
    atc TEXT,
    expires_on TEXT,
    lot TEXT,
    note TEXT,
    notification_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

const db = openDatabaseSync('cabinet.db');
migrate();

function migrate() {
  const { user_version: version } = db.getFirstSync<{ user_version: number }>('PRAGMA user_version')!;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[v]);
      db.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

type ItemRow = {
  id: number;
  sukl: string | null;
  name: string;
  detail: string | null;
  atc: string | null;
  expires_on: string | null;
  lot: string | null;
  note: string | null;
  notification_ids: string;
  created_at: string;
};

function toItem(row: ItemRow): CabinetItem {
  return {
    id: row.id,
    sukl: row.sukl,
    name: row.name,
    detail: row.detail,
    atc: row.atc,
    expiresOn: row.expires_on,
    lot: row.lot,
    note: row.note,
    notificationIds: JSON.parse(row.notification_ids),
    createdAt: row.created_at,
  };
}

/** Soonest expiry first; items without a date at the end. */
export async function listItems(): Promise<CabinetItem[]> {
  const rows = await db.getAllAsync<ItemRow>(
    'SELECT * FROM item ORDER BY expires_on IS NULL, expires_on, name COLLATE NOCASE'
  );
  return rows.map(toItem);
}

export async function getItem(id: number): Promise<CabinetItem | null> {
  const row = await db.getFirstAsync<ItemRow>('SELECT * FROM item WHERE id = ?', [id]);
  return row ? toItem(row) : null;
}

export async function addItem(item: NewCabinetItem): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO item (sukl, name, detail, atc, expires_on, lot, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [item.sukl, item.name, item.detail, item.atc, item.expiresOn, item.lot, item.note]
  );
  return result.lastInsertRowId;
}

export async function updateItem(id: number, item: NewCabinetItem): Promise<void> {
  await db.runAsync(
    'UPDATE item SET sukl = ?, name = ?, detail = ?, atc = ?, expires_on = ?, lot = ?, note = ? WHERE id = ?',
    [item.sukl, item.name, item.detail, item.atc, item.expiresOn, item.lot, item.note, id]
  );
}

export async function setNotificationIds(id: number, ids: string[]): Promise<void> {
  await db.runAsync('UPDATE item SET notification_ids = ? WHERE id = ?', [JSON.stringify(ids), id]);
}

export async function deleteItem(id: number): Promise<void> {
  await db.runAsync('DELETE FROM item WHERE id = ?', [id]);
}

/** Items whose ATC code falls into any of the groups (used by the symptom search). */
export async function listItemsForAtc(atcPrefixes: string[]): Promise<CabinetItem[]> {
  if (atcPrefixes.length === 0) return [];
  const where = atcPrefixes.map(() => 'atc LIKE ?').join(' OR ');
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT * FROM item WHERE ${where} ORDER BY expires_on IS NULL, expires_on`,
    atcPrefixes.map((prefix) => `${prefix}%`)
  );
  return rows.map(toItem);
}

export const referenceDbName = `sukl-${REFERENCE_DB_VERSION}.db`;

/** Deletes the copy of last month's reference database after an app update ships a newer one. */
export async function removeOutdatedReferenceDb(): Promise<void> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM setting WHERE key = 'reference_db'");
  if (row && row.value !== referenceDbName) {
    await deleteDatabaseAsync(row.value).catch(() => {});
  }
  await db.runAsync("INSERT OR REPLACE INTO setting (key, value) VALUES ('reference_db', ?)", [referenceDbName]);
}
