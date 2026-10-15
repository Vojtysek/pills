import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ItemForm } from '../components/item-form.tsx';
import { ProductInfo } from '../components/product-info.tsx';
import { ExpiryBadge, PageHeader } from '../components/ui.tsx';
import { deleteItem, getItem, updateItem, type CabinetItem, type NewCabinetItem } from '../db/cabinet.ts';
import { useReference } from '../db/reference.ts';

export function ItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ref = useReference();
  const [item, setItem] = useState<CabinetItem | null | undefined>(undefined);

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
    navigate(-1);
  }

  async function remove() {
    if (!confirm(`Odstranit z lékárničky?\n${item!.name}`)) return;
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

      <button className="button danger" type="button" onClick={remove}>
        Odstranit z lékárničky
      </button>
    </div>
  );
}
