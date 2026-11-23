/**
 * Original analyses of the archive — the "Findings" page.
 * Every function recomputes from the database (cached; the daily cron revalidates the tags),
 * so the numbers move as Webb's public archive grows.
 */
import { cacheLife, cacheTag } from "next/cache";
import bounds from "@/data/constellation-bounds.json";
import names from "@/data/constellation-names.json";
import { sql } from "./db";
import { displayTarget } from "./sky-math";

const NOW_MJD = `(extract(epoch from now()) / 86400 + 40587)`;
const OBS_KEY = `substring(obs_id from '^(jw[0-9]+-[oc][0-9]+)')`;

/** Low-precision solar ecliptic longitude (degrees, ~0.01°) at MJD `t` — SQL expression. */
const SUN_LAMBDA = (t: string) => `
  mod((280.460 + 0.9856474 * (${t} - 51544.5)
     + 1.915 * sin(radians(357.528 + 0.9856003 * (${t} - 51544.5)))
     + 0.020 * sin(radians(2 * (357.528 + 0.9856003 * (${t} - 51544.5)))))::numeric, 360)::float8`;
/** Ecliptic longitude / latitude of an equatorial position (J2000, ε = 23.439°). */
const ECL_LON = (ra: string, dec: string) =>
  `mod((degrees(atan2(sin(radians(${ra})) * cos(radians(23.439)) + tan(radians(${dec})) * sin(radians(23.439)), cos(radians(${ra})))) + 360)::numeric, 360)::float8`;
const ECL_LAT = (ra: string, dec: string) =>
  `degrees(asin(sin(radians(${dec})) * cos(radians(23.439)) - cos(radians(${dec})) * sin(radians(23.439)) * sin(radians(${ra}))))`;

/* ───────────── 1 · The Sun rule ───────────── */

export type SunFinding = {
  products: number;
  inside: number;
  minElong: number;
  maxElong: number;
  hist: { deg: number; n: number }[];
  /** observation-level points: [mjd (days), eclipticLon (deg), |eclipticLat| ≥ 45 ? 1 : 0] */
  points: number[][];
  observations: number;
};

export async function getSunFinding(): Promise<SunFinding> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  const elongSql = `
    select degrees(acos(least(1, cos(radians(${ECL_LAT("ra", "dec")})) *
             cos(radians(${ECL_LON("ra", "dec")} - ${SUN_LAMBDA("t_min")}))))) as el
    from products where not moving and ra is not null and t_min is not null`;
  const [hist, [summary], points] = await Promise.all([
    sql<{ deg: number; n: number }>(`select floor(el)::int as deg, count(*)::int as n from (${elongSql}) e group by 1 order by 1`),
    sql<{ products: number; inside: number; mn: number; mx: number }>(
      `select count(*)::int as products, count(*) filter (where el between 85 and 135)::int as inside, min(el) as mn, max(el) as mx from (${elongSql}) e`,
    ),
    sql<{ t: number; lon: number; hi: number; sun: number }>(`
      with o as (
        select ${OBS_KEY} k, min(t_min) t,
          mod((degrees(atan2(avg(sin(radians(ra))), avg(cos(radians(ra))))) + 360)::numeric, 360)::float8 ra, avg(dec) dec
        from products where not moving and ra is not null and t_min is not null group by 1
      )
      select round(t::numeric, 1)::float8 t, round(${ECL_LON("ra", "dec")}::numeric, 1)::float8 lon,
             (abs(${ECL_LAT("ra", "dec")}) >= 45)::int hi, round(${SUN_LAMBDA("t")}::numeric, 1)::float8 sun
      from o where k is not null`),
  ]);
  return {
    products: summary.products,
    inside: summary.inside,
    minElong: summary.mn,
    maxElong: summary.mx,
    hist,
    // compact: whole days and whole degrees are plenty at chart resolution; the Sun is recomputed client-side
    points: points.map((p) => [Math.round(p.t), Math.round(p.lon) % 360, p.hi]),
    observations: points.length,
  };
}

/* ───────────── 2 · How long data stays secret ───────────── */

