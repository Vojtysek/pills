import { normalize } from './text';

// SÚKL lists one product per registration, so the same medicine often appears several times:
// different marketing-authorisation holders, or "POR SOL 100ML" vs "POR SOL 1X100ML".
// For a home cabinet these are the same thing, so search shows them as one row.

/** "POR SOL 1X100ML" and "POR SOL 100ML" → same key. */
export function packKey(supplement: string): string {
  return normalize(supplement).replace(/(^| )1X(?=\d)/g, '$1');
}

/**
 * Keeps the first row of each name + pack group, so callers should pass rows already sorted
 * with the preferred variant (on the market) first.
 */
export function groupVariants<T extends { name: string; supplement: string }>(rows: T[]): (T & { variants: number })[] {
  const groups = new Map<string, T & { variants: number }>();
  for (const row of rows) {
    const key = `${normalize(row.name)}|${packKey(row.supplement)}`;
    const existing = groups.get(key);
    if (existing) existing.variants++;
    else groups.set(key, { ...row, variants: 1 });
  }
  return [...groups.values()];
}
