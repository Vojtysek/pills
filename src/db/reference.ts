import { use } from 'react';

import { FLAG_MARKETED, FLAG_OTC, type ReferenceData } from '../data/reference-format.ts';
import { REFERENCE_DATA_URL } from '../data/reference-version.ts';
import { normalize, tokenize } from '../lib/text.ts';

// Read-only SÚKL data, loaded once from public/data and searched in memory.

export type Product = {
  sukl: string;
  name: string;
  supplement: string;
  formName: string | null;
  routeName: string | null;
  atc: string | null;
  atcName: string | null;
  dispensingName: string | null;
  otc: boolean;
  marketed: boolean;
  holderName: string | null;
  ingredients: { name: string; amount: string; unit: string }[];
  /** SÚKL codes of the same medicine registered again (other holder, "1X" pack notation). */
  otherCodes: string[];
};

export type Reference = {
  version: string;
  products: Product[];
  byCode: Map<string, Product>;
  /** ' WORD WORD ' per product, aligned with `products`, for word-prefix search. */
  searchKeys: string[];
};

let loading: Promise<Reference> | null = null;

export function loadReference(): Promise<Reference> {
  loading ??= fetch(REFERENCE_DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Nepodařilo se načíst data SÚKL (${res.status})`);
      return res.json() as Promise<ReferenceData>;
    })
    .then(buildReference)
    .catch((error) => {
      loading = null; // allow a retry
      throw error;
    });
  return loading;
}

/** Suspends until the data is loaded; wrap callers in <Suspense>. */
export function useReference(): Reference {
  return use(loadReference());
}

export function buildReference(data: ReferenceData): Reference {
  const products: Product[] = [];
  const searchKeys: string[] = [];
  const byCode = new Map<string, Product>();

  for (const [sukl, name, supplement, form, route, atc, dispensing, flags, holder, ingredients, otherCodes] of data.products) {
    const substances = ingredients.map(([index]) => data.substances[index]);
    const product: Product = {
      sukl,
      name,
      supplement,
      formName: data.forms[form] ?? null,
      routeName: data.routes[route] ?? null,
      atc: atc || null,
      atcName: data.atc[atc] ?? null,
      dispensingName: data.dispensing[dispensing] ?? null,
      otc: (flags & FLAG_OTC) !== 0,
      marketed: (flags & FLAG_MARKETED) !== 0,
      holderName: data.holders[holder] ?? null,
      ingredients: ingredients.map(([index, amount, unit]) => ({ name: data.substances[index][0], amount, unit })),
      otherCodes,
    };
    products.push(product);
    const words = new Set(normalize([name, supplement, ...substances.flat()].join(' ')).split(' '));
    searchKeys.push(` ${[...words].join(' ')} `);
    byCode.set(sukl, product);
    for (const code of otherCodes) byCode.set(code, product);
  }
  return { version: data.version, products, byCode, searchKeys };
}

/**
 * Every word of the query must start a word of the name, pack details or an active substance
 * (Czech, Latin or English name). Products whose name starts with the query come first.
 */
export function searchProducts(ref: Reference, query: string, limit = 50): Product[] {
  const words = tokenize(query);
  if (words.length === 0) return [];
  const needles = words.map((w) => ` ${w}`);
  const matches: Product[] = [];
  ref.searchKeys.forEach((key, i) => {
    if (needles.every((n) => key.includes(n))) matches.push(ref.products[i]);
  });
  const nameStarts = (p: Product) => normalize(p.name).startsWith(words[0]);
  return matches
    .sort(
      (a, b) =>
        Number(nameStarts(b)) - Number(nameStarts(a)) ||
        Number(b.marketed) - Number(a.marketed) ||
        Number(b.otc) - Number(a.otc)
    )
    .slice(0, limit);
}

/** OTC medicines on the market in the given ATC groups, one per name. */
export function otcProductsForAtc(ref: Reference, atcPrefixes: string[]): Product[] {
  const seen = new Set<string>();
  return ref.products.filter((p) => {
    if (!p.otc || !p.marketed || !p.atc || !atcPrefixes.some((prefix) => p.atc!.startsWith(prefix))) return false;
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

export function leafletUrl(sukl: string): string {
  return `https://prehledy.sukl.cz/dlp/v1/dokumenty/${sukl}/pil`;
}
