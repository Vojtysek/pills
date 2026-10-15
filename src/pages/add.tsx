import { useDeferredValue, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { ItemForm } from '../components/item-form.tsx';
import { PageHeader, Row } from '../components/ui.tsx';
import { addItem, type NewCabinetItem } from '../db/cabinet.ts';
import { searchProducts, useReference, type Product } from '../db/reference.ts';

type Selection = { product: Product } | { custom: string };

export function AddPage() {
  const ref = useReference();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselected = params.get('sukl');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selection, setSelection] = useState<Selection | null>(() => {
    const product = preselected ? ref.byCode.get(preselected) : undefined;
    return product ? { product } : null;
  });

  const results = searchProducts(ref, deferredQuery);

  async function save(item: NewCabinetItem) {
    await addItem(item);
    navigate('/', { replace: true });
  }

  if (selection) {
    const initial: NewCabinetItem =
      'product' in selection
        ? {
            sukl: selection.product.sukl,
            name: selection.product.name,
            detail: selection.product.supplement,
            atc: selection.product.atc,
            expiresOn: null,
            note: null,
          }
        : { sukl: null, name: selection.custom, detail: null, atc: null, expiresOn: null, note: null };
    return (
      <div className="page">
        <div className="page-header">
          <button className="button secondary" type="button" onClick={() => setSelection(null)}>
            ‹ Zpět na výběr
          </button>
        </div>
        <h1>{initial.name || 'Vlastní položka'}</h1>
        {initial.detail && <p className="muted">{initial.detail}</p>}
        {'custom' in selection && (
          <p className="small muted">
            Mimo databázi SÚKL (např. doplněk stravy nebo zdravotnická pomůcka) — nebude ve vyhledávání podle potíží.
          </p>
        )}
        <ItemForm
          initial={initial}
          nameEditable={'custom' in selection}
          submitTitle="Uložit do lékárničky"
          onSubmit={save}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader back="/" title="Přidat lék" />
      <div className="field">
        <label htmlFor="search">Název léku nebo účinná látka</label>
        <input
          id="search"
          type="search"
          placeholder="Např. Hylak, Paralen, ibuprofen"
          autoComplete="off"
          autoCorrect="off"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {results.length > 0 && <h2>Výsledky hledání</h2>}
      <ul className="list">
        {results.map((product) => (
          <Row
            key={product.sukl}
            title={product.name}
            subtitle={[product.supplement, product.marketed ? null : 'aktuálně se nedodává'].filter(Boolean).join(' · ')}
            onClick={() => setSelection({ product })}
          />
        ))}
      </ul>
      {query.trim() && results.length === 0 && <p className="muted">Nic jsme nenašli.</p>}

      <button className="button secondary" type="button" onClick={() => setSelection({ custom: query.trim() })}>
        Není v seznamu — přidat vlastní
      </button>
    </div>
  );
}
