/**
 * MAST (Mikulski Archive for Space Telescopes) → Postgres ingest.
 * Pulls every public, calibrated (level 3) JWST *science* product.
 * Used by `pnpm ingest:mast` (full, resumable backfill) and by the Vercel cron
 * route (incremental: only products released since the last run).
 */
import type { Pool, PoolClient } from "pg";

const MAST = "https://mast.stsci.edu/api/v0/invoke";
const PAGE = 50_000;
export const PRODUCT_TYPES = ["image", "spectrum", "cube", "timeseries"] as const;
type ProductType = (typeof PRODUCT_TYPES)[number];

const COLUMNS = [
  "obsid", "obs_id", "target_name", "target_classification", "s_ra", "s_dec",
  "instrument_name", "filters", "dataproduct_type", "t_min", "t_max", "t_exptime",
  "t_obs_release", "proposal_id", "proposal_pi", "proposal_type", "obs_title",
  "em_min", "em_max", "jpegURL", "mtFlag",
].join(",");

type MastRow = {
  obsid: number | string;
  obs_id: string;
  target_name: string | null;
  target_classification: string | null;
  s_ra: number | null;
  s_dec: number | null;
  instrument_name: string | null;
  filters: string | null;
  dataproduct_type: string;
  t_min: number | null;
  t_max: number | null;
  t_exptime: number | null;
  t_obs_release: number | null;
  proposal_id: string | null;
  proposal_pi: string | null;
  proposal_type: string | null;
  obs_title: string | null;
  em_min: number | null;
  em_max: number | null;
  jpegURL: string | null;
  mtFlag: boolean | null;
};

export const mjdNow = () => Date.now() / 86_400_000 + 40_587;
export const mjdToDate = (mjd: number) => new Date((mjd - 40_587) * 86_400_000);
const dateToMjd = (d: Date) => d.getTime() / 86_400_000 + 40_587;

async function mastFiltered(type: ProductType, mjdStart: number, mjdEnd: number, page = 1) {
  const request = {
    service: "Mast.Caom.Filtered",
    format: "json",
    pagesize: PAGE,
    page,
    params: {
      columns: COLUMNS,
      filters: [
        { paramName: "obs_collection", values: ["JWST"] },
        { paramName: "calib_level", values: [3] },
        { paramName: "intentType", values: ["science"] },
        { paramName: "dataRights", values: ["PUBLIC"] },
        { paramName: "dataproduct_type", values: [type] },
        { paramName: "t_obs_release", values: [{ min: mjdStart, max: mjdEnd }] },
      ],
    },
  };
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(MAST, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ request: JSON.stringify(request) }),
        signal: AbortSignal.timeout(280_000),
      });
      if (!res.ok) throw new Error(`MAST HTTP ${res.status}`);
      const json = (await res.json()) as {
        status: string;
        msg?: string;
        data: MastRow[];
        paging: { rowsFiltered: number; rows: number };
      };
      if (json.status !== "COMPLETE") throw new Error(`MAST status ${json.status}: ${json.msg ?? ""}`);
      return json;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function upsert(client: PoolClient, allRows: MastRow[]) {
  // MAST occasionally returns the same product twice in one page.
  const rows = [...new Map(allRows.map((r) => [String(r.obsid), r])).values()];
  const CHUNK = 1_500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const cols = {
      obsid: [] as string[], obs_id: [] as string[], target_name: [] as (string | null)[],
      target_class: [] as (string | null)[], ra: [] as (number | null)[], dec: [] as (number | null)[],
      instrument: [] as (string | null)[], filters: [] as (string | null)[], product_type: [] as string[],
      t_min: [] as (number | null)[], t_max: [] as (number | null)[], exptime: [] as (number | null)[],
      release_mjd: [] as (number | null)[], proposal_id: [] as (number | null)[],
      proposal_pi: [] as (string | null)[], proposal_type: [] as (string | null)[], title: [] as (string | null)[],
      em_min: [] as (number | null)[], em_max: [] as (number | null)[], jpeg_url: [] as (string | null)[],
      moving: [] as boolean[],
    };
    for (const r of chunk) {
      cols.obsid.push(String(r.obsid));
      cols.obs_id.push(r.obs_id);
      cols.target_name.push(r.target_name?.trim() || null);
      cols.target_class.push(r.target_classification?.trim() || null);
      cols.ra.push(num(r.s_ra));
      cols.dec.push(num(r.s_dec));
      cols.instrument.push(r.instrument_name);
      cols.filters.push(r.filters);
      cols.product_type.push(r.dataproduct_type);
      cols.t_min.push(num(r.t_min));
      cols.t_max.push(num(r.t_max));
      cols.exptime.push(num(r.t_exptime));
      cols.release_mjd.push(num(r.t_obs_release));
      const pid = r.proposal_id ? parseInt(r.proposal_id, 10) : NaN;
      cols.proposal_id.push(Number.isFinite(pid) ? pid : null);
      cols.proposal_pi.push(r.proposal_pi);
      cols.proposal_type.push(r.proposal_type);
      cols.title.push(r.obs_title);
      cols.em_min.push(num(r.em_min));
      cols.em_max.push(num(r.em_max));
      cols.jpeg_url.push(r.jpegURL);
      cols.moving.push(Boolean(r.mtFlag));
    }
    await client.query(
      `insert into products (obsid, obs_id, target_name, target_class, ra, dec, instrument, filters, product_type,
         t_min, t_max, exptime, release_mjd, proposal_id, proposal_pi, proposal_type, title, em_min, em_max, jpeg_url, moving)
       select * from unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::float8[], $7::text[],
         $8::text[], $9::text[], $10::float8[], $11::float8[], $12::float8[], $13::float8[], $14::int[], $15::text[],
         $16::text[], $17::text[], $18::float8[], $19::float8[], $20::text[], $21::bool[])
       on conflict (obsid) do update set
         obs_id = excluded.obs_id, target_name = excluded.target_name, target_class = excluded.target_class,
         ra = excluded.ra, dec = excluded.dec, instrument = excluded.instrument, filters = excluded.filters,
         product_type = excluded.product_type, t_min = excluded.t_min, t_max = excluded.t_max,
         exptime = excluded.exptime, release_mjd = excluded.release_mjd, proposal_id = excluded.proposal_id,
         proposal_pi = excluded.proposal_pi, proposal_type = excluded.proposal_type, title = excluded.title,
         em_min = excluded.em_min, em_max = excluded.em_max, jpeg_url = excluded.jpeg_url, moving = excluded.moving,
         ingested_at = now()`,
      Object.values(cols),
    );
  }
}

