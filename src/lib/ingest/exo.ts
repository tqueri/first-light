/**
 * NASA Exoplanet Archive → Postgres: JWST atmospheric spectra (transmission &
 * eclipse) and the parameters of the planets they belong to.
 *
 * The archive serves spectrum files only from a per-session "workspace" folder,
 * so we mint a workspace token once (and re-mint on 404).
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

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

export async function ingestSpectra(db: PrismaClient, log: (s: string) => void = console.log) {
  const list = await listJwstSpectra();
  log(`[exo] ${list.length} JWST transmission/eclipse spectra listed`);
  const done = new Set(
    (await db.exoSpectrum.findMany({ where: { points: { not: Prisma.DbNull } }, select: { id: true } })).map((r) => r.id),
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
      const data = {
        planet: s.pl_name,
        spec_type: s.spec_type,
        instrument: s.instrument,
        authors: s.authors,
        bibcode: s.bibcode,
        note: s.note && s.note !== "None" ? s.note : null,
        min_wl: Math.min(...wls),
        max_wl: Math.max(...wls),
        points: parsed.points,
        value_unit: parsed.unit,
        n_points: parsed.points.length,
        reference: parsed.header.REFERENCE ?? s.authors,
        value_kind: parsed.kind,
        derived: parsed.derived,
      };
      await db.exoSpectrum.upsert({
        where: { id: s.spec_path },
        create: { id: s.spec_path, ...data },
        update: { ...data, ingested_at: new Date() },
      });
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

export async function ingestPlanets(db: PrismaClient, log: (s: string) => void = console.log) {
  const names = (await db.exoSpectrum.findMany({ distinct: ["planet"], select: { planet: true } })).map((r) => r.planet);
  let stored = 0;
  for (let i = 0; i < names.length; i += 40) {
    const batch = names.slice(i, i + 40);
    const inList = batch.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
    const rows = await tap<PlanetRow>(
      `select pl_name, hostname, pl_rade, pl_bmasse, pl_orbper, pl_eqt, sy_dist, disc_year, st_teff, st_spectype, st_rad, pl_insol
       from pscomppars where pl_name in (${inList})`,
    );
    for (const p of rows) {
      const data = {
        host: p.hostname,
        radius_re: p.pl_rade,
        mass_me: p.pl_bmasse,
        period_days: p.pl_orbper,
        eq_temp_k: p.pl_eqt,
        distance_pc: p.sy_dist,
        disc_year: p.disc_year,
        host_teff: p.st_teff,
        host_spectype: p.st_spectype,
        star_rad_rsun: p.st_rad,
        insol_earth: p.pl_insol,
      };
      await db.exoPlanet.upsert({ where: { name: p.pl_name }, create: { name: p.pl_name, ...data }, update: data });
      stored++;
    }
  }
  const missing = names.length - stored;
  log(`[exo] ${stored} planets stored (${missing} without a pscomppars match)`);
  return { planets: names.length, stored };
}
