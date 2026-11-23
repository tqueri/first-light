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
cp .env.example .env   # POSTGRES_URL defaults to the local embedded Postgres
pnpm install           # also runs `prisma generate` (client in src/generated/prisma)
pnpm dev               # boots an embedded Postgres 18 in ./.data/pg, applies Prisma migrations, starts Next on :3000
pnpm ingest            # in another terminal, first run only (~20 min): ESA gallery, exoplanet spectra, full MAST backfill
```

**Database = Prisma ORM 7 + Postgres.** The schema lives in `prisma/schema.prisma` and migrations in `prisma/migrations`;
`src/lib/db.ts` exposes the Prisma client (`@prisma/adapter-pg`). Simple reads and every write use the typed client; the
analytical queries (sky binning, angular separations, percentiles, findings) are hand-written SQL run through Prisma
(`sql()` → `$queryRawUnsafe`, always parameterised).

No database setup is needed locally: `scripts/with-db.mts` starts [`embedded-postgres`](https://github.com/leinelissen/embedded-postgres)
(UTF-8, UTC, port 54329) when `POSTGRES_URL` points at it, then runs `prisma migrate deploy`. Any other `POSTGRES_URL` is used as-is.
Concurrent commands reuse the running instance. Sessions must run in UTC (Prisma's pg adapter drops time-zone offsets);
migration `2_utc_timezone` pins that on the database.

Other scripts:

| Script | Purpose |
| --- | --- |
| `pnpm ingest:mast` | Resumable MAST backfill in monthly release windows (`--incremental` for the last 30 days) |
| `pnpm ingest:gallery` | ESA/Webb first images + Top 100 pages → `gallery_images` |
| `pnpm ingest:exo` | NASA Exoplanet Archive JWST spectra + planet parameters (resumable) |
| `pnpm lab:build` | Rebuild the Lab's aligned WebP layers in `public/lab` from MAST previews |
| `npx tsx scripts/build-sky-assets.mts` | Rebuild `public/sky/*.json` (stars, constellations) |
| `pnpm build:local` | Production build against the local database |
| `pnpm db` | Just run the embedded Postgres (and apply migrations) |
| `pnpm db:studio` | Prisma Studio: browse and edit the tables in the browser |
| `pnpm db:migrate` | After editing `prisma/schema.prisma`: create and apply a new migration (`prisma migrate dev`) |

## Deploy on Vercel

1. **Database.** Add a Postgres from the Vercel Marketplace (Neon or Prisma Postgres). The app reads `POSTGRES_URL`
   (migrations prefer `POSTGRES_URL_NON_POOLING` when the integration provides it). About 120 MB once seeded.
2. **Seed it once from your machine:** `POSTGRES_URL="postgres://…" pnpm ingest`. `with-db` applies the Prisma migrations to the remote database first.
3. **Env vars:** `POSTGRES_URL`, `CRON_SECRET` (any long random string), optionally `NEXT_PUBLIC_SITE_URL`.
4. **Deploy.** `vercel.ts` pins pnpm 11 for install/build (Vercel would otherwise pick pnpm 9/10 from the lockfile) and registers a daily cron on `/api/cron/refresh`. It pulls newly public MAST products and new ESA images, and pulls exoplanet spectra on Mondays. Then it revalidates the `mast` / `gallery` / `exo` cache tags.

`pnpm build` runs `prisma generate && prisma migrate deploy && next build`. Pages are prerendered at build time from the database
(`"use cache"` + `cacheLife`), so the database must be reachable, and seeded, during the build.
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
prisma/schema.prisma        database schema (Prisma ORM 7); prisma/migrations = migration history
prisma.config.ts            Prisma CLI config (loads .env / .env.local, POSTGRES_URL)
src/lib/db.ts               Prisma client + sql() helper for hand-written analytical SQL
scripts/                    with-db, ingest-*, build-lab, build-sky-assets
src/lib/ingest/             mast.ts · esa.ts · exo.ts   (shared by scripts and the cron route)
src/lib/data*.ts            cached queries ("use cache", cacheTag mast|gallery|exo)
src/lib/cosmology.ts        ΛCDM integrals, record galaxies
src/lib/instruments.ts      instrument palette (client-safe) + validated chart colours
src/components/…            sky (three.js), lab (WebGL2), gallery (zoom viewer), worlds (spectra), scale, deep-time
```