/** Ingest one release window; splits itself if MAST reports more rows than a page holds. */
async function ingestWindow(
  pool: Pool,
  type: ProductType,
  start: number,
  end: number,
  log: (s: string) => void,
): Promise<number> {
  const first = await mastFiltered(type, start, end, 1);
  if (first.paging.rowsFiltered > PAGE) {
    const mid = (start + end) / 2;
    log(`  ${type} ${fmt(start)}→${fmt(end)}: ${first.paging.rowsFiltered} rows, splitting`);
    return (await ingestWindow(pool, type, start, mid, log)) + (await ingestWindow(pool, type, mid, end, log));
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await upsert(client, first.data);
    await client.query(
      `insert into ingest_windows (product_type, mjd_start, mjd_end, rows) values ($1, $2, $3, $4)
       on conflict (product_type, mjd_start, mjd_end) do update set rows = excluded.rows, completed_at = now()`,
      [type, start, end, first.data.length],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return first.data.length;
}

const fmt = (mjd: number) => mjdToDate(mjd).toISOString().slice(0, 10);

/** Full backfill in monthly release windows. Completed windows are skipped unless they are recent. */
export async function backfill(pool: Pool, log: (s: string) => void = console.log) {
  const now = mjdNow();
  const windows: [number, number][] = [];
  // First science data became public in July 2022; commissioning data slightly earlier.
  for (let d = new Date(Date.UTC(2022, 0, 1)); dateToMjd(d) < now + 1; ) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    windows.push([dateToMjd(d), Math.min(dateToMjd(next), now + 1)]);
    d = next;
  }
  const done = new Set(
    (
      await pool.query<{ k: string }>(
        `select product_type || ':' || mjd_start || ':' || mjd_end as k from ingest_windows`,
      )
    ).rows.map((r) => r.k),
  );
  let total = 0;
  for (const type of PRODUCT_TYPES) {
    for (const [s, e] of windows) {
      const recent = e > now - 45;
      if (!recent && done.has(`${type}:${s}:${e}`)) continue;
      const n = await ingestWindow(pool, type, s, e, log);
      total += n;
      log(`  ${type.padEnd(10)} ${fmt(s)} → ${fmt(e)}  ${String(n).padStart(6)} rows`);
    }
  }
  return total;
}

/** Incremental: everything released in the last `days` days (cheap; for the cron). */
export async function incremental(pool: Pool, days = 10, log: (s: string) => void = console.log) {
  const now = mjdNow();
  let total = 0;
  for (const type of PRODUCT_TYPES) {
    const n = await ingestWindow(pool, type, now - days, now + 1, log);
    total += n;
    log(`  ${type.padEnd(10)} last ${days}d  ${n} rows`);
  }
  return total;
}

/** Rebuild the ~0.2° sky aggregation used by the sky map. */
export async function rebuildSkyCells(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from sky_cells");
    await client.query(`
      insert into sky_cells (id, ra, dec, n_products, n_image, n_spectrum, n_cube, n_timeseries, inst_mask,
                             first_mjd, last_mjd, n_programs, target, dec_bin, ra_bin)
      with b as (
        select *, floor((dec + 90) / 0.2)::int as dec_bin
        from products where not moving and ra is not null and dec is not null
      ), c as (
        select *, floor(ra * greatest(cos(radians(-90 + (dec_bin + 0.5) * 0.2)), 0.01) / 0.2)::int as ra_bin from b
      )
      select row_number() over (order by dec_bin, ra_bin),
        mod((degrees(atan2(avg(sin(radians(ra))), avg(cos(radians(ra))))) + 360)::numeric, 360)::float8,
        avg(dec),
        count(*),
        count(*) filter (where product_type = 'image'),
        count(*) filter (where product_type = 'spectrum'),
        count(*) filter (where product_type = 'cube'),
        count(*) filter (where product_type = 'timeseries'),
        bit_or(case when instrument ilike 'NIRCAM%' then 1 when instrument ilike 'NIRSPEC%' then 2
                    when instrument ilike 'MIRI%' then 4 when instrument ilike 'NIRISS%' then 8
                    when instrument ilike 'FGS%' then 16 else 0 end),
        min(t_min), max(t_min),
        count(distinct proposal_id),
        coalesce(mode() within group (order by target_name) filter (where product_type = 'image'),
                 mode() within group (order by target_name)),
        dec_bin, ra_bin
      from c group by dec_bin, ra_bin
    `);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
