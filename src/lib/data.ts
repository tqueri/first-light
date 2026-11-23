import { cacheLife, cacheTag } from "next/cache";
import { db, sql } from "./db";

export { INSTRUMENTS, instrumentOf } from "./instruments";
import { displayTarget } from "./sky-math";

export type Stats = {
  products: number;
  images: number;
  spectra: number;
  cubes: number;
  timeseries: number;
  programs: number;
  targets: number;
  pis: number;
  cells: number;
  moving: number;
  firstMjd: number | null;
  lastObsMjd: number | null;
  lastReleaseMjd: number | null;
  ingestedAt: string | null;
};

export async function getStats(): Promise<Stats> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  const [row] = await sql<Stats & { ingestedat: Date | null }>(`
    select
      count(*)::int as products,
      count(*) filter (where product_type = 'image')::int as images,
      count(*) filter (where product_type = 'spectrum')::int as spectra,
      count(*) filter (where product_type = 'cube')::int as cubes,
      count(*) filter (where product_type = 'timeseries')::int as timeseries,
      count(distinct proposal_id)::int as programs,
      count(distinct proposal_pi)::int as pis,
      count(*) filter (where moving)::int as moving,
      min(t_min) as "firstMjd",
      max(t_min) filter (where t_min < extract(epoch from now()) / 86400 + 40587) as "lastObsMjd",
      max(release_mjd) filter (where release_mjd < extract(epoch from now()) / 86400 + 40587) as "lastReleaseMjd",
      max(ingested_at) as ingestedat
    from products
  `);
  const [t] = await sql<{ targets: number; cells: number }>(`
    select
      (select count(*)::int from (select distinct proposal_id, lower(regexp_replace(target_name, '[^A-Za-z0-9]', '', 'g'))
        from products where product_type in ('image', 'cube', 'timeseries')) s) as targets,
      (select count(*)::int from sky_cells) as cells
  `);
  return {
    ...row,
    targets: t.targets,
    cells: t.cells,
    ingestedAt: row.ingestedat ? new Date(row.ingestedat).toISOString() : null,
  };
}

export type ArchiveImage = {
  obsid: string;
  obs_id: string;
  target_name: string | null;
  instrument: string | null;
  filters: string | null;
  t_min: number | null;
  release_mjd: number | null;
  proposal_id: number | null;
  proposal_pi: string | null;
  title: string | null;
  jpeg_url: string | null;
  ra: number | null;
  dec: number | null;
};

/** Most recently released image products, one per target. */
export async function getLatestImages(limit = 12): Promise<ArchiveImage[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  return sql<ArchiveImage>(
    `select * from (
       select distinct on (proposal_id, lower(target_name))
         obsid::text, obs_id, target_name, instrument, filters, t_min, release_mjd, proposal_id, proposal_pi, title,
         jpeg_url, ra, dec
       from products
       where product_type = 'image' and jpeg_url is not null
         and release_mjd < extract(epoch from now()) / 86400 + 40587
         and release_mjd > extract(epoch from now()) / 86400 + 40587 - 120
       order by proposal_id, lower(target_name), em_max desc nulls last
     ) s
     order by release_mjd desc, t_min desc
     limit $1`,
    [limit],
  );
}

export type InstrumentShare = { instrument: string; n: number };
export async function getInstrumentShare(): Promise<InstrumentShare[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  return sql<InstrumentShare>(
    `select split_part(instrument, '/', 1) as instrument, count(*)::int as n
     from products group by 1 order by 2 desc`,
  );
}

export type MonthCount = { month: string; image: number; spectrum: number; cube: number; timeseries: number };
export async function getMonthlyActivity(): Promise<MonthCount[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  return sql<MonthCount>(
    `select to_char(to_timestamp((t_min - 40587) * 86400), 'YYYY-MM') as month,
       count(*) filter (where product_type = 'image')::int as image,
       count(*) filter (where product_type = 'spectrum')::int as spectrum,
       count(*) filter (where product_type = 'cube')::int as cube,
       count(*) filter (where product_type = 'timeseries')::int as timeseries
     from products where t_min is not null and t_min > 59580
     group by 1 order by 1`,
  );
}

/* ───────────────────────── gallery ───────────────────────── */

export type GalleryFilter = { color: string; band: string; label: string | null; wavelength: string; instrument: string };
export type GalleryImage = {
  id: string;
  rank: number;
  title: string;
  description: string[];
  credit: string | null;
  release_date: string | null;
  width: number | null;
  height: number | null;
  object_names: string[];
  distance: string | null;
  constellation: string | null;
  categories: string[];
  ra_hms: string | null;
  dec_dms: string | null;
  ra_deg: number | null;
  dec_deg: number | null;
  fov: string | null;
  orientation: string | null;
  filters: GalleryFilter[];
};

