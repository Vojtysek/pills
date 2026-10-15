# Lékárnička

A web app (PWA) for a home medicine cabinet: add medicines by searching by name or active substance,
track expiry dates with push reminders, and find what you have at home for a given complaint
("what helps with a headache?"). Data comes from SÚKL, the Czech State Institute for Drug Control.

It installs from the browser ("Add to Home Screen" on iPhone, "Install app" on Android), works offline,
and needs no app store.

## Getting started

Requirements: Node.js ≥ 22.12.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm test           # unit tests (Vitest)
npm run typecheck
npm run lint       # oxlint
npm run build      # production build into dist/, including the service worker
npm run preview    # serve the production build locally
```

## Deployment (Vercel)

Import the repository in Vercel. `vercel.json` sets the build, routes every path to the app and makes sure
the service worker is never cached. Then:

1. Add the environment variable `VITE_NTFY_URL` (your ntfy server, see `.env.example`).
2. Add your domain in Vercel → Project → Domains.

## How it works

### Data

SÚKL publishes the full medicines database monthly as
[open data](https://opendata.sukl.cz/?q=katalog/databaze-lecivych-pripravku-dlp). `scripts/build-data.ts`
converts the export into `public/data/sukl-YYYY-MM.json`: ~64k medicines (~70k registrations, with the
same medicine and pack size merged), ~8 MB, ~0.9 MB over the wire. The app loads it once and searches it in
memory; the service worker precaches it, so the app works offline from the first visit.

To update the data when a new month is published:

```bash
npm run build-data -- https://opendata.sukl.cz/soubory/SOD20260925/DLP20260925.zip   # zip URL, local zip, or extracted folder
```

The [SÚKL REST API](https://prehledy.sukl.cz/docs/?url=/dlp.api.json) can't be called from a browser (no CORS
headers), so it's used only to link to the patient leaflet PDF (`/dokumenty/{kodSukl}/pil`).

### The cabinet

Stored in the browser's IndexedDB (`src/db/cabinet.ts`) and never sent anywhere. Settings → Záloha exports
and restores it as JSON. On iPhone, data of a web app added to the Home Screen is kept; in a plain Safari tab
it may be cleared after weeks of not using the site.

### Expiry reminders (ntfy)

Reminders are scheduled as delayed messages on an [ntfy](https://ntfy.sh) server, 30 days before expiry and
the morning after (`src/lib/reminders.ts`). Each user gets a random topic and subscribes to it in the ntfy app.
Each reminder has a fixed sequence ID per item, so editing an item reschedules it and deleting cancels it.

Requirements for the ntfy server (`server.yml`):

```yaml
message-delay-limit: 8760h            # allow scheduling a year ahead; the default is 3 days
upstream-base-url: "https://ntfy.sh"  # instant delivery to the ntfy iOS app from a self-hosted server
```

and ntfy ≥ 2.16 (cancelling scheduled messages). The public ntfy.sh keeps the 3-day limit, so reminders need
a self-hosted server.

### Identifying a medicine

Barcodes can't identify a product: SÚKL publishes no barcode → product mapping (the `EAN` column in the open
data is empty), the 2D DataMatrix doesn't contain the SÚKL code, and almost no OTC packs carry it. Medicines are
added by searching by name or active substance instead.

**Planned: reading the box from a photo.** The matching logic is written and unit-tested (`src/lib/ocr.ts`:
finds product names, EXP, LOT and a printed "Kód SÚKL" in recognized text). In the browser, OCR can run with
Tesseract.js.

### Symptom search

`src/data/symptoms.ts` maps everyday complaints to ATC drug groups (e.g. headache → N02B, M01AE). The app shows
matching medicines from the cabinet, then OTC products sold in pharmacies. The mapping is hand-curated and is
not medical advice.

## Project structure

```
scripts/build-data.ts       SÚKL open data → public/data/sukl-YYYY-MM.json
src/main.tsx                routes
src/layout.tsx              tab bar, loading and error screens
src/pages/                  screens: cabinet, add, item, product, symptoms, settings
src/db/reference.ts         SÚKL data: loading and in-memory search
src/db/cabinet.ts           user's cabinet (IndexedDB)
src/lib/reminders.ts        ntfy scheduling
src/lib/expiry.ts           expiry dates and reminder times
src/lib/variants.ts         merging registrations of the same medicine
src/lib/ocr.ts              recognized text → name, EXP, LOT, SÚKL code (not in the UI yet)
src/data/symptoms.ts        complaint → ATC group mapping
```
