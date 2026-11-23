// Full, resumable MAST backfill. Usage: pnpm ingest:mast [--incremental]
import pg from "pg";
import { backfill, incremental, rebuildSkyCells } from "../src/lib/ingest/mast.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const t0 = Date.now();
const run = await pool.query<{ id: number }>(
  `insert into ingest_runs (source) values ('mast') returning id`,
);
const mode = process.argv.includes("--incremental") ? "incremental" : "backfill";
console.log(`[mast] ${mode} starting`);
const rows = mode === "incremental" ? await incremental(pool, 30) : await backfill(pool);
console.log(`[mast] ${rows} rows upserted; rebuilding sky cells…`);
await rebuildSkyCells(pool);
const { rows: [s] } = await pool.query(
  `select (select count(*) from products)::int as products, (select count(*) from sky_cells)::int as cells`,
);
await pool.query(`update ingest_runs set finished_at = now(), rows = $2, note = $3 where id = $1`, [
  run.rows[0].id,
  rows,
  mode,
]);
console.log(`[mast] done in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${s.products} products, ${s.cells} sky cells`);
await pool.end();
