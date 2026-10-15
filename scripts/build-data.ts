/**
 * Builds public/data/sukl-YYYY-MM.json from the SÚKL "Databáze léčivých přípravků" open-data export.
 *
 *   npm run build-data -- <source>
 *
 * <source> is a folder with the extracted dlp_*.csv files, a local DLP*.zip, or the zip URL
 * from https://opendata.sukl.cz/?q=katalog/databaze-lecivych-pripravku-dlp (published monthly).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import {
  FLAG_MARKETED,
  FLAG_OTC,
  type IngredientRow,
  type ProductRow,
  type ReferenceData,
  type SubstanceRow,
} from '../src/data/reference-format.ts';
import { normalize } from '../src/lib/text.ts';
import { packKey } from '../src/lib/variants.ts';

// Dispensing codes that don't need a prescription (see dlp_vydej.csv).
const OTC_CODES = new Set(['F', 'V', 'O', 'P']);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'public/data');
const versionFile = join(root, 'src/data/reference-version.ts');

async function resolveCsvDir(source: string): Promise<string> {
  if (existsSync(source) && statSync(source).isDirectory()) return source;

  const work = mkdtempSync(join(tmpdir(), 'sukl-dlp-'));
  let zipPath = source;
  if (/^https?:\/\//.test(source)) {
    console.log(`Downloading ${source}`);
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    zipPath = join(work, 'dlp.zip');
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  }
  execFileSync('unzip', ['-q', '-o', zipPath, '-d', work]);
  return work;
}

function readCsv(dir: string, name: string): Record<string, string>[] {
  const text = new TextDecoder('windows-1250').decode(readFileSync(join(dir, `${name}.csv`)));
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(header.map((key, i) => [key, cells[i] ?? '']));
  });
}

// The export is ';'-separated; a few description fields are quoted.
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ';') {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function lookup(rows: Record<string, string>[], key: string, value: string): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r[key], r[value]]));
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('Usage: npm run build-data -- <csv folder | DLP zip | zip URL>');
    process.exit(1);
  }
  const dir = await resolveCsvDir(source);

  const products = readCsv(dir, 'dlp_lecivepripravky');
  const substancesByCode = new Map(readCsv(dir, 'dlp_latky').map((r) => [r.KOD_LATKY, r]));
  const organizations = new Map(readCsv(dir, 'dlp_organizace').map((r) => [`${r.ZKR_ORG}|${r.ZEM}`, r.NAZEV]));
  const [validity] = readCsv(dir, 'dlp_platnost');

  // Only active substances (S = 'L'); excipients are irrelevant for the app.
  const ingredientsBySukl = new Map<string, Record<string, string>[]>();
  for (const row of readCsv(dir, 'dlp_slozeni')) {
    if (row.S !== 'L') continue;
    const list = ingredientsBySukl.get(row.KOD_SUKL) ?? [];
    // The export sometimes repeats rows; keep the first occurrence per position.
    if (!list.some((r) => r.SQ === row.SQ)) list.push(row);
    ingredientsBySukl.set(row.KOD_SUKL, list);
  }

  const substances: SubstanceRow[] = [];
  const substanceIndex = new Map<string, number>();
  function substanceRef(code: string): number {
    let index = substanceIndex.get(code);
    if (index === undefined) {
      const s = substancesByCode.get(code);
      index = substances.push([s?.NAZEV || s?.NAZEV_INN || '', s?.NAZEV_INN ?? '', s?.NAZEV_EN ?? '']) - 1;
      substanceIndex.set(code, index);
    }
    return index;
  }

  const holders: string[] = [];
  const holderIndex = new Map<string, number>();
  function holderRef(code: string, country: string): number {
    const name = organizations.get(`${code}|${country}`);
    if (!name) return -1;
    let index = holderIndex.get(name);
    if (index === undefined) {
      index = holders.push(name) - 1;
      holderIndex.set(name, index);
    }
    return index;
  }

  // Preferred variant first: on the market, then OTC.
  const rank = (p: Record<string, string>) => (p.DODAVKY === '1' ? 0 : 2) + (OTC_CODES.has(p.VYDEJ) ? 0 : 1);
  products.sort((a, b) => rank(a) - rank(b));

  const groups = new Map<string, ProductRow>();
  for (const p of products) {
    const key = `${normalize(p.NAZEV)}|${packKey(p.DOPLNEK)}`;
    const existing = groups.get(key);
    if (existing) {
      existing[10].push(p.KOD_SUKL);
      continue;
    }
    const ingredients: IngredientRow[] = (ingredientsBySukl.get(p.KOD_SUKL) ?? [])
      .sort((a, b) => Number(a.SQ) - Number(b.SQ))
      .map((i) => [substanceRef(i.KOD_LATKY), i.AMNT, i.UN]);
    groups.set(key, [
      p.KOD_SUKL,
      p.NAZEV,
      p.DOPLNEK,
      p.FORMA,
      p.CESTA,
      p.ATC_WHO,
      p.VYDEJ,
      (OTC_CODES.has(p.VYDEJ) ? FLAG_OTC : 0) | (p.DODAVKY === '1' ? FLAG_MARKETED : 0),
      holderRef(p.DRZ, p.ZEMDRZ),
      ingredients,
      [],
    ]);
  }
  const rows = [...groups.values()].sort((a, b) => a[1].localeCompare(b[1], 'cs') || a[2].localeCompare(b[2], 'cs'));

  // Dates come as DD.MM.YYYY.
  const [, month, year] = validity.platnost_od.split('.');
  const version = `${year}-${month}`;
  const data: ReferenceData = {
    version,
    validFrom: validity.platnost_od,
    validTo: validity.platnost_do,
    substances,
    atc: lookup(readCsv(dir, 'dlp_atc'), 'ATC', 'NAZEV'),
    forms: lookup(readCsv(dir, 'dlp_formy'), 'FORMA', 'NAZEV'),
    routes: lookup(readCsv(dir, 'dlp_cesty'), 'CESTA', 'NAZEV'),
    dispensing: lookup(readCsv(dir, 'dlp_vydej'), 'VYDEJ', 'NAZEV'),
    holders,
    products: rows,
  };

  // The file name carries the version, so browsers and the service worker can cache it forever.
  mkdirSync(dataDir, { recursive: true });
  for (const old of readdirSync(dataDir).filter((f) => /^sukl-.*\.json$/.test(f))) rmSync(join(dataDir, old));
  const fileName = `sukl-${version}.json`;
  const json = JSON.stringify(data);
  writeFileSync(join(dataDir, fileName), json);

  mkdirSync(dirname(versionFile), { recursive: true });
  writeFileSync(
    versionFile,
    `// Generated by scripts/build-data.ts — do not edit.\nexport const REFERENCE_DATA_URL = '/data/${fileName}';\n`
  );

  const kb = (n: number) => `${Math.round(n / 1024)} kB`;
  console.log(
    `Wrote public/data/${fileName}: ${rows.length} medicines from ${products.length} registrations, ` +
      `${kb(json.length)} (${kb(gzipSync(json).length)} gzipped)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
