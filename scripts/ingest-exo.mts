// NASA Exoplanet Archive (JWST spectra + planet parameters) → Postgres. Usage: pnpm ingest:exo
import pg from "pg";
import { ingestPlanets, ingestSpectra } from "../src/lib/ingest/exo.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const t0 = Date.now();
const run = await pool.query<{ id: number }>(`insert into ingest_runs (source) values ('exo') returning id`);
const s = await ingestSpectra(pool);
const p = await ingestPlanets(pool);
const { rows: [c] } = await pool.query(
  `select (select count(*) from exo_spectra)::int as spectra, (select count(distinct planet) from exo_spectra)::int as planets,
          (select count(*) from exo_planets)::int as with_params`,
);
await pool.query(`update ingest_runs set finished_at = now(), rows = $2, note = $3 where id = $1`, [
  run.rows[0].id,
  c.spectra,
  `listed ${s.listed}, skipped ${s.skipped}`,
]);
console.log(
  `[exo] done in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${c.spectra} spectra, ${c.planets} planets (${c.with_params} with parameters); listed ${s.listed}, skipped ${s.skipped}; ${p.stored} param rows`,
);
await pool.end();
