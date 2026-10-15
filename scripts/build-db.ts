/**
 * Builds assets/db/sukl.db from the SÚKL "Databáze léčivých přípravků" open-data export.
 *
 *   npm run build-db -- <source>
 *
 * <source> is a folder with the extracted dlp_*.csv files, a local DLP*.zip, or the zip URL
 * from https://opendata.sukl.cz/?q=katalog/databaze-lecivych-pripravku-dlp (published monthly).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { normalize } from '../src/lib/text.ts';

// Dispensing codes that don't need a prescription (see dlp_vydej.csv).
const OTC_CODES = new Set(['F', 'V', 'O', 'P']);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'assets/db/sukl.db');
const versionFile = join(root, 'src/db/reference-version.ts');

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

const SCHEMA = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE product (
    sukl TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    strength TEXT NOT NULL,
    form TEXT NOT NULL,
    pack TEXT NOT NULL,
    supplement TEXT NOT NULL,
    route TEXT,
    atc TEXT,
    indication_group TEXT,
    dispensing TEXT,
    otc INTEGER NOT NULL,
    marketed INTEGER NOT NULL,
    holder TEXT,
    holder_country TEXT,
    name_key TEXT NOT NULL,
    -- ' NAME SUPPLEMENT SUBSTANCES ', padded so word-prefix search can use LIKE '% TERM%'
    search_key TEXT NOT NULL
  );
  CREATE INDEX product_name_key ON product (name_key);
  CREATE INDEX product_atc ON product (atc);
  CREATE TABLE substance (code INTEGER PRIMARY KEY, name TEXT, name_inn TEXT, name_en TEXT);
  CREATE TABLE ingredient (
    sukl TEXT NOT NULL,
    position INTEGER NOT NULL,
    substance INTEGER NOT NULL,
    amount TEXT,
    unit TEXT
  );
  CREATE INDEX ingredient_sukl ON ingredient (sukl);
  CREATE TABLE atc (code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT);
  CREATE TABLE indication_group (code TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE dispensing (code TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE form (code TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE route (code TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE organization (code TEXT, country TEXT, name TEXT NOT NULL, PRIMARY KEY (code, country));
`;

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('Usage: npm run build-db -- <csv folder | DLP zip | zip URL>');
    process.exit(1);
  }
  const dir = await resolveCsvDir(source);

  const products = readCsv(dir, 'dlp_lecivepripravky');
  const substances = new Map(readCsv(dir, 'dlp_latky').map((r) => [r.KOD_LATKY, r]));
  const [validity] = readCsv(dir, 'dlp_platnost');

  // Only active substances (S = 'L'); excipients are irrelevant for the app.
  const ingredients = readCsv(dir, 'dlp_slozeni').filter((r) => r.S === 'L');
  const ingredientsBySukl = new Map<string, Record<string, string>[]>();
  for (const row of ingredients) {
    const list = ingredientsBySukl.get(row.KOD_SUKL) ?? [];
    // The export sometimes repeats rows; keep the first occurrence per position.
    if (!list.some((r) => r.SQ === row.SQ)) list.push(row);
    ingredientsBySukl.set(row.KOD_SUKL, list);
  }

  mkdirSync(dirname(outFile), { recursive: true });
  rmSync(outFile, { force: true });
  const db = new DatabaseSync(outFile);
  db.exec(SCHEMA);
  db.exec('BEGIN');

  const insertProduct = db.prepare(
    `INSERT INTO product VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const p of products) {
    const own = ingredientsBySukl.get(p.KOD_SUKL) ?? [];
    const substanceNames = own.flatMap((i) => {
      const s = substances.get(i.KOD_LATKY);
      return s ? [s.NAZEV, s.NAZEV_INN, s.NAZEV_EN] : [];
    });
    const words = new Set(normalize([p.NAZEV, p.DOPLNEK, ...substanceNames].join(' ')).split(' '));
    const searchKey = ` ${[...words].join(' ')} `;
    insertProduct.run(
      p.KOD_SUKL,
      p.NAZEV,
      p.SILA,
      p.FORMA,
      p.BALENI,
      p.DOPLNEK,
      p.CESTA || null,
      p.ATC_WHO || null,
      p.IS_ || null,
      p.VYDEJ || null,
      OTC_CODES.has(p.VYDEJ) ? 1 : 0,
      p.DODAVKY === '1' ? 1 : 0,
      p.DRZ || null,
      p.ZEMDRZ || null,
      normalize(p.NAZEV),
      searchKey
    );
  }

  const insertIngredient = db.prepare('INSERT INTO ingredient VALUES (?, ?, ?, ?, ?)');
  const usedSubstances = new Set<string>();
  for (const [sukl, list] of ingredientsBySukl) {
    for (const i of list) {
      insertIngredient.run(sukl, Number(i.SQ), Number(i.KOD_LATKY), i.AMNT || null, i.UN || null);
      usedSubstances.add(i.KOD_LATKY);
    }
  }

  const insertSubstance = db.prepare('INSERT INTO substance VALUES (?, ?, ?, ?)');
  for (const code of usedSubstances) {
    const s = substances.get(code);
    if (s) insertSubstance.run(Number(code), s.NAZEV || null, s.NAZEV_INN || null, s.NAZEV_EN || null);
  }

  const insertAtc = db.prepare('INSERT INTO atc VALUES (?, ?, ?)');
  for (const r of readCsv(dir, 'dlp_atc')) insertAtc.run(r.ATC, r.NAZEV, r.NAZEV_EN || null);

  const insertGroup = db.prepare('INSERT INTO indication_group VALUES (?, ?)');
  for (const r of readCsv(dir, 'dlp_indikacniskupiny')) insertGroup.run(r.INDSK, r.NAZEV);

  const insertDispensing = db.prepare('INSERT INTO dispensing VALUES (?, ?)');
  for (const r of readCsv(dir, 'dlp_vydej')) insertDispensing.run(r.VYDEJ, r.NAZEV);

  const insertForm = db.prepare('INSERT INTO form VALUES (?, ?)');
  for (const r of readCsv(dir, 'dlp_formy')) insertForm.run(r.FORMA, r.NAZEV);

  const insertRoute = db.prepare('INSERT INTO route VALUES (?, ?)');
  for (const r of readCsv(dir, 'dlp_cesty')) insertRoute.run(r.CESTA, r.NAZEV);

  const insertOrganization = db.prepare('INSERT INTO organization VALUES (?, ?, ?)');
  for (const r of readCsv(dir, 'dlp_organizace')) insertOrganization.run(r.ZKR_ORG, r.ZEM, r.NAZEV);

  // Dates come as DD.MM.YYYY.
  const [, month, year] = validity.platnost_od.split('.');
  const version = `${year}-${month}`;
  const insertMeta = db.prepare('INSERT INTO meta VALUES (?, ?)');
  insertMeta.run('version', version);
  insertMeta.run('valid_from', validity.platnost_od);
  insertMeta.run('valid_to', validity.platnost_do);
  insertMeta.run('built_at', new Date().toISOString());

  db.exec('COMMIT');
  db.exec('VACUUM');
  db.close();

  // The app opens the database under a versioned file name, so a rebuilt asset replaces the old copy.
  mkdirSync(dirname(versionFile), { recursive: true });
  writeFileSync(
    versionFile,
    `// Generated by scripts/build-db.ts — do not edit.\nexport const REFERENCE_DB_VERSION = '${version}';\n`
  );

  const sizeMb = (statSync(outFile).size / 1024 / 1024).toFixed(1);
  console.log(`Wrote ${outFile} (${products.length} products, ${sizeMb} MB, data ${version})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