const GALLERY_WHERE = `not ('Illustrations' = any(categories)) and jsonb_array_length(filters) > 0`;

export async function getGallery(): Promise<GalleryImage[]> {
  "use cache";
  cacheLife("days");
  cacheTag("gallery");
  const rows = await sql<GalleryImage & { release_date: Date | null }>(
    `select * from gallery_images where ${GALLERY_WHERE} order by rank`,
  );
  return rows.map((r) => ({ ...r, release_date: r.release_date ? new Date(r.release_date).toISOString() : null }));
}

export async function getGalleryImage(id: string): Promise<GalleryImage | null> {
  "use cache";
  cacheLife("days");
  cacheTag("gallery");
  const r = await db().galleryImage.findUnique({ where: { id } });
  if (!r) return null;
  return {
    ...r,
    filters: r.filters as GalleryImage["filters"],
    release_date: r.release_date ? r.release_date.toISOString() : null,
  } as GalleryImage;
}

/** Raw MAST image products near a sky position (for "the raw data behind this image"). */
export async function getProductsNear(ra: number, dec: number, radiusDeg = 0.08, limit = 24): Promise<ArchiveImage[]> {
  "use cache";
  cacheLife("days");
  cacheTag("mast");
  return sql<ArchiveImage>(
    `select obsid::text, obs_id, target_name, instrument, filters, t_min, release_mjd, proposal_id, proposal_pi, title,
            jpeg_url, ra, dec
     from products
     where product_type = 'image' and jpeg_url is not null
       and dec between $2::float8 - $3::float8 and $2::float8 + $3::float8
       and degrees(acos(least(1, sin(radians(dec)) * sin(radians($2::float8)) +
             cos(radians(dec)) * cos(radians($2::float8)) * cos(radians(ra - $1::float8))))) < $3::float8
     order by em_min nulls last
     limit $4::int`,
    [ra, dec, radiusDeg, limit],
  );
}

/* ───────────────────────── sky ───────────────────────── */

export type SkyPayload = {
  /** [id, ra, dec, nProducts, nImage, nSpectrum, nCube, nTimeseries, instMask, firstMjd, lastMjd, nPrograms] */
  cells: number[][];
  targets: string[];
  generatedAt: string;
};

export async function getSkyPayload(): Promise<SkyPayload> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  const rows = await sql<{
    id: number; ra: number; dec: number; n_products: number; n_image: number; n_spectrum: number; n_cube: number;
    n_timeseries: number; inst_mask: number; first_mjd: number | null; last_mjd: number | null; n_programs: number;
    target: string | null;
  }>(`select * from sky_cells order by first_mjd nulls last`);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const r1 = (n: number | null) => (n == null ? 0 : Math.round(n * 10) / 10);
  return {
    cells: rows.map((c) => [c.id, r3(c.ra), r3(c.dec), c.n_products, c.n_image, c.n_spectrum, c.n_cube, c.n_timeseries,
      c.inst_mask, r1(c.first_mjd), r1(c.last_mjd), c.n_programs]),
    targets: rows.map((c) => displayTarget(c.ra, c.dec, c.target)),
    generatedAt: new Date().toISOString(),
  };
}

export type CellDetail = {
  id: number;
  ra: number;
  dec: number;
  targets: { name: string; n: number; instruments: string[] }[];
  programs: { id: number; title: string | null; pi: string | null; type: string | null; n: number }[];
  images: ArchiveImage[];
  byType: { type: string; n: number }[];
  byInstrument: { instrument: string; n: number }[];
  first: number | null;
  last: number | null;
};

export async function getCellDetail(id: number): Promise<CellDetail | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  const [cell] = await sql<{ id: number; ra: number; dec: number; dec_bin: number; ra_bin: number; first_mjd: number; last_mjd: number }>(
    `select id, ra, dec, dec_bin, ra_bin, first_mjd, last_mjd from sky_cells where id = $1`,
    [id],
  );
  if (!cell) return null;
  // Same binning as rebuildSkyCells().
  const inCell = `not moving and floor((dec + 90) / 0.2)::int = $1
    and floor(ra * greatest(cos(radians(-90 + ($1 + 0.5) * 0.2)), 0.01) / 0.2)::int = $2
    and dec between -90 + $1 * 0.2 - 0.001 and -90 + ($1 + 1) * 0.2 + 0.001`;
  const args = [cell.dec_bin, cell.ra_bin];
  const [targets, programs, images, byType, byInstrument] = await Promise.all([
    sql<{ name: string; n: number; instruments: string[] }>(
      `select coalesce(target_name, 'Unnamed') as name, count(*)::int as n,
              array_agg(distinct split_part(instrument, '/', 1)) as instruments
       from products where ${inCell} group by 1 order by 2 desc limit 8`, args),
    sql<{ id: number; title: string | null; pi: string | null; type: string | null; n: number }>(
      `select proposal_id as id, max(title) as title, max(proposal_pi) as pi, max(proposal_type) as type, count(*)::int as n
       from products where ${inCell} group by proposal_id order by 5 desc limit 6`, args),
    sql<ArchiveImage>(
      `select * from (select distinct on (filters, split_part(instrument, '/', 1))
          obsid::text, obs_id, target_name, instrument, filters, t_min, release_mjd, proposal_id, proposal_pi, title, jpeg_url, ra, dec
        from products where ${inCell} and product_type = 'image' and jpeg_url is not null
        order by filters, split_part(instrument, '/', 1), t_min desc) s order by t_min desc limit 8`, args),
    sql<{ type: string; n: number }>(
      `select product_type as type, count(*)::int as n from products where ${inCell} group by 1 order by 2 desc`, args),
    sql<{ instrument: string; n: number }>(
      `select instrument, count(*)::int as n from products where ${inCell} group by 1 order by 2 desc`, args),
  ]);
  return { id: cell.id, ra: cell.ra, dec: cell.dec, targets, programs, images, byType, byInstrument, first: cell.first_mjd, last: cell.last_mjd };
}

