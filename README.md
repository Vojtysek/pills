# Lékárnička

A web app (PWA) for a home medicine cabinet: add medicines by searching by name or active substance,
track expiry dates with push notifications, and find what you have at home for a given complaint
("what helps with a headache?"). Data comes from SÚKL, the Czech State Institute for Drug Control.

It installs from the browser ("Add to Home Screen" on iPhone, "Install app" on Android), works offline,
and needs no app store.

## Getting started

Requirements: Node.js ≥ 22.12.

```bash
npm install
npm install --prefix server   # push server dependencies (needed for typecheck and its tests)
npm run dev                   # http://localhost:5173
```

Other commands:

```bash
npm test           # unit tests (Vitest)
npm run typecheck
npm run lint       # oxlint
npm run build      # production build into dist/, including the service worker
npm run preview    # serve the production build locally
```

## Deployment

Two parts: the web app (static files on Vercel) and a small push server (Docker on your own server) that
sends the expiry notifications.

### Push server (Docker)

Runs at `https://lekarnicka-api.nullbit.cz`: Cloudflare (proxied DNS record + an Origin Rule sending it to
port 8080) provides HTTPS in front of the container. Browsers only allow an HTTPS app to call an HTTPS API.

First install, in a copy of `server/` on the server:

```bash
umask 077
printf "VAPID_SUBJECT=https://lekarnicka.nullbit.cz\nALLOWED_ORIGINS=https://lekarnicka.nullbit.cz\n" > .env
docker compose build
docker compose run --rm --no-deps -T lekarnicka-push node -e \
  'const k=require("web-push").generateVAPIDKeys();console.log("VAPID_PUBLIC_KEY="+k.publicKey+"\nVAPID_PRIVATE_KEY="+k.privateKey)' >> .env
docker compose up -d
curl http://127.0.0.1:8080/api/health          # {"ok":true,"devices":0}
```

For the admin dashboard (`/admin` in the app: statistics, broadcasts, devices), add a token:

```bash
printf "ADMIN_TOKEN=%s\n" "$(openssl rand -base64 36 | tr '+/' '-_' | tr -d '=\n')" >> .env
docker compose up -d
grep ADMIN_TOKEN .env      # paste this value on /admin to log in
```

Keep `.env`: new VAPID keys invalidate every existing subscription. Data lives in the Docker volume
`lekarnicka-push_data` (SQLite). To update, copy the new `server/` files over and run `docker compose up -d --build`.

### Web app (Vercel)

Import the repository in Vercel. `vercel.json` sets the build, routes every path to the app and makes sure
the service worker is never cached. Then:

1. Add the environment variable `VITE_API_URL=https://lekarnicka-api.nullbit.cz` (see `.env.example`).
2. Add the domain `lekarnicka.nullbit.cz` in Vercel → Project → Domains. It must match the server's
   `ALLOWED_ORIGINS`.

Every push to the main branch deploys automatically.

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

Stored in the browser's IndexedDB (`src/db/cabinet.ts`). Only the notification schedule (medicine names and
dates) is sent to the push server, and only when notifications are on. Settings → Záloha exports
and restores it as JSON. On iPhone, data of a web app added to the Home Screen is kept; in a plain Safari tab
it may be cleared after weeks of not using the site.

### Expiry notifications (Web Push)

A web app can't schedule a notification on the phone itself, so the push server does it:

1. In Settings the user turns notifications on; the browser creates a push subscription
   (`src/lib/push.ts`).
2. After every change to the cabinet, the app sends the server its whole schedule: one reminder 30 days
   before expiry and one the morning after, with the medicine name and date only.
3. The server (`server/`) checks every minute and sends due reminders through the browser's push service
   (Apple, Google, Mozilla) with the [`web-push`](https://github.com/web-push-libs/web-push) library.
4. The service worker (`src/sw.ts`) shows the notification; tapping it opens the medicine.

On iPhone, Web Push works only for apps added to the Home Screen (iOS 16.4+); the app explains this
in Settings. Android works in the browser too.

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
src/lib/push.ts             push subscription and reminder schedule
src/pages/admin.tsx         admin dashboard (lazy-loaded at /admin)
src/sw.ts                   service worker: offline cache, showing notifications
server/                     push server (Node 24, Hono, SQLite, Docker)
src/lib/expiry.ts           expiry dates and reminder times
src/lib/variants.ts         merging registrations of the same medicine
src/lib/ocr.ts              recognized text → name, EXP, LOT, SÚKL code (not in the UI yet)
src/data/symptoms.ts        complaint → ATC group mapping
```
