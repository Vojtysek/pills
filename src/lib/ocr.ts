import { normalize } from './text';

// Pure helpers that turn OCR output (lines of text read from a photo of the box)
// into structured data. Kept free of React/Expo imports so they're unit-testable.

/** Normalizes OCR text and glues numbers to their units, so "100 ml" and "100ML" compare equal. */
export function normalizeOcr(text: string): string {
  return normalize(text).replace(/\b(\d+) (MG|ML|G|MCG|UG|IU|KS|TBL|CPS)\b/g, '$1$2');
}

const EXPIRY_LABEL = /\b(?:EXP|EXPIRY|POUZITELNE DO|SPOTREBUJTE DO|DATUM POUZITELNOSTI)\b/g;
const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/**
 * Finds the expiry date and returns it as the last valid day (YYYY-MM-DD).
 * Packs printed with only a month are valid until the end of that month.
 */
export function parseExpiry(lines: string[]): string | null {
  // EXP is often glued to the date ("EXP03/2027") or split onto the next line, so search the joined text.
  const text = normalizeOcr(lines.join(' ')).replace(/\bEXP(?=\d)/g, 'EXP ');
  for (const match of text.matchAll(EXPIRY_LABEL)) {
    const after = text.slice(match.index + match[0].length).trim().split(' ').slice(0, 3);
    const date = parseDateTokens(after);
    if (date) return date;
  }
  return null;
}

function parseDateTokens(tokens: string[]): string | null {
  const [a, b, c] = tokens;
  const n = (s: string | undefined) => (s !== undefined && /^\d+$/.test(s) ? Number(s) : NaN);

  // DD MM YYYY
  if (a?.length <= 2 && b?.length <= 2 && (c?.length === 4 || c?.length === 2)) {
    const date = buildDate(year(n(c)), n(b), n(a));
    if (date) return date;
  }
  // MM YYYY / MM YY
  if (a?.length <= 2 && (b?.length === 4 || b?.length === 2)) {
    const date = buildDate(year(n(b)), n(a));
    if (date) return date;
  }
  // YYYY MM
  if (a?.length === 4 && b?.length <= 2) {
    const date = buildDate(n(a), n(b));
    if (date) return date;
  }
  // MAR 2027
  if (a && MONTHS[a.slice(0, 3)] && b) {
    const date = buildDate(year(n(b)), MONTHS[a.slice(0, 3)]);
    if (date) return date;
  }
  return null;
}

function year(value: number): number {
  return value < 100 ? 2000 + value : value;
}

function buildDate(y: number, m: number, d?: number): string | null {
  if (!(y >= 2000 && y <= 2099 && m >= 1 && m <= 12)) return null;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = d ?? lastDay;
  if (!(day >= 1 && day <= lastDay)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Finds the batch number ("LOT", "Č.š.", "Ch.-B.", "Batch"). */
export function parseLot(lines: string[]): string | null {
  const text = normalize(lines.join(' '));
  const match = text.match(/\b(?:LOT|BATCH|C S|CH B|SARZE)\s*([A-Z0-9]*\d[A-Z0-9]*)\b/);
  return match && match[1].length >= 3 ? match[1] : null;
}

/** Finds "Kód SÚKL: 0221079" — when printed, it identifies the exact pack variant. */
export function parseSuklCode(lines: string[]): string | null {
  const match = normalize(lines.join(' ')).match(/\bSUKL(?: KOD)?\s*(\d{7})\b/);
  return match ? match[1] : null;
}

export type NameMatch = { nameKey: string; occurrences: number; firstIndex: number };

/**
 * Finds which known product names (normalized, see product.name_key) appear in the OCR text
 * as whole words. Ranked by how often they appear, then by length (PARALEN GRIP beats PARALEN).
 */
export function findNamesInText(lines: string[], nameKeys: Iterable<string>, limit = 5): NameMatch[] {
  const text = ` ${normalizeOcr(lines.join(' '))} `;
  const matches: NameMatch[] = [];
  for (const nameKey of nameKeys) {
    if (nameKey.length < 3) continue;
    const needle = ` ${nameKey} `;
    let index = text.indexOf(needle);
    if (index === -1) continue;
    const firstIndex = index;
    let occurrences = 0;
    while (index !== -1) {
      occurrences++;
      index = text.indexOf(needle, index + 1);
    }
    matches.push({ nameKey, occurrences, firstIndex });
  }
  matches.sort(
    (a, b) =>
      b.occurrences - a.occurrences || b.nameKey.length - a.nameKey.length || a.firstIndex - b.firstIndex
  );
  return dropContainedNames(matches).slice(0, limit);
}

// If both "PARALEN" and "PARALEN GRIP" matched, the shorter one is only there because of the longer one.
function dropContainedNames(matches: NameMatch[]): NameMatch[] {
  return matches.filter(
    (m) =>
      !matches.some(
        (other) => other !== m && other.nameKey.length > m.nameKey.length && ` ${other.nameKey} `.includes(` ${m.nameKey} `)
      )
  );
}

/** Words of OCR text that look like a misread product name, for a fuzzy fallback search. */
export function candidateWords(lines: string[]): string[] {
  const words = normalizeOcr(lines.join(' ')).split(' ');
  return [...new Set(words.filter((w) => w.length >= 4 && /^[A-Z]+$/.test(w)))];
}

export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * Scores how well a product variant's details ("POR SOL 100ML", "500MG TBL NOB 12")
 * agree with the OCR text: the share of its tokens that appear on the box.
 */
export function detailScore(lines: string[], supplement: string): number {
  const text = new Set(normalizeOcr(lines.join(' ')).split(' '));
  const tokens = normalizeOcr(supplement).split(' ').filter(Boolean);
  if (tokens.length === 0) return 0;
  return tokens.filter((t) => text.has(t) || text.has(t.replace(/^1X/, ''))).length / tokens.length;
}
