# Lékárnička

Mobile app for a home medicine cabinet: add medicines by searching by name or active substance,
track expiry dates with reminders, and find what you have at home for a given complaint
("what helps with a headache?"). Built with Expo (SDK 57) on data from SÚKL, the Czech State Institute
for Drug Control.

## Getting started

Requirements: Node.js ≥ 22.12 and the [Expo Go](https://expo.dev/go) app on your phone.

```bash
npm install
npx expo start          # scan the QR code with Expo Go (Android) or the Camera app (iOS)
```

The app runs entirely in Expo Go: it only uses native modules that Expo Go already contains
(`expo-sqlite`, `expo-notifications`, `expo-web-browser`).

Other commands:

```bash
npm test                # unit tests (OCR parsing, expiry logic)
npm run typecheck
npx expo lint
```

## Sharing with testers (free, iOS and Android)

The app is published with EAS Update to the `preview` channel of the Expo project
[@vojtysek/pills](https://expo.dev/accounts/vojtysek/projects/pills). Testers install
[Expo Go](https://expo.dev/go) and scan [docs/expo-go-qr.png](docs/expo-go-qr.png) (on iPhone with the Camera
app), or open this link on the phone:

```
exp://u.expo.dev/a455ff01-6209-4070-b468-f3a2b6ee42b1?channel-name=preview&runtime-version=1.0.0
```

The link always opens the latest published version. To publish changes:

```bash
npm run publish-preview -- --message "What changed"
```

The `runtime-version` in the link follows the app version in `app.json`; if you bump that version,
regenerate the link and QR code.

## How it works

### Data

SÚKL publishes the full medicines database monthly as
[open data](https://opendata.sukl.cz/?q=katalog/databaze-lecivych-pripravku-dlp). `scripts/build-db.ts`
converts that export into `assets/db/sukl.db` (~70k products, 23 MB), which ships inside the app. That gives
instant offline search by name or active substance, which the SÚKL REST API doesn't offer: the API only
looks products up by SÚKL code.

To update the data (do this when a new month is published):

```bash
npm run build-db -- https://opendata.sukl.cz/soubory/SOD20260925/DLP20260925.zip   # zip URL, local zip, or extracted folder
```

The app stores its copy under a versioned name (`sukl-YYYY-MM.db`), so a new build replaces the old data
on users' phones. User data lives in a separate `cabinet.db` and is never touched by updates.

The [SÚKL REST API](https://prehledy.sukl.cz/docs/?url=/dlp.api.json) (`prehledy.sukl.cz/dlp/v1`) is
used only to open the patient leaflet PDF (`/dokumenty/{kodSukl}/pil`).

### Identifying a medicine

Medicines are added by searching the bundled database by name or active substance
(`searchProducts` in `src/db/reference.ts`). Barcodes can't be used to identify a product directly:

- SÚKL publishes no barcode → product mapping (the `EAN` column in the open data is empty for all rows).
- The 2D DataMatrix code (EU anti-counterfeiting) doesn't contain the SÚKL code, and almost no OTC packs
  carry it (9 of ~1,270 marketed OTC products).
- Open product databases (Open Food Facts, Open Products Facts, UPCitemdb) don't cover Czech medicines.

**Planned: reading the box from a photo.** The matching logic is already written and unit-tested
(`src/lib/ocr.ts`, `matchPhoto` in `src/db/reference.ts`) but not wired into the UI, because on-device
text recognition is a native module that Expo Go doesn't include. Enabling it means adding
`expo-text-extractor` + `expo-image-picker` and switching to a development build. The pipeline:

1. On-device OCR (ML Kit / Apple Vision via `expo-text-extractor`) reads the text. Photos never leave
   the phone. Several photos can be combined (name on the front, EXP/LOT on a flap).
2. A printed "Kód SÚKL" identifies the exact variant when present.
3. Otherwise known product names are found in the text, and variants are ranked by how well their
   pack details ("POR SOL 100ML") match the text.
4. If no name matches, words one typo away from a product name are tried.
5. EXP and LOT are parsed from the text; the user confirms everything before saving.

### Symptom search

`src/data/symptoms.ts` maps everyday complaints to ATC drug groups (e.g. headache → N02B, M01AE).
The app shows matching medicines from the user's cabinet, then OTC products available in pharmacies.
The mapping is hand-curated and is not medical advice.

### Expiry reminders

Local notifications (`expo-notifications`) fire 30 days before expiry and the morning after the last
valid day. Month-only dates (`EXP 08/2027`) mean "valid until the end of that month".

## Project structure

```
scripts/build-db.ts       SÚKL open data → assets/db/sukl.db
src/app/                  screens (Expo Router)
  (tabs)/index.tsx        cabinet
  (tabs)/symptoms.tsx     "what's bothering me"
  add.tsx                 search → add to cabinet
  item/[id].tsx           cabinet item detail and edit
  product/[sukl].tsx      product detail
  symptom/[id].tsx        medicines for a complaint
src/db/reference.ts       queries on the SÚKL database
src/db/cabinet.ts         user data (separate database with migrations)
src/lib/ocr.ts            OCR text → name, EXP, LOT, SÚKL code (pure, unit-tested; not in the UI yet)
src/lib/expiry.ts         expiry dates and reminder times (pure, unit-tested)
src/lib/reminders.ts      notification scheduling
src/data/symptoms.ts      complaint → ATC group mapping
```