export const PROGRAMME_GROUPS = [
  { key: "GTO", label: "Guaranteed time (instrument teams)", color: "#bb8809" },
  { key: "GO", label: "General observers", color: "#2a91be" },
  { key: "SURVEY", label: "Surveys", color: "#0aa14e" },
  { key: "DD", label: "Director's discretionary & Early Release Science", color: "#7c60bd" },
  { key: "CAL", label: "Calibration & commissioning", color: "#d94726" },
] as const;

export type SecrecyFinding = {
  observations: number;
  immediate: number;
  oneYear: number;
  medianDays: number;
  cutoffMjd: number;
  bins: { from: number; values: number[] }[]; // 15-day bins, values per PROGRAMME_GROUPS
  groups: { key: string; n: number; immediate: number; median: number }[];
};

export async function getSecrecyFinding(): Promise<SecrecyFinding> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  // Only observations old enough that a standard 12-month exclusive period has expired —
  // otherwise still-private recent data would be invisible and bias the result.
  const base = `
    with o as (
      select ${OBS_KEY} k, max(release_mjd) rel, max(t_max) tmax,
        case max(proposal_type) when 'GO' then 'GO' when 'GTO' then 'GTO' when 'SURVEY' then 'SURVEY'
          when 'DD' then 'DD' when 'ERS' then 'DD' else 'CAL' end grp
      from products where release_mjd is not null and t_max is not null group by 1
    ), d as (select grp, greatest(rel - tmax, 0) lag from o where k is not null and tmax < ${NOW_MJD} - 450)`;
  const [rows, [s], groups] = await Promise.all([
    sql<{ bin: number; grp: string; n: number }>(
      `${base} select least(floor(lag / 15)::int, 49) bin, grp, count(*)::int n from d group by 1, 2`,
    ),
    sql<{ n: number; imm: number; yr: number; med: number }>(
      `${base} select count(*)::int n, count(*) filter (where lag < 3)::int imm,
         count(*) filter (where lag between 330 and 400)::int yr, percentile_cont(0.5) within group (order by lag) med from d`,
    ),
    sql<{ key: string; n: number; immediate: number; median: number }>(
      `${base} select grp key, count(*)::int n, avg((lag < 3)::int)::float8 immediate,
         percentile_cont(0.5) within group (order by lag) median from d group by 1 order by 2 desc`,
    ),
  ]);
  const bins = Array.from({ length: 50 }, (_, i) => ({ from: i * 15, values: PROGRAMME_GROUPS.map(() => 0) }));
  for (const r of rows) {
    const gi = PROGRAMME_GROUPS.findIndex((g) => g.key === r.grp);
    if (gi >= 0) bins[r.bin].values[gi] += r.n;
  }
  const [{ cut }] = await sql<{ cut: number }>(`select (${NOW_MJD} - 450)::float8 cut`);
  return { observations: s.n, immediate: s.imm, oneYear: s.yr, medianDays: s.med, cutoffMjd: cut, bins, groups };
}

/* ───────────── 3 · From photons to press picture ───────────── */

export type PressLag = { id: string; title: string; release: string; lastObs: string; lag: number; year: number };
export type PressFinding = { matched: number; considered: number; items: PressLag[]; byYear: { year: number; n: number; median: number }[] };