export type TopCell = { id: number; ra: number; dec: number; n_products: number; n_programs: number; target: string | null; first_mjd: number };
export async function getTopCells(limit = 10): Promise<TopCell[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  const rows = await sql<TopCell>(
    `select id, ra, dec, n_products, n_programs, target, first_mjd from sky_cells order by n_products desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({ ...r, target: displayTarget(r.ra, r.dec, r.target) }));
}

export type GalleryRef = { id: string; title: string; credit: string | null; width: number | null; height: number | null };
export async function getGalleryRefs(ids: string[]): Promise<Record<string, GalleryRef>> {
  "use cache";
  cacheLife("days");
  cacheTag("gallery");
  const rows: GalleryRef[] = await db().galleryImage.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, credit: true, width: true, height: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

/* ───────────────────────── archive search ───────────────────────── */

export type ArchiveQuery = { q: string; type: string; inst: string; sort: "observed" | "released"; page: number };
export type ArchiveRow = ArchiveImage & { product_type: string; exptime: number | null; proposal_type: string | null };
export type ArchiveResult = {
  rows: ArchiveRow[];
  total: number;
  programs: { id: number; title: string | null; pi: string | null; n: number }[];
};

export const ARCHIVE_PAGE_SIZE = 40;

export async function searchArchive(query: ArchiveQuery): Promise<ArchiveResult> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  const where: string[] = [];
  const args: unknown[] = [];
  const q = query.q.trim().slice(0, 120);
  if (q) {
    if (/^\d{3,5}$/.test(q)) {
      args.push(Number(q));
      where.push(`proposal_id = $${args.length}`);
    } else {
      const escaped = q.replace(/[\\%_]/g, (c) => "\\" + c);
      args.push(`%${escaped}%`);
      const i = args.length;
      where.push(`(target_name ilike $${i} or title ilike $${i} or proposal_pi ilike $${i} or obs_id ilike $${i})`);
    }
  }
  if (["image", "spectrum", "cube", "timeseries"].includes(query.type)) {
    args.push(query.type);
    where.push(`product_type = $${args.length}`);
  }
  if (["NIRCAM", "NIRSPEC", "MIRI", "NIRISS", "FGS"].includes(query.inst)) {
    args.push(query.inst + "%");
    where.push(`instrument ilike $${args.length}`);
  }
  const w = where.length ? `where ${where.join(" and ")}` : "";
  // obsid breaks ties: products from one exposure (MIRI IFU channels, NIRSpec MOS sources…) share t_min,
  // and without a total order LIMIT/OFFSET pages can repeat or skip rows.
  const order =
    query.sort === "released" ? "release_mjd desc nulls last, t_min desc, obsid desc" : "t_min desc nulls last, obsid desc";
  const page = Number.isFinite(query.page) ? Math.min(Math.max(1, Math.floor(query.page)), 5000) : 1;
  const offset = (page - 1) * ARCHIVE_PAGE_SIZE;
  const [rows, [{ total }], programs] = await Promise.all([
    sql<ArchiveRow>(
      `select obsid::text, obs_id, target_name, instrument, filters, t_min, release_mjd, proposal_id, proposal_pi, title,
              jpeg_url, ra, dec, product_type, exptime, proposal_type
       from products ${w} order by ${order} limit ${ARCHIVE_PAGE_SIZE} offset ${offset}`,
      args,
    ),
    sql<{ total: number }>(`select count(*)::int as total from products ${w}`, args),
    sql<{ id: number; title: string | null; pi: string | null; n: number }>(
      `select proposal_id as id, max(title) as title, max(proposal_pi) as pi, count(*)::int as n
       from products ${w} group by proposal_id order by n desc limit 8`,
      args,
    ),
  ]);
  return { rows, total, programs };
}
