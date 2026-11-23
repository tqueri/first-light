/**
 * NASA Exoplanet Archive → Postgres: JWST atmospheric spectra (transmission &
 * eclipse) and the parameters of the planets they belong to.
 *
 * The archive serves spectrum files only from a per-session "workspace" folder,
 * so we mint a workspace token once (and re-mint on 404).
 */
import type { Pool } from "pg";

const HOST = "https://exoplanetarchive.ipac.caltech.edu";
const TAP = `${HOST}/TAP/sync`;
const UA = "FirstLight-WebbExplorer/1.0 (educational, non-commercial)";

export type SpectrumMeta = {
  pl_name: string;
  spec_type: string;
  authors: string | null;
  num_datapoints: number | null;
  instrument: string | null;
  facility: string | null;
  minwavelng: number | null;
  maxwavelng: number | null;
  note: string | null;
  bibcode: string | null;
  spec_path: string;
};

export type ParsedSpectrum = {
  header: Record<string, string>;
  /** [wl_um, value, err_plus, err_minus, halfwidth_um] */
  points: [number, number, number | null, number | null, number | null][];
  unit: string; // "ppm" | "K"
  kind: "transit_depth" | "eclipse_depth" | "brightness_temp";
  derived: boolean;
  skippedLimits: number;
};

async function fetchText(url: string, timeout = 90_000): Promise<{ status: number; text: string }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(timeout) });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

export async function tap<T>(adql: string): Promise<T[]> {
  const url = `${TAP}?query=${encodeURIComponent(adql)}&format=json`;
  const { status, text } = await fetchText(url);
  if (status !== 200) throw new Error(`TAP HTTP ${status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T[];
}

export async function listJwstSpectra(): Promise<SpectrumMeta[]> {
  return tap<SpectrumMeta>(
    `select pl_name, spec_type, authors, num_datapoints, instrument, facility, minwavelng, maxwavelng, note, bibcode, spec_path
     from spectra where facility like '%JWST%' and spec_type in ('Transmission', 'Eclipse')`,
  );
}

export class Workspace {
  private token: string | null = null;
  async mint() {
    const { text } = await fetchText(`${HOST}/cgi-bin/atmospheres/nph-firefly?atmospheres`);
    const m = text.match(/\/workspace\/TMP_[A-Za-z0-9_]+/);
    if (!m) throw new Error("Could not obtain an Exoplanet Archive workspace token");
    this.token = m[0];
    return this.token;
  }
  async download(specPath: string): Promise<string> {
    if (!this.token) await this.mint();
    let res = await fetchText(`${HOST}${this.token}/atmospheres/tab1/data/${specPath}`);
    if (res.status === 404) {
      await this.mint();
      res = await fetchText(`${HOST}${this.token}/atmospheres/tab1/data/${specPath}`);
    }
    if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${specPath}`);
    return res.text;
  }
}

/** Parse an IPAC table, slicing data rows by the `|` column bounds of the header. */
export function parseIpac(text: string): { header: Record<string, string>; rows: Record<string, string | null>[] } {
  const lines = text.split(/\r?\n/);
  const header: Record<string, string> = {};
  let colLine: string | null = null;
  const rows: Record<string, string | null>[] = [];
  let pipes: number[] = [];
  let names: string[] = [];
  let pipeLinesSeen = 0;
  for (const line of lines) {
    if (line.startsWith("\\")) {
      const m = line.match(/^\\\s*([A-Za-z_][\w]*)\s*=\s*'?(.*?)'?\s*$/);
      if (m) header[m[1].toUpperCase()] = m[2];
      continue;
    }
    if (line.startsWith("|")) {
      pipeLinesSeen++;
      if (!colLine) {
        colLine = line;
        pipes = [];
        for (let i = 0; i < line.length; i++) if (line[i] === "|") pipes.push(i);
        names = [];
        for (let i = 0; i < pipes.length - 1; i++) names.push(line.slice(pipes[i] + 1, pipes[i + 1]).trim().toUpperCase());
      }
      continue;
    }
    if (!colLine || !line.trim()) continue;
    const row: Record<string, string | null> = {};
    for (let i = 0; i < names.length; i++) {
      const raw = line.slice(pipes[i], pipes[i + 1]).trim();
      row[names[i]] = raw === "" || raw.toLowerCase() === "null" ? null : raw;
    }
    rows.push(row);
  }
  void pipeLinesSeen;
  return { header, rows };
}

