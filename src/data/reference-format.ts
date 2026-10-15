// Shape of public/data/sukl-YYYY-MM.json, written by scripts/build-data.ts and read by src/db/reference.ts.
// Rows are tuples rather than objects to keep the download small (~0.9 MB gzipped for all ~64k medicines).

export type ReferenceData = {
  /** Month of the SÚKL export, e.g. "2026-10". */
  version: string;
  validFrom: string;
  validTo: string;
  substances: SubstanceRow[];
  atc: Record<string, string>;
  forms: Record<string, string>;
  routes: Record<string, string>;
  dispensing: Record<string, string>;
  holders: string[];
  products: ProductRow[];
};

/** Czech name, Latin INN, English name. */
export type SubstanceRow = [name: string, inn: string, en: string];

/**
 * One row per medicine and pack size. SÚKL registers the same medicine several times
 * (different holders, "100ML" vs "1X100ML"); those are merged and the preferred variant
 * (on the market, then OTC) keeps its SÚKL code. The others are listed in `otherCodes`.
 */
export type ProductRow = [
  sukl: string,
  name: string,
  supplement: string,
  form: string,
  route: string,
  atc: string,
  dispensing: string,
  flags: number,
  /** Index into `holders`, or -1. */
  holder: number,
  ingredients: IngredientRow[],
  otherCodes: string[],
];

/** Index into `substances`, amount, unit. */
export type IngredientRow = [substance: number, amount: string, unit: string];

export const FLAG_OTC = 1;
export const FLAG_MARKETED = 2;
