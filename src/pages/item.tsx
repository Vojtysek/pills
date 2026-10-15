import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ItemForm } from '../components/item-form.tsx';
import { ProductInfo } from '../components/product-info.tsx';
import { ExpiryBadge, PageHeader } from '../components/ui.tsx';
import { deleteItem, getItem, updateItem, type CabinetItem, type NewCabinetItem } from '../db/cabinet.ts';
import { useReference } from '../db/reference.ts';
import { cancelReminders, syncReminders } from '../lib/reminders.ts';

export function ItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ref = useReference();
  const [item, setItem] = useState<CabinetItem | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getItem(Number(id)).then((found) => setItem(found ?? null));
  }, [id]);

  if (item === undefined) return null;
  if (item === null) {
    return (
      <div className="page">
        <PageHeader back="/" title="Lék nenalezen" />
      </div>
    );
  }

  const product = item.sukl ? ref.byCode.get(item.sukl) : undefined;

  async function save(changes: NewCabinetItem) {
    const updated = { ...item!, ...changes };
    await updateItem(updated);
    setItem(updated);
    try {
      await syncReminders(updated);
    } catch (e) {
      // Shown by the form; the changes themselves are already saved.
      throw new Error(`Změny jsou uložené, ale upozornění se nepodařilo naplánovat: ${e instanceof Error ? e.message : e}`);
    }
    navigate(-1);
  }

  async function remove() {
    if (!confirm(`Odstranit z lékárničky?\n${item!.name}`)) return;
    try {
      await cancelReminders(item!);
    } catch (e) {
      setError(`Upozornění se nepodařilo zrušit: ${e instanceof Error ? e.message : e}`);
    }
    await deleteItem(item!.id);
    navigate('/', { replace: true });
  }

  return (
    <div className="page">
      <PageHeader back="/" title={item.name} />
      {item.detail && <p className="muted">{item.detail}</p>}
      <ExpiryBadge expiresOn={item.expiresOn} />

      <ItemForm
        key={`${item.expiresOn}-${item.note}`}
        initial={item}
        nameEditable={!item.sukl}
        submitTitle="Uložit změny"
        onSubmit={save}
      />

      {product && <ProductInfo product={product} />}

      {error && <p className="small error">{error}</p>}
      <button className="button danger" type="button" onClick={remove}>
        Odstranit z lékárničky
      </button>
    </div>
  );
}
