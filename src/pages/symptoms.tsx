import { useState } from 'react';
import { useParams } from 'react-router';

import { ExpiryBadge, PageHeader, Row } from '../components/ui.tsx';
import { SYMPTOMS } from '../data/symptoms.ts';
import { useCabinetItems, type CabinetItem } from '../db/cabinet.ts';
import { otcProductsForAtc, useReference } from '../db/reference.ts';
import { expiryStatus } from '../lib/expiry.ts';
import { normalize } from '../lib/text.ts';

export function SymptomsPage() {
  const [query, setQuery] = useState('');
  const q = normalize(query);
  const symptoms = q
    ? SYMPTOMS.filter((s) => [s.label, ...s.keywords].some((text) => normalize(text).includes(q)))
    : SYMPTOMS;

  return (
    <div className="page">
      <h1>Co mě trápí</h1>
      <div className="field">
        <input
          type="search"
          aria-label="Hledat potíže"
          placeholder="Např. hlava, kašel, průjem"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul className="list">
        {symptoms.map((s) => (
          <Row key={s.id} title={s.label} to={`/symptoms/${s.id}`} />
        ))}
      </ul>
      {symptoms.length === 0 && <p className="muted">Nic jsme nenašli. Zkuste jiné slovo.</p>}
    </div>
  );
}

export function SymptomPage() {
  const { id } = useParams();
  const symptom = SYMPTOMS.find((s) => s.id === id);
  const ref = useReference();
  const items = useCabinetItems();

  if (!symptom) {
    return (
      <div className="page">
        <PageHeader back="/symptoms" title="Nenalezeno" />
      </div>
    );
  }

  const matches = (atc: string | null) => !!atc && symptom.atcPrefixes.some((prefix) => atc.startsWith(prefix));
  const atHome = (items ?? []).filter((i) => matches(i.atc));
  const usable = atHome.filter((i) => expiryStatus(i.expiresOn) !== 'expired');
  const expired = atHome.filter((i) => expiryStatus(i.expiresOn) === 'expired');
  const otc = otcProductsForAtc(ref, symptom.atcPrefixes);

  return (
    <div className="page">
      <PageHeader back="/symptoms" title={symptom.label} />
      <p className="small muted">
        Přehled podle skupin léčiv (ATC), ne lékařská rada. Vždy si přečtěte příbalovou informaci a při vážných nebo
        přetrvávajících potížích se obraťte na lékaře nebo lékárníka.
      </p>

      <h2>Doma máte</h2>
      {items && usable.length === 0 && <p className="small muted">Nic vhodného v lékárničce nemáte.</p>}
      <ItemList items={usable} />

      {expired.length > 0 && (
        <>
          <h2>Doma, ale prošlé</h2>
          <ItemList items={expired} />
        </>
      )}

      <h2>Volně prodejné v lékárně</h2>
      <ul className="list">
        {otc.map((p) => (
          <Row key={p.sukl} title={p.name} to={`/product/${p.sukl}`} />
        ))}
      </ul>
    </div>
  );
}

function ItemList({ items }: { items: CabinetItem[] }) {
  return (
    <ul className="list">
      {items.map((item) => (
        <Row
          key={item.id}
          title={item.name}
          subtitle={item.detail}
          right={<ExpiryBadge expiresOn={item.expiresOn} />}
          to={`/item/${item.id}`}
        />
      ))}
    </ul>
  );
}
