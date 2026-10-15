import { leafletUrl, type Product } from '../db/reference.ts';

export function ProductInfo({ product }: { product: Product }) {
  return (
    <div className="facts">
      <h2>Složení</h2>
      {product.ingredients.length > 0 ? (
        product.ingredients.map((i, index) => (
          <p key={index} className="small">
            {i.name}
            {i.amount ? ` — ${i.amount} ${i.unit}` : ''}
          </p>
        ))
      ) : (
        <p className="small muted">Neuvedeno</p>
      )}

      <h2>O přípravku</h2>
      <Fact label="Skupina" value={product.atcName && `${product.atcName} (${product.atc})`} />
      <Fact label="Léková forma" value={product.formName} />
      <Fact label="Podání" value={product.routeName} />
      <Fact label="Výdej" value={product.dispensingName} />
      <Fact label="Držitel registrace" value={product.holderName} />
      <Fact label="Kód SÚKL" value={product.sukl} />

      <p style={{ marginTop: 16 }}>
        <a className="button secondary" href={leafletUrl(product.sukl)} target="_blank" rel="noreferrer">
          Příbalová informace (PDF)
        </a>
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p className="small">
      <span className="muted">{label}: </span>
      {value}
    </p>
  );
}
