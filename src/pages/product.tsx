import { Link, useParams } from 'react-router';

import { ProductInfo } from '../components/product-info.tsx';
import { PageHeader } from '../components/ui.tsx';
import { useReference } from '../db/reference.ts';

export function ProductPage() {
  const { sukl } = useParams();
  const ref = useReference();
  const product = sukl ? ref.byCode.get(sukl) : undefined;

  if (!product) {
    return (
      <div className="page">
        <PageHeader back="/symptoms" title="Přípravek nenalezen" />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader back="/symptoms" title={product.name} />
      <p className="muted">{product.supplement}</p>
      <Link className="button" to={`/add?sukl=${product.sukl}`}>
        Přidat do lékárničky
      </Link>
      <ProductInfo product={product} />
    </div>
  );
}
