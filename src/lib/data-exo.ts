import { cacheLife, cacheTag } from "next/cache";
import { db, sql } from "./db";

export type ExoPoint = [number, number, number | null, number | null, number | null];

export type InstKey = "NIRCAM" | "NIRSPEC" | "MIRI" | "NIRISS" | "FGS";

export function exoInstrument(instrument: string | null): { key: InstKey; mode: string | null } {
  const s = instrument ?? "";
  const key: InstKey = /NIRSpec/i.test(s)
    ? "NIRSPEC"
    : /NIRCam/i.test(s)
      ? "NIRCAM"
      : /MIRI|Mid-Infrared/i.test(s)
        ? "MIRI"
        : /NIRISS/i.test(s)
          ? "NIRISS"
          : "FGS";
  const mode = s.includes(" - ") ? s.split(" - ").pop()!.trim() : null;
  return { key, mode };
}

export type ExoSpectrumMeta = {
  id: string;
  planet: string;
  spec_type: string;
  instrument: string | null;
  inst_key: InstKey;
  mode: string | null;
  authors: string | null;
  reference: string | null;
  bibcode: string | null;
  note: string | null;
  min_wl: number;
  max_wl: number;
  n_points: number;
  value_unit: string;
  value_kind: "transit_depth" | "eclipse_depth" | "brightness_temp";
  derived: boolean;
};
export type ExoSpectrum = ExoSpectrumMeta & { points: ExoPoint[] };

export type ExoPlanet = {
  name: string;
  host: string | null;
  radius_re: number | null;
  mass_me: number | null;
  period_days: number | null;
  eq_temp_k: number | null;
  distance_pc: number | null;
  disc_year: number | null;
  host_teff: number | null;
  host_spectype: string | null;
  star_rad_rsun: number | null;
  insol_earth: number | null;
  n_spectra: number;
  n_transmission: number;
  n_eclipse: number;
  instruments: InstKey[];
  /** Atmospheric scale height for an H₂/He atmosphere (μ = 2.3), km. */
  scale_height_km: number | null;
  /** Transit-depth change of one scale height, ppm: 2·H·Rp / Rs². */
  ppm_per_h: number | null;
};

const K_B = 1.380649e-23;
const AMU = 1.66053907e-27;
const G = 6.6743e-11;
const M_EARTH = 5.9722e24;
const R_EARTH = 6.371e6;
const R_SUN = 6.957e8;
export const MU_H2 = 2.3;

export function scaleHeight(p: Pick<ExoPlanet, "radius_re" | "mass_me" | "eq_temp_k" | "star_rad_rsun">) {
  if (!p.radius_re || !p.mass_me || !p.eq_temp_k) return { km: null, ppm: null };
  const R = p.radius_re * R_EARTH;
  const g = (G * p.mass_me * M_EARTH) / (R * R);
  const H = (K_B * p.eq_temp_k) / (MU_H2 * AMU * g);
  const ppm = p.star_rad_rsun ? ((2 * H * R) / (p.star_rad_rsun * R_SUN) ** 2) * 1e6 : null;
  return { km: H / 1000, ppm };
}

function withInst<T extends { instrument: string | null }>(r: T) {
  const { key, mode } = exoInstrument(r.instrument);
  return { ...r, inst_key: key, mode };
}

export type ExoStats = {
  spectra: number;
  planets: number;
  papers: number;
  points: number;
  transmission: number;
  eclipse: number;
  byInstrument: { key: InstKey; n: number }[];
};

export async function getExoStats(): Promise<ExoStats> {
  "use cache";
  cacheLife("days");
  cacheTag("exo");
  const [row] = await sql<Omit<ExoStats, "byInstrument">>(`
    select count(*)::int as spectra, count(distinct planet)::int as planets,
      count(distinct coalesce(bibcode, reference))::int as papers, coalesce(sum(n_points), 0)::int as points,
      count(*) filter (where spec_type = 'Transmission')::int as transmission,
      count(*) filter (where spec_type = 'Eclipse')::int as eclipse
    from exo_spectra`);
  const inst = await sql<{ instrument: string | null; n: number }>(
    `select instrument, count(*)::int as n from exo_spectra group by 1`,
  );
  const by = new Map<InstKey, number>();
  for (const r of inst) {
    const k = exoInstrument(r.instrument).key;
    by.set(k, (by.get(k) ?? 0) + r.n);
  }
  return {
    ...row,
    byInstrument: [...by.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n),
  };
}

export async function getExoPlanets(): Promise<ExoPlanet[]> {
  "use cache";
  cacheLife("days");
  cacheTag("exo");
  const rows = await sql<Omit<ExoPlanet, "instruments" | "scale_height_km" | "ppm_per_h"> & { insts: string[] }>(`
    select s.planet as name, p.host, p.radius_re, p.mass_me, p.period_days, p.eq_temp_k, p.distance_pc, p.disc_year,
      p.host_teff, p.host_spectype, p.star_rad_rsun, p.insol_earth,
      count(*)::int as n_spectra,
      count(*) filter (where s.spec_type = 'Transmission')::int as n_transmission,
      count(*) filter (where s.spec_type = 'Eclipse')::int as n_eclipse,
      array_agg(distinct s.instrument) as insts
    from exo_spectra s left join exo_planets p on p.name = s.planet
    group by s.planet, p.name
    order by count(*) desc, s.planet`);
  return rows.map(({ insts, ...r }) => {
    const sh = scaleHeight(r);
    return {
      ...r,
      instruments: [...new Set((insts ?? []).map((i) => exoInstrument(i).key))],
      scale_height_km: sh.km,
      ppm_per_h: sh.ppm,
    };
  });
}

export async function getExoSpectra(planet: string): Promise<ExoSpectrum[]> {
  "use cache";
  cacheLife("days");
  cacheTag("exo");
  const rows = await db().exoSpectrum.findMany({
    where: { planet },
    select: {
      id: true, planet: true, spec_type: true, instrument: true, authors: true, reference: true, bibcode: true,
      note: true, min_wl: true, max_wl: true, n_points: true, value_unit: true, value_kind: true, derived: true,
      points: true,
    },
    orderBy: [{ spec_type: "desc" }, { n_points: "desc" }],
  });
  return (rows as Omit<ExoSpectrum, "inst_key" | "mode">[]).map(withInst);
}