const num = (v: string | null | undefined) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function parseSpectrum(text: string, specType: string): ParsedSpectrum | null {
  const { header, rows } = parseIpac(text);
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);
  const has = (c: string) => cols.includes(c);
  const points: ParsedSpectrum["points"] = [];
  let skippedLimits = 0;

  const pick = (
    valueCol: string,
    scale: number,
    errFromValue?: (v: number, e: number) => number,
  ): void => {
    for (const r of rows) {
      const wl = num(r.CENTRALWAVELNG);
      let v = num(r[valueCol]);
      if (wl == null || v == null) continue;
      const lim = num(r[`${valueCol}LIM`]);
      if (lim && lim !== 0 && !(valueCol === "PL_RATROR" && lim === 2)) {
        skippedLimits++;
        continue;
      }
      let ep = num(r[`${valueCol}ERR1`]);
      let em = num(r[`${valueCol}ERR2`]);
      if (errFromValue) {
        ep = ep != null ? errFromValue(v, ep) : null;
        em = em != null ? errFromValue(v, Math.abs(em)) : null;
        v = v * v;
      }
      const bw = num(r.BANDWIDTH);
      points.push([
        wl,
        +(v * scale).toPrecision(7),
        ep != null ? +(Math.abs(ep) * scale).toPrecision(5) : null,
        em != null ? +(Math.abs(em) * scale).toPrecision(5) : null,
        bw != null ? +(bw / 2).toPrecision(5) : null,
      ]);
    }
  };

  let kind: ParsedSpectrum["kind"];
  let unit = "ppm";
  let derived = false;
  if (specType === "Transmission") {
    kind = "transit_depth";
    if (has("PL_TRANDEP") && rows.some((r) => r.PL_TRANDEP != null)) pick("PL_TRANDEP", 1e4); // % → ppm
    else if (has("PL_RATROR") && rows.some((r) => r.PL_RATROR != null)) {
      // depth = (Rp/Rs)², σ_depth = 2 (Rp/Rs) σ
      pick("PL_RATROR", 1e6, (v, e) => 2 * v * e);
      derived = true;
    } else return null;
  } else {
    if (has("ESPECLIPDEP") && rows.some((r) => r.ESPECLIPDEP != null)) {
      kind = "eclipse_depth";
      pick("ESPECLIPDEP", 1e4);
    } else if (has("ESPBRITEMP") && rows.some((r) => r.ESPBRITEMP != null)) {
      kind = "brightness_temp";
      unit = "K";
      pick("ESPBRITEMP", 1);
    } else return null;
  }
  if (!points.length) return null;
  points.sort((a, b) => a[0] - b[0]);
  return { header, points, unit, kind, derived, skippedLimits };
}

