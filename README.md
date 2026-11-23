# First Light

An interactive explorer built on the **public data of the James Webb Space Telescope**.
Next.js 16 (App Router, Cache Components) · React 19 · Tailwind 4 · Postgres · three.js.

| Route | What it is | Data |
| --- | --- | --- |
| `/` | Hero on Webb's First Deep Field, live archive counters, latest raw frames | MAST, ESA/Webb |
| `/scale` | Scroll journey from Earth to the cosmic microwave background, with a live light-travel odometer | ESA/Webb + cosmology |
| `/sky` | 3D celestial sphere of every public Webb pointing (2,900 sky cells, ~209k products), mission time-lapse, search, deep links; "Webb by the numbers" charts | MAST (`products`, `sky_cells`), Hipparcos/YBS stars |
| `/findings` | **Original analyses of the whole archive** (only on this site): the Sun's shadow in Webb's schedule, how long data stays exclusive, observation-to-press-image lag, ESA's filter→colour conventions, galactic-latitude bias, sky coverage & the "loneliest point", most-revisited targets, census of planets with spectra. Each has its method one click away; all recomputed from the DB (`src/lib/findings.ts`) | MAST, ESA/Webb, NASA Exoplanet Archive |
| `/gallery`, `/gallery/[id]` | ~300 curated colour images, deep-zoom viewer, filter→colour tables, aligned comparisons, raw frames behind each image | ESA/Webb, MAST |
| `/lab` | WebGL2 darkroom: build a colour composite from raw single-filter Webb frames | MAST previews, preprocessed to `public/lab` |
| `/deep-time` | Redshift time machine (lookback, distances, Lyman break, angular-size turnover, record galaxies) | Planck 2018 ΛCDM, computed in the browser |
| `/worlds` | Real JWST exoplanet transmission/eclipse spectra (~350 spectra, ~80 planets) | NASA Exoplanet Archive |
| `/archive` | Search all public products by target, programme, PI, instrument | MAST |

## Run it locally

```bash
pnpm install
pnpm dev            # boots an embedded Postgres 18 in ./.data/pg, applies db/schema.sql, starts Next on :3000
pnpm ingest         # in another terminal, first run only (~20 min): ESA gallery, exoplanet spectra, full MAST backfill
```

No database setup is needed locally: `scripts/with-db.mts` starts [`embedded-postgres`](https://github.com/leinelissen/embedded-postgres)
(UTF-8, port 54329) unless `DATABASE_URL` is set. Concurrent commands reuse the running instance.

Other scripts:

| Script | Purpose |
| --- | --- |
| `pnpm ingest:mast` | Resumable MAST backfill in monthly release windows (`--incremental` for the last 30 days) |
| `pnpm ingest:gallery` | ESA/Webb first images + Top 100 pages → `gallery_images` |
| `pnpm ingest:exo` | NASA Exoplanet Archive JWST spectra + planet parameters (resumable) |
| `pnpm lab:build` | Rebuild the Lab's aligned WebP layers in `public/lab` from MAST previews |
| `npx tsx scripts/build-sky-assets.mts` | Rebuild `public/sky/*.json` (stars, constellations) |
| `pnpm build:local` | Production build against the local database |
| `pnpm db` | Just run the embedded Postgres |

## Deploy on Vercel

1. **Database.** Add a Postgres from the Vercel Marketplace (e.g. Neon). `DATABASE_URL` is the only seam the app uses.
2. **Seed it once from your machine:** `DATABASE_URL="postgres://…" pnpm ingest`. `with-db` applies the schema to the remote database first.
3. **Env vars:** `DATABASE_URL`, `CRON_SECRET` (any long random string), optionally `NEXT_PUBLIC_SITE_URL`.
4. **Deploy.** `vercel.ts` registers a daily cron on `/api/cron/refresh`. It pulls newly public MAST products and new ESA images, and pulls exoplanet spectra on Mondays. Then it revalidates the `mast` / `gallery` / `exo` cache tags.

Pages are prerendered at build time from the database (`"use cache"` + `cacheLife`), so the database must be reachable during `next build`.
Remote images (ESA CDN, MAST previews) go through `next/image`; source images count toward Vercel's image-optimisation usage.

## Data, credits & licences

- **MAST** (Mikulski Archive for Space Telescopes, STScI): observation metadata via `Mast.Caom.Filtered`, restricted to `obs_collection=JWST`, `calib_level=3`, `intentType=science`, `dataRights=PUBLIC`. Note that a *product* is not an *observation*: NIRSpec MOS produces one spectrum per source, NIRCam one mosaic per filter.
- **ESA/Webb** images and captions are **CC BY 4.0**. Every image shows its own credit line, which is mandatory.
- **NASA Exoplanet Archive** (Caltech/IPAC): `spectra` and `pscomppars` TAP tables. Spectrum files are downloaded through the archive's workspace mechanism.
- **d3-celestial** (BSD-3) star and constellation data, derived from Hipparcos / Yale Bright Star catalogues.
- **Cosmology:** flat ΛCDM, Planck 2018 (H₀ = 67.66, Ωm = 0.3111, with radiation). See `src/lib/cosmology.ts`.

Not affiliated with NASA, ESA, CSA or STScI.

## Layout

```
db/schema.sql               idempotent schema (applied on every with-db boot)
scripts/                    with-db, ingest-*, build-lab, build-sky-assets
src/lib/ingest/             mast.ts · esa.ts · exo.ts   (shared by scripts and the cron route)
src/lib/data*.ts            cached queries ("use cache", cacheTag mast|gallery|exo)
src/lib/cosmology.ts        ΛCDM integrals, record galaxies
src/lib/instruments.ts      instrument palette (client-safe) + validated chart colours
src/components/…            sky (three.js), lab (WebGL2), gallery (zoom viewer), worlds (spectra), scale, deep-time
```
