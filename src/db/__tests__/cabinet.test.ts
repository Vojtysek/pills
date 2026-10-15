import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

import { addItem, deleteItem, getItem, listItems, replaceAll, updateItem } from '../cabinet.ts';

const base = { sukl: null, detail: null, atc: null, note: null };

describe('cabinet', () => {
  it('stores, sorts, updates and deletes items', async () => {
    const later = await addItem({ ...base, name: 'Paralen', expiresOn: '2028-11-30' });
    await addItem({ ...base, name: 'Náplasti', expiresOn: null });
    const sooner = await addItem({ ...base, name: 'Hylak forte', expiresOn: '2027-08-31' });

    expect(sooner.id).toBeGreaterThan(later.id);
    // Soonest expiry first, undated last.
    expect((await listItems()).map((i) => i.name)).toEqual(['Hylak forte', 'Paralen', 'Náplasti']);

    await updateItem({ ...later, expiresOn: '2026-12-31' });
    expect((await listItems())[0].name).toBe('Paralen');

    await deleteItem(sooner.id);
    expect(await getItem(sooner.id)).toBeUndefined();
  });

  it('replaces everything when restoring a backup', async () => {
    await replaceAll([{ ...base, id: 7, name: 'Ze zálohy', expiresOn: null, createdAt: '2026-01-01T00:00:00Z' }]);
    expect((await listItems()).map((i) => [i.id, i.name])).toEqual([[7, 'Ze zálohy']]);
  });
});
