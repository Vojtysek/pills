import { describe, expect, it } from 'vitest';

import { groupVariants, packKey } from '../variants.ts';

describe('packKey', () => {
  it('treats a single pack written as 1X the same', () => {
    expect(packKey('POR SOL 1X100ML')).toBe(packKey('POR SOL 100ML'));
  });

  it('keeps real multipacks apart', () => {
    expect(packKey('TBL NOB 10X1')).not.toBe(packKey('TBL NOB 10'));
    expect(packKey('TBL NOB 21X1')).toBe('TBL NOB 21X1');
  });
});

describe('groupVariants', () => {
  // Real Hylak forte rows from SÚKL, sorted marketed first as searchProducts returns them.
  const rows = [
    { sukl: '0221079', name: 'HYLAK FORTE', supplement: 'POR SOL 100ML', marketed: 1 },
    { sukl: '0223200', name: 'HYLAK FORTE', supplement: 'POR SOL 100ML', marketed: 1 },
    { sukl: '0260713', name: 'HYLAK FORTE', supplement: 'POR SOL 150ML', marketed: 1 },
    { sukl: '0260970', name: 'HYLAK FORTE', supplement: 'POR SOL 1X100ML', marketed: 1 },
    { sukl: '0261059', name: 'HYLAK FORTE', supplement: 'POR SOL 1X100ML', marketed: 1 },
    { sukl: '0223199', name: 'HYLAK FORTE', supplement: 'POR SOL 30ML', marketed: 0 },
    { sukl: '0221088', name: 'HYLAK FORTE', supplement: 'POR SOL 100ML', marketed: 0 },
    { sukl: '0260947', name: 'HYLAK FORTE', supplement: 'POR SOL 1X100ML', marketed: 0 },
  ];

  it('shows each pack size once, keeping the first (marketed) variant', () => {
    expect(groupVariants(rows).map((r) => [r.sukl, r.supplement, r.variants])).toEqual([
      ['0221079', 'POR SOL 100ML', 6],
      ['0260713', 'POR SOL 150ML', 1],
      ['0223199', 'POR SOL 30ML', 1],
    ]);
  });
});