export async function getPressFinding(): Promise<PressFinding> {
  "use cache";
  cacheLife("days");
  cacheTag("gallery");
  cacheTag("mast");
  const rows = await sql<{ id: string; title: string; rel: Date; last_obs: number | null; key: string }>(`
    select g.id, g.title, g.release_date rel,
      coalesce(substring(g.id from '^((?:weic|potm|ann)[0-9]{4})'), regexp_replace(g.id, '[0-9]+$', '')) key,
      (select max(p.t_max) from products p
        where p.product_type = 'image' and not p.moving
          and p.dec between g.dec_deg - 0.05 and g.dec_deg + 0.05
          and degrees(acos(least(1, sin(radians(p.dec)) * sin(radians(g.dec_deg)) +
                cos(radians(p.dec)) * cos(radians(g.dec_deg)) * cos(radians(p.ra - g.ra_deg))))) < 0.05
          and p.t_max < extract(epoch from g.release_date) / 86400 + 40587 - 1) last_obs
    from gallery_images g
    where g.ra_deg is not null and g.release_date is not null and jsonb_array_length(g.filters) > 0
      and not ('Solar System' = any(g.categories)) and not ('Illustrations' = any(g.categories))`);
  // One point per press release (a/b/c versions of the same release share their data).
  const best = new Map<string, PressLag>();
  for (const r of rows) {
    if (r.last_obs == null) continue;
    const rel = new Date(r.rel);
    const last = new Date((r.last_obs - 40587) * 86_400_000);
    const lag = Math.round((rel.getTime() - last.getTime()) / 86_400_000);
    const item = { id: r.id, title: r.title, release: rel.toISOString(), lastObs: last.toISOString(), lag, year: rel.getUTCFullYear() };
    const prev = best.get(r.key);
    if (!prev || lag < prev.lag) best.set(r.key, item);
  }
  const items = [...best.values()].sort((a, b) => a.release.localeCompare(b.release));
  const years = [...new Set(items.map((i) => i.year))].sort();
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
  };
  return {
    matched: items.length,
    considered: new Set(rows.map((r) => r.key)).size,
    items,
    byYear: years.map((y) => {
      const l = items.filter((i) => i.year === y).map((i) => i.lag);
      return { year: y, n: l.length, median: Math.round(median(l)) };
    }),
  };
}

/* ───────────── 4 · Same light, different colours ───────────── */

export const PAINT = ["Purple", "Blue", "Cyan", "Green", "Yellow", "Orange", "Red"] as const;
export const PAINT_HEX: Record<string, string> = {
  Purple: "#9b6bff", Blue: "#3b6cff", Cyan: "#2ec5e6", Green: "#2fbf5a", Yellow: "#f2d14a", Orange: "#ff9a3c", Red: "#ff4d4d",
};
export type ColourRow = { wavelengthUm: number; label: string; instrument: string; total: number; counts: number[]; top: string; topShare: number };

export async function getColourFinding(): Promise<{ images: number; rows: ColourRow[] }> {
  "use cache";
  cacheLife("days");
  cacheTag("gallery");
  const raw = await sql<{ inst: string; wl: string; col: string; n: number }>(`
    select f->>'instrument' inst, f->>'wavelength' wl, f->>'color' col, count(*)::int n
    from gallery_images, jsonb_array_elements(filters) f
    where not ('Illustrations' = any(categories)) group by 1, 2, 3`);
  const [{ images }] = await sql<{ images: number }>(
    `select count(*)::int images from gallery_images where jsonb_array_length(filters) > 0 and not ('Illustrations' = any(categories))`,
  );
  const parseUm = (s: string) => {
    const m = s.replace(",", ".").match(/([\d.]+)\s*(nm|μm|µm|micron)/i);
    if (!m) return null;
    return m[2].toLowerCase() === "nm" ? Number(m[1]) / 1000 : Number(m[1]);
  };
  const map = new Map<string, ColourRow>();
  for (const r of raw) {
    const um = parseUm(r.wl ?? "");
    const inst = /MIRI/i.test(r.inst) ? "MIRI" : /NIRCam/i.test(r.inst) ? "NIRCam" : null;
    if (um == null || !inst) continue;
    const key = `${inst}:${um}`;
    const row = map.get(key) ?? { wavelengthUm: um, label: r.wl, instrument: inst, total: 0, counts: PAINT.map(() => 0), top: "", topShare: 0 };
    const ci = PAINT.indexOf(r.col as (typeof PAINT)[number]);
    if (ci >= 0) row.counts[ci] += r.n;
    row.total += r.n;
    map.set(key, row);
  }
  const rows = [...map.values()]
    .filter((r) => r.total >= 15)
    .map((r) => {
      const i = r.counts.indexOf(Math.max(...r.counts));
      return { ...r, top: PAINT[i], topShare: r.counts[i] / r.total };
    })
    .sort((a, b) => a.wavelengthUm - b.wavelengthUm);
  return { images, rows };
}

/* ───────────── 5 · Away from the Milky Way ───────────── */

export type GalacticRow = { from: number; to: number; skyShare: number; dataShare: number; products: number };

