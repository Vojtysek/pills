import {
  candidateWords,
  detailScore,
  editDistance,
  findNamesInText,
  parseExpiry,
  parseLot,
  parseSuklCode,
} from '../ocr';

// Roughly what ML Kit returns for the side of a Hylak forte box (LOT from a real pack, EXP made up).
const hylakBox = [
  'Hylak® forte',
  'perorální roztok',
  '100 ml',
  'Escherichiae coli metabolita',
  'Kód SÚKL: 0221079',
  'LOT: B60267A',
  'EXP: 08/2027',
];

describe('parseExpiry', () => {
  it.each([
    [['EXP: 08/2027'], '2027-08-31'],
    [['EXP 02 2028'], '2028-02-29'],
    [['EXP03/2027'], '2027-03-31'],
    [['EXP', '2027-03'], '2027-03-31'],
    [['EXP 15.03.2027'], '2027-03-15'],
    [['Použitelné do: 11/27'], '2027-11-30'],
    [['EXP MAR 2027'], '2027-03-31'],
  ])('%j → %s', (lines, expected) => {
    expect(parseExpiry(lines)).toBe(expected);
  });

  it('ignores dates without an expiry label', () => {
    expect(parseExpiry(['Vyrobeno 03/2024'])).toBeNull();
  });

  it('rejects impossible months', () => {
    expect(parseExpiry(['EXP 13/2027'])).toBeNull();
  });
});

describe('parseLot', () => {
  it.each([
    [['LOT: B60267A'], 'B60267A'],
    [['LOTB60267A'], 'B60267A'],
    [['Č.š.: 2K4471'], '2K4471'],
    [['Ch.-B.: 123456'], '123456'],
  ])('%j → %s', (lines, expected) => {
    expect(parseLot(lines)).toBe(expected);
  });

  it('returns null when there is no batch label', () => {
    expect(parseLot(['Hylak forte'])).toBeNull();
  });
});

describe('parseSuklCode', () => {
  it('reads the printed SÚKL code', () => {
    expect(parseSuklCode(hylakBox)).toBe('0221079');
    expect(parseSuklCode(['SÚKL kód 0254047'])).toBe('0254047');
  });

  it('does not pick up other 7-digit numbers', () => {
    expect(parseSuklCode(['Reg. č. 1234567'])).toBeNull();
  });
});

describe('findNamesInText', () => {
  const names = ['HYLAK FORTE', 'HYLAK', 'PARALEN', 'PARALEN GRIP CHRIPKA A BOLEST', 'FORTE'];

  it('finds the full product name and drops names it contains', () => {
    expect(findNamesInText(hylakBox, names).map((m) => m.nameKey)).toEqual(['HYLAK FORTE']);
  });

  it('matches whole words only', () => {
    expect(findNamesInText(['PARALENKA'], names)).toEqual([]);
  });
});

describe('fuzzy fallback', () => {
  it('offers words that may be a misread name', () => {
    expect(candidateWords(['HYLAC F0RTE', '100 ml'])).toEqual(['HYLAC']);
    expect(editDistance('HYLAC', 'HYLAK')).toBe(1);
  });
});

describe('detailScore', () => {
  it('prefers the pack size printed on the box', () => {
    expect(detailScore(hylakBox, 'POR SOL 100ML')).toBeGreaterThan(detailScore(hylakBox, 'POR SOL 150ML'));
    expect(detailScore(hylakBox, 'POR SOL 1X100ML')).toBe(detailScore(hylakBox, 'POR SOL 100ML'));
  });
});
