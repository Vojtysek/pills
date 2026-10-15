import { describe, expect, it } from 'vitest';

import { FLAG_MARKETED, FLAG_OTC, type ReferenceData } from '../../data/reference-format.ts';
import { buildReference, otcProductsForAtc, searchProducts } from '../reference.ts';

// A slice of the real data in the shape scripts/build-data.ts writes.
const data: ReferenceData = {
  version: '2026-10',
  validFrom: '01.10.2026',
  validTo: '31.10.2026',
  substances: [
    ['METABOLITY ESCHERICHIA COLI', 'ESCHERICHIAE COLI METABOLITA', 'ESCHERICHIA COLI METABOLITES'],
    ['PARACETAMOL', 'PARACETAMOLUM', 'PARACETAMOL'],
    ['IBUPROFEN', 'IBUPROFENUM', 'IBUPROFEN'],
  ],
  atc: { A07FA01: 'ORGANISMY PRODUKUJÍCÍ KYSELINU MLÉČNOU', N02BE01: 'PARACETAMOL' },
  forms: { 'POR SOL': 'Perorální roztok', 'TBL NOB': 'Tableta' },
  routes: { POR: 'Perorální podání' },
  dispensing: { F: 'volně prodejné léčivé přípravky', R: 'na lékařský předpis' },
  holders: ['Teva B.V., Haarlem'],
  products: [
    ['0221079', 'HYLAK FORTE', 'POR SOL 100ML', 'POR SOL', 'POR', 'A07FA01', 'F', FLAG_OTC | FLAG_MARKETED, 0, [[0, '24,948', 'G']], ['0260970']],
    ['0223199', 'HYLAK FORTE', 'POR SOL 30ML', 'POR SOL', 'POR', 'A07FA01', 'F', FLAG_OTC, 0, [[0, '24,948', 'G']], []],
    ['0254047', 'PARALEN', '500MG TBL NOB 12', 'TBL NOB', 'POR', 'N02BE01', 'F', FLAG_OTC | FLAG_MARKETED, -1, [[1, '500', 'MG']], []],
    ['0000001', 'APO-PARALEN', '500MG TBL NOB 20', 'TBL NOB', 'POR', 'N02BE01', 'R', FLAG_MARKETED, -1, [[1, '500', 'MG']], []],
    ['0267643', 'IBUPROFEN ANEOS', '400MG TBL FLM 100', 'TBL NOB', 'POR', 'M01AE01', 'R', FLAG_MARKETED, -1, [[2, '400', 'MG']], []],
  ],
};

const ref = buildReference(data);

describe('buildReference', () => {
  it('resolves codes, names and merged registrations', () => {
    const hylak = ref.byCode.get('0221079')!;
    expect(hylak).toMatchObject({
      formName: 'Perorální roztok',
      holderName: 'Teva B.V., Haarlem',
      otc: true,
      marketed: true,
      ingredients: [{ name: 'METABOLITY ESCHERICHIA COLI', amount: '24,948', unit: 'G' }],
    });
    // A merged registration's code finds the same medicine.
    expect(ref.byCode.get('0260970')).toBe(hylak);
  });
});

describe('searchProducts', () => {
  const names = (q: string) => searchProducts(ref, q).map((p) => `${p.name} ${p.supplement}`);

  it('ignores case and diacritics and matches word prefixes', () => {
    expect(names('hylák')).toEqual(['HYLAK FORTE POR SOL 100ML', 'HYLAK FORTE POR SOL 30ML']);
    expect(names('hylak 30')).toEqual(['HYLAK FORTE POR SOL 30ML']);
  });

  it('finds medicines by active substance in Czech or Latin', () => {
    expect(names('paracetamolum')).toHaveLength(2);
    expect(names('ibuprofen')).toEqual(['IBUPROFEN ANEOS 400MG TBL FLM 100']);
  });

  it('ranks names starting with the query first', () => {
    expect(names('paralen')[0]).toBe('PARALEN 500MG TBL NOB 12');
  });

  it('matches only at word starts', () => {
    expect(names('aralen')).toEqual([]);
  });
});

describe('otcProductsForAtc', () => {
  it('returns marketed OTC medicines once per name', () => {
    expect(otcProductsForAtc(ref, ['N02B', 'A07F']).map((p) => p.name)).toEqual(['HYLAK FORTE', 'PARALEN']);
  });
});