export async function ingestSpectra(pool: Pool, log: (s: string) => void = console.log) {
  const list = await listJwstSpectra();
  log(`[exo] ${list.length} JWST transmission/eclipse spectra listed`);
  const done = new Set(
    (await pool.query<{ id: string }>(`select id from exo_spectra where points is not null`)).rows.map((r) => r.id),
  );
  const ws = new Workspace();
  let ok = 0;
  let skipped = 0;
  for (const [i, s] of list.entries()) {
    if (done.has(s.spec_path)) {
      ok++;
      continue;
    }
    try {
      const text = await ws.download(s.spec_path);
      const parsed = parseSpectrum(text, s.spec_type);
      if (!parsed) {
        skipped++;
        log(`  - ${s.pl_name} ${s.spec_path}: no usable columns`);
        continue;
      }
      const wls = parsed.points.map((p) => p[0]);
      await pool.query(
        `insert into exo_spectra (id, planet, spec_type, instrument, authors, bibcode, note, min_wl, max_wl, points,
           value_unit, n_points, reference, value_kind, derived)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         on conflict (id) do update set planet=excluded.planet, spec_type=excluded.spec_type, instrument=excluded.instrument,
           authors=excluded.authors, bibcode=excluded.bibcode, note=excluded.note, min_wl=excluded.min_wl,
           max_wl=excluded.max_wl, points=excluded.points, value_unit=excluded.value_unit, n_points=excluded.n_points,
           reference=excluded.reference, value_kind=excluded.value_kind, derived=excluded.derived, ingested_at=now()`,
        [
          s.spec_path,
          s.pl_name,
          s.spec_type,
          s.instrument,
          s.authors,
          s.bibcode,
          s.note && s.note !== "None" ? s.note : null,
          Math.min(...wls),
          Math.max(...wls),
          JSON.stringify(parsed.points),
          parsed.unit,
          parsed.points.length,
          parsed.header.REFERENCE ?? s.authors,
          parsed.kind,
          parsed.derived,
        ],
      );
      ok++;
      if (i % 20 === 0) log(`  ${i + 1}/${list.length} ${s.pl_name} (${parsed.points.length} pts, ${parsed.kind})`);
    } catch (e) {
      skipped++;
      log(`  ! ${s.pl_name} ${s.spec_path}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 250)); // be polite
  }
  return { listed: list.length, ok, skipped };
}

type PlanetRow = {
  pl_name: string;
  hostname: string | null;
  pl_rade: number | null;
  pl_bmasse: number | null;
  pl_orbper: number | null;
  pl_eqt: number | null;
  sy_dist: number | null;
  disc_year: number | null;
  st_teff: number | null;
  st_spectype: string | null;
  st_rad: number | null;
  pl_insol: number | null;
};

export async function ingestPlanets(pool: Pool, log: (s: string) => void = console.log) {
  const names = (await pool.query<{ planet: string }>(`select distinct planet from exo_spectra`)).rows.map((r) => r.planet);
  let stored = 0;
  for (let i = 0; i < names.length; i += 40) {
    const batch = names.slice(i, i + 40);
    const inList = batch.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
    const rows = await tap<PlanetRow>(
      `select pl_name, hostname, pl_rade, pl_bmasse, pl_orbper, pl_eqt, sy_dist, disc_year, st_teff, st_spectype, st_rad, pl_insol
       from pscomppars where pl_name in (${inList})`,
    );
    for (const p of rows) {
      await pool.query(
        `insert into exo_planets (name, host, radius_re, mass_me, period_days, eq_temp_k, distance_pc, disc_year,
           host_teff, host_spectype, star_rad_rsun, insol_earth)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (name) do update set host=excluded.host, radius_re=excluded.radius_re, mass_me=excluded.mass_me,
           period_days=excluded.period_days, eq_temp_k=excluded.eq_temp_k, distance_pc=excluded.distance_pc,
           disc_year=excluded.disc_year, host_teff=excluded.host_teff, host_spectype=excluded.host_spectype,
           star_rad_rsun=excluded.star_rad_rsun, insol_earth=excluded.insol_earth`,
        [p.pl_name, p.hostname, p.pl_rade, p.pl_bmasse, p.pl_orbper, p.pl_eqt, p.sy_dist, p.disc_year, p.st_teff,
         p.st_spectype, p.st_rad, p.pl_insol],
      );
      stored++;
    }
  }
  const missing = names.length - stored;
  log(`[exo] ${stored} planets stored (${missing} without a pscomppars match)`);
  return { planets: names.length, stored };
}