export async function getGalacticFinding(): Promise<GalacticRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  const rows = await sql<{ bin: number; n: number }>(`
    select least(floor(abs(degrees(asin(
      -0.867666149 * cos(radians(dec)) * cos(radians(ra)) - 0.1980763734 * cos(radians(dec)) * sin(radians(ra))
      + 0.4559837762 * sin(radians(dec))))) / 10)::int, 8) bin, sum(n_products)::int n
    from sky_cells group by 1 order by 1`);
  const total = rows.reduce((s, r) => s + r.n, 0) || 1;
  return Array.from({ length: 9 }, (_, i) => {
    const r = rows.find((x) => x.bin === i);
    const skyShare = Math.sin(((i + 1) * 10 * Math.PI) / 180) - Math.sin((i * 10 * Math.PI) / 180);
    return { from: i * 10, to: i * 10 + 10, skyShare, dataShare: (r?.n ?? 0) / total, products: r?.n ?? 0 };
  });
}

/* ───────────── 6 · Everywhere, and nowhere deep ───────────── */

type Ring = number[][];
function inRing(lon: number, lat: number, ring: Ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function unwrap(ring: Ring): Ring {
  const out: Ring = [[ring[0][0], ring[0][1]]];
  for (let i = 1; i < ring.length; i++) {
    let x = ring[i][0];
    const px = out[i - 1][0];
    while (x - px > 180) x -= 360;
    while (x - px < -180) x += 360;
    out.push([x, ring[i][1]]);
  }
  return out;
}
type BoundsGeo = { type: string; coordinates: unknown };
const UNWRAPPED = (bounds as { features: { id: string; geometry: BoundsGeo }[] }).features.map((f) => ({
  id: f.id,
  rings: (f.geometry.type === "Polygon"
    ? [(f.geometry.coordinates as Ring[])[0]]
    : (f.geometry.coordinates as Ring[][]).map((p) => p[0])
  ).map(unwrap),
}));

/** IAU constellation containing (ra, dec), from d3-celestial boundary polygons. */
export function constellationAt(ra: number, dec: number): string {
  const lon = ra > 180 ? ra - 360 : ra;
  for (const f of UNWRAPPED) {
    if (f.rings.some((r) => [lon, lon - 360, lon + 360].some((L) => inRing(L, dec, r)))) {
      return (names as Record<string, string>)[f.id] ?? f.id;
    }
  }
  return dec > 0 ? "Ursa Minor" : "Octans"; // the two pole-containing constellations
}

export type CoverageFinding = {
  cells: number;
  cellAreaShare: number;
  within1: number;
  within5: number;
  loneliest: { ra: number; dec: number; distance: number; constellation: string; nearest: string };
  /** [ra, dec, nProducts] for the mini sky map */
  dots: number[][];
};

export async function getCoverageFinding(): Promise<CoverageFinding> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  const cells = await sql<{ ra: number; dec: number; n_products: number; target: string | null }>(
    `select ra, dec, n_products, target from sky_cells`,
  );
  const D = Math.PI / 180;
  const vec = (ra: number, dec: number) => [Math.cos(dec * D) * Math.cos(ra * D), Math.cos(dec * D) * Math.sin(ra * D), Math.sin(dec * D)];
  const V = cells.map((c) => vec(c.ra, c.dec));
  const nearest = (p: number[]) => {
    let best = -2;
    let bi = 0;
    for (let i = 0; i < V.length; i++) {
      const v = V[i];
      const dot = p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
      if (dot > best) {
        best = dot;
        bi = i;
      }
    }
    return { deg: Math.acos(Math.min(1, best)) / D, i: bi };
  };
  // Fibonacci sphere: uniform sampling of the whole sky.
  const N = 30_000;
  const golden = Math.PI * (3 - Math.sqrt(5));
  let w1 = 0;
  let w5 = 0;
  let far = { deg: -1, ra: 0, dec: 0 };
  for (let i = 0; i < N; i++) {
    const z = 1 - (2 * i + 1) / N;
    const r = Math.sqrt(1 - z * z);
    const th = golden * i;
    const p = [r * Math.cos(th), r * Math.sin(th), z];
    const { deg } = nearest(p);
    if (deg < 1) w1++;
    if (deg < 5) w5++;
    if (deg > far.deg) far = { deg, ra: ((Math.atan2(p[1], p[0]) / D) + 360) % 360, dec: Math.asin(z) / D };
  }
  // Refine the emptiest point with a shrinking local search.
  let step = 1;
  for (let it = 0; it < 80 && step > 0.01; it++) {
    let improved = false;
    for (const [dr, dd] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const dec = Math.max(-89.9, Math.min(89.9, far.dec + dd));
      const ra = (far.ra + dr / Math.max(0.1, Math.cos(dec * D)) + 360) % 360;
      const { deg } = nearest(vec(ra, dec));
      if (deg > far.deg) {
        far = { deg, ra, dec };
        improved = true;
      }
    }
    if (!improved) step /= 2;
  }
  const n = nearest(vec(far.ra, far.dec));
  const nc = cells[n.i];
  return {
    cells: cells.length,
    cellAreaShare: (cells.length * 0.04) / 41_252.96,
    within1: w1 / N,
    within5: w5 / N,
    loneliest: {
      ra: far.ra,
      dec: far.dec,
      distance: far.deg,
      constellation: constellationAt(far.ra, far.dec),
      nearest: displayTarget(nc.ra, nc.dec, nc.target),
    },
    dots: cells.map((c) => [Math.round(c.ra * 10) / 10, Math.round(c.dec * 10) / 10, c.n_products]),
  };
}

