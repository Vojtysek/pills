// Shared by the app and scripts/build-db.ts, so it must stay free of imports.

const DIACRITICS: Record<string, string> = {
  Á: 'A', Ä: 'A', Č: 'C', Ď: 'D', É: 'E', Ě: 'E', Ë: 'E', Í: 'I', Ĺ: 'L', Ľ: 'L', Ň: 'N',
  Ó: 'O', Ô: 'O', Ö: 'O', Ŕ: 'R', Ř: 'R', Š: 'S', Ť: 'T', Ú: 'U', Ů: 'U', Ü: 'U', Ý: 'Y',
  Ž: 'Z', Ł: 'L', Ś: 'S', Ź: 'Z', Ż: 'Z', Ć: 'C', Ń: 'N', Ę: 'E', Ą: 'A', Ő: 'O', Ű: 'U',
};

/** Uppercase, strip Czech/Slovak/Polish diacritics, collapse anything non-alphanumeric to one space. */
export function normalize(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^\x00-\x7F]/g, (ch) => DIACRITICS[ch] ?? ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  const normalized = normalize(input);
  return normalized ? normalized.split(' ') : [];
}
