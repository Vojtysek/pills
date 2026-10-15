import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import {
  candidateWords,
  detailScore,
  editDistance,
  findNamesInText,
  parseExpiry,
  parseLot,
  parseSuklCode,
} from '@/lib/ocr';
import { tokenize } from '@/lib/text';
import { groupVariants } from '@/lib/variants';

// Read-only access to the bundled SÚKL database (assets/db/sukl.db, built by scripts/build-db.ts).

export const SUKL_API = 'https://prehledy.sukl.cz/dlp/v1';

export function useReferenceDb(): SQLiteDatabase {
  return useSQLiteContext();
}

export type ProductSummary = {
  sukl: string;
  name: string;
  supplement: string;
  atc: string | null;
  otc: number;
  marketed: number;
};

export type ProductDetail = ProductSummary & {
  strength: string;
  formName: string | null;
  routeName: string | null;
  atcName: string | null;
  dispensingName: string | null;
  holderName: string | null;
  ingredients: { name: string; amount: string | null; unit: string | null }[];
};

const SUMMARY_COLUMNS = 'p.sukl, p.name, p.supplement, p.atc, p.otc, p.marketed';

/**
 * Every word of the query must start a word of the name, pack details or active substance.
 * Registrations of the same medicine and pack size are merged into one row (see groupVariants).
 */
export async function searchProducts(db: SQLiteDatabase, query: string, limit = 50): Promise<ProductSummary[]> {
  const words = tokenize(query);
  if (words.length === 0) return [];
  const where = words.map(() => 'p.search_key LIKE ?').join(' AND ');
  // Grouped by name in SQL order so all variants of one medicine are fetched together,
  // marketed ones first within each name; extra rows make up for the merging.
  const rows = await db.getAllAsync<ProductSummary>(
    `SELECT ${SUMMARY_COLUMNS} FROM product p
     WHERE ${where}
     ORDER BY p.name_key LIKE ? DESC, p.name_key, p.marketed DESC, p.otc DESC, p.supplement
     LIMIT ?`,
    [...words.map((w) => `% ${w}%`), `${words[0]}%`, limit * 4]
  );
  return groupVariants(rows)
    .sort((a, b) => b.marketed - a.marketed)
    .slice(0, limit);
}

export async function getProduct(db: SQLiteDatabase, sukl: string): Promise<ProductDetail | null> {
  const product = await db.getFirstAsync<Omit<ProductDetail, 'ingredients'>>(
    `SELECT ${SUMMARY_COLUMNS}, p.strength,
       f.name AS formName, r.name AS routeName, a.name AS atcName, d.name AS dispensingName, o.name AS holderName
     FROM product p
     LEFT JOIN form f ON f.code = p.form
     LEFT JOIN route r ON r.code = p.route
     LEFT JOIN atc a ON a.code = p.atc
     LEFT JOIN dispensing d ON d.code = p.dispensing
     LEFT JOIN organization o ON o.code = p.holder AND o.country = p.holder_country
     WHERE p.sukl = ?`,
    [sukl]
  );
  if (!product) return null;
  const ingredients = await db.getAllAsync<ProductDetail['ingredients'][number]>(
    `SELECT COALESCE(s.name, s.name_inn) AS name, i.amount, i.unit
     FROM ingredient i JOIN substance s ON s.code = i.substance
     WHERE i.sukl = ? ORDER BY i.position`,
    [sukl]
  );
  return { ...product, ingredients };
}

/** OTC products on the market in the given ATC groups, one row per product name. */
export async function getOtcProductsForAtc(db: SQLiteDatabase, atcPrefixes: string[]): Promise<ProductSummary[]> {
  if (atcPrefixes.length === 0) return [];
  const where = atcPrefixes.map(() => 'p.atc LIKE ?').join(' OR ');
  return db.getAllAsync<ProductSummary>(
    `SELECT ${SUMMARY_COLUMNS} FROM product p
     WHERE p.otc = 1 AND p.marketed = 1 AND (${where})
     GROUP BY p.name_key
     ORDER BY p.name_key`,
    atcPrefixes.map((prefix) => `${prefix}%`)
  );
}

export type PhotoMatch = {
  candidates: ProductSummary[];
  expiresOn: string | null;
  lot: string | null;
};

let nameKeys: string[] | null = null;

async function getNameKeys(db: SQLiteDatabase): Promise<string[]> {
  if (!nameKeys) {
    const rows = await db.getAllAsync<{ name_key: string }>('SELECT DISTINCT name_key FROM product');
    nameKeys = rows.map((r) => r.name_key);
  }
  return nameKeys;
}

/**
 * Turns text read from a photo of the box into ranked product candidates plus expiry and LOT.
 * 1. A printed SÚKL code identifies the exact variant.
 * 2. Otherwise find known product names in the text and rank their variants by pack details.
 * 3. If no name matched exactly, retry with words one OCR typo away from a name's first word.
 */
export async function matchPhoto(db: SQLiteDatabase, lines: string[]): Promise<PhotoMatch> {
  const expiresOn = parseExpiry(lines);
  const lot = parseLot(lines);

  const sukl = parseSuklCode(lines);
  if (sukl) {
    const exact = await db.getAllAsync<ProductSummary>(`SELECT ${SUMMARY_COLUMNS} FROM product p WHERE p.sukl = ?`, [sukl]);
    if (exact.length > 0) return { candidates: exact, expiresOn, lot };
  }

  const keys = await getNameKeys(db);
  let names = findNamesInText(lines, keys).map((m) => m.nameKey);
  if (names.length === 0) names = fuzzyNames(lines, keys);
  if (names.length === 0) return { candidates: [], expiresOn, lot };

  const rows = await db.getAllAsync<ProductSummary>(
    `SELECT ${SUMMARY_COLUMNS} FROM product p WHERE p.name_key IN (${names.map(() => '?').join(', ')})`,
    names
  );
  const rank = (p: ProductSummary) => names.indexOf(normalizeName(p.name));
  const candidates = rows
    .map((p) => ({ p, score: detailScore(lines, p.supplement) }))
    .sort((a, b) => rank(a.p) - rank(b.p) || b.score - a.score || b.p.marketed - a.p.marketed)
    .map(({ p }) => p)
    .slice(0, 20);
  return { candidates, expiresOn, lot };
}

function normalizeName(name: string): string {
  return tokenize(name).join(' ');
}

function fuzzyNames(lines: string[], keys: string[], limit = 5): string[] {
  const words = candidateWords(lines);
  const found: string[] = [];
  for (const key of keys) {
    const first = key.split(' ')[0];
    if (first.length >= 4 && words.some((w) => Math.abs(w.length - first.length) <= 1 && editDistance(w, first) <= 1)) {
      found.push(key);
      if (found.length >= limit) break;
    }
  }
  return found;
}

export function leafletUrl(sukl: string): string {
  return `${SUKL_API}/dokumenty/${sukl}/pil`;
}