/* ───────────── 7 · The most revisited targets ───────────── */

export type Revisited = { name: string; programmes: number; products: number; calShare: number; moving: boolean; firstMjd: number; lastMjd: number };

export async function getRevisitedFinding(limit = 14): Promise<Revisited[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("mast");
  return sql<Revisited>(
    `select mode() within group (order by target_name) as name, count(distinct proposal_id)::int programmes,
       count(*)::int products, avg((proposal_type in ('CAL', 'COM', 'ENG'))::int)::float8 "calShare",
       bool_or(moving) moving, min(t_min) "firstMjd", max(t_min) "lastMjd"
     from products
     where target_name is not null and upper(target_name) not in ('BACKGROUND', 'UNKNOWN', 'NONE')
     group by upper(regexp_replace(target_name, '[^A-Za-z0-9]', '', 'g'))
     order by 2 desc, 3 desc limit $1`,
    [limit],
  );
}

/* ───────────── 8 · The census of worlds ───────────── */

export type CensusPlanet = { name: string; radius: number; teq: number; spectra: number; instruments: string[]; host_teff: number | null };

export async function getWorldsCensus(): Promise<{
  planets: CensusPlanet[];
  classes: { label: string; n: number }[];
  temperate: number;
  rockyAroundMDwarfs: number;
}> {
  "use cache";
  cacheLife("days");
  cacheTag("exo");
  const planets = await sql<CensusPlanet>(`
    select s.planet name, p.radius_re radius, p.eq_temp_k teq, count(*)::int spectra,
      array_agg(distinct s.instrument) instruments, p.host_teff
    from exo_spectra s join exo_planets p on p.name = s.planet
    where p.radius_re is not null and p.eq_temp_k is not null
    group by 1, 2, 3, p.host_teff order by 2`);
  const cls = [
    { label: "Rocky (< 1.6 Earth radii)", test: (r: number) => r < 1.6 },
    { label: "Sub-Neptunes (1.6–4)", test: (r: number) => r >= 1.6 && r < 4 },
    { label: "Neptunes to Saturns (4–8)", test: (r: number) => r >= 4 && r < 8 },
    { label: "Giants (≥ 8)", test: (r: number) => r >= 8 },
  ];
  return {
    planets,
    classes: cls.map((c) => ({ label: c.label, n: planets.filter((p) => c.test(p.radius)).length })),
    temperate: planets.filter((p) => p.teq < 400).length,
    // M dwarfs: effective temperature below ~4,000 K
    rockyAroundMDwarfs: planets.filter((p) => p.radius < 1.6 && p.host_teff != null && p.host_teff < 4000).length,
  };
}
