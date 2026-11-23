"use client";

import { useMemo, useRef, useState } from "react";
import type { ExoPlanet, ExoSpectrum, InstKey } from "@/lib/data-exo";
import { INSTRUMENTS } from "@/lib/instruments";
import { NOTABLE } from "./notable";
import { SpectrumChart, type ChartSeries } from "./spectrum-chart";
import { binSpectrum, fmtPpm, seriesColor } from "./spectrum-utils";

const instMeta = (k: InstKey) => INSTRUMENTS.find((i) => i.key === k) ?? INSTRUMENTS[4];
const colorFor = (s: ExoSpectrum, idx: number) => seriesColor(instMeta(s.inst_key).color, idx);
const LY_PER_PC = 3.26156;
const R_SUN_KM = 695_700;
const R_EARTH_JUP = 11.209;

type Kind = "transit_depth" | "eclipse_depth" | "brightness_temp";
const KIND_LABEL: Record<Kind, string> = {
  transit_depth: "Transmission",
  eclipse_depth: "Emission (eclipse)",
  brightness_temp: "Brightness temperature",
};

function defaultVisible(spectra: ExoSpectrum[], planet: string): Set<string> {
  if (planet === "WASP-39 b") {
    const prism = spectra.find((s) => s.mode === "PRISM");
    if (prism) return new Set([prism.id]);
  }
  const sorted = [...spectra].sort((a, b) => b.max_wl - b.min_wl - (a.max_wl - a.min_wl) || b.n_points - a.n_points);
  const out: ExoSpectrum[] = [];
  for (const s of sorted) {
    if (out.length >= 3) break;
    if (!out.length || !out.some((o) => o.inst_key === s.inst_key)) out.push(s);
  }
  return new Set(out.map((s) => s.id));
}

function sizeClass(r: number | null) {
  if (r == null) return "unknown";
  if (r < 1.6) return "rocky";
  if (r < 4) return "subneptune";
  if (r < 8) return "neptune";
  return "giant";
}
const SIZE_LABEL: Record<string, string> = {
  all: "All sizes",
  rocky: "Rocky < 1.6 R⊕",
  subneptune: "Sub-Neptune 1.6–4",
  neptune: "Neptune 4–8",
  giant: "Giant > 8",
};

type SortKey = "name" | "radius_re" | "eq_temp_k" | "distance_pc" | "n_spectra" | "ppm_per_h";

export function WorldsExplorer({
  planets,
  initialPlanet,
  initialSpectra,
}: {
  planets: ExoPlanet[];
  initialPlanet: string;
  initialSpectra: ExoSpectrum[];
}) {
  const [planet, setPlanet] = useState(initialPlanet);
  const [cache, setCache] = useState<Record<string, ExoSpectrum[]>>({ [initialPlanet]: initialSpectra });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("transit_depth");
  const [visible, setVisible] = useState<Set<string>>(() =>
    defaultVisible(initialSpectra.filter((s) => s.value_kind === "transit_depth"), initialPlanet),
  );
  const chartRef = useRef<HTMLDivElement>(null);

  const spectra = cache[planet];
  const info = planets.find((p) => p.name === planet) ?? null;

  async function select(name: string, scroll = true) {
    setError(null);
    setPlanet(name);
    if (scroll) chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    let list = cache[name];
    if (!list) {
      setLoading(true);
      try {
        const res = await fetch(`/worlds/spectra?planet=${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        list = (await res.json()) as ExoSpectrum[];
        setCache((c) => ({ ...c, [name]: list! }));
      } catch (e) {
        setError(`Could not load spectra (${(e as Error).message}).`);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    const kinds = new Set(list.map((s) => s.value_kind));
    const k: Kind = kinds.has("transit_depth") ? "transit_depth" : kinds.has("eclipse_depth") ? "eclipse_depth" : "brightness_temp";
    setKind(k);
    setVisible(defaultVisible(list.filter((s) => s.value_kind === k), name));
  }

  function switchKind(k: Kind) {
    setKind(k);
    if (spectra) setVisible(defaultVisible(spectra.filter((s) => s.value_kind === k), planet));
  }

  const ofKind = useMemo(() => (spectra ?? []).filter((s) => s.value_kind === kind), [spectra, kind]);
  const kindsAvailable = useMemo(() => {
    const m = new Map<Kind, number>();
    for (const s of spectra ?? []) m.set(s.value_kind, (m.get(s.value_kind) ?? 0) + 1);
    return m;
  }, [spectra]);

  const series: ChartSeries[] = useMemo(() => {
    const perInst = new Map<InstKey, number>();
    return ofKind
      .filter((s) => visible.has(s.id))
      .map((s) => {
        const idx = perInst.get(s.inst_key) ?? 0;
        perInst.set(s.inst_key, idx + 1);
        const binned = s.points.length > 350;
        return {
          id: s.id,
          label: `${s.reference ?? s.authors ?? "Unknown"} · ${instMeta(s.inst_key).label}${s.mode ? " " + s.mode : ""}`,
          color: colorFor(s, idx),
          points: binned ? binSpectrum(s.points, 220) : s.points,
          binned,
        };
      });
  }, [ofKind, visible]);


  // legend colours must match chart colours (index per instrument among *visible* series)
  const legendColor = useMemo(() => {
    const out = new Map<string, string>();
    const perInst = new Map<InstKey, number>();
    for (const s of ofKind) {
      if (!visible.has(s.id)) continue;
      const idx = perInst.get(s.inst_key) ?? 0;
      perInst.set(s.inst_key, idx + 1);
      out.set(s.id, colorFor(s, idx));
    }
    return out;
  }, [ofKind, visible]);

  const unit = ofKind[0]?.value_unit ?? "ppm";
  const starKm = info?.star_rad_rsun ? info.star_rad_rsun * R_SUN_KM : null;

  /* ── planet browser state ── */
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "transmission" | "eclipse">("all");
  const [size, setSize] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "n_spectra", dir: -1 });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return planets
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.host ?? "").toLowerCase().includes(q))
      .filter((p) => typeFilter === "all" || (typeFilter === "transmission" ? p.n_transmission > 0 : p.n_eclipse > 0))
      .filter((p) => size === "all" || sizeClass(p.radius_re) === size)
      .sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number)) * sort.dir;
      });
  }, [planets, query, typeFilter, size, sort]);

  const th = (key: SortKey, label: string, cls = "") => (
    <th className={"px-3 py-3 font-normal " + cls}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" ? 1 : -1 }))}
        className={"inline-flex items-center gap-1 uppercase hover:text-fg " + (sort.key === key ? "text-gold" : "")}
      >
        {label}
        {sort.key === key && <span>{sort.dir === 1 ? "↑" : "↓"}</span>}
      </button>
    </th>
  );

  const radiusBar = (r: number | null) => {
    if (r == null) return <span className="text-dim">—</span>;
    const t = (x: number) => (Math.log(x / 0.5) / Math.log(25 / 0.5)) * 100;
    return (
      <div className="flex items-center gap-3">
        <div className="relative h-1.5 w-28 rounded-full bg-white/[0.06]">
          <div className="absolute inset-y-0 left-0 rounded-full bg-fg-2/70" style={{ width: `${Math.min(100, t(r)).toFixed(2)}%` }} />
          <span className="absolute -top-1 h-3.5 w-px bg-ice/70" style={{ left: `${t(1).toFixed(2)}%` }} title="Earth" />
          <span className="absolute -top-1 h-3.5 w-px bg-gold/80" style={{ left: `${t(R_EARTH_JUP).toFixed(2)}%` }} title="Jupiter" />
        </div>
        <span className="font-mono tabular-nums">{r.toFixed(2)}</span>
      </div>
    );
  };

  const notable = NOTABLE.filter((n) => planets.some((p) => p.name === n.planet));

  return (
    <>
      {/* ───────────── EXPLORER ───────────── */}
      <section ref={chartRef} id="explorer" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-20 md:px-8 md:py-24">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="eyebrow">Spectrum viewer</p>
              <h2 className="display mt-5 text-[clamp(2.4rem,4.4vw,4.2rem)]">{planet}</h2>
              {info && (
                <p className="mt-3 text-sm text-muted">
                  orbiting {info.host ?? "—"}
                  {info.host_spectype ? ` (${info.host_spectype})` : ""}
                  {info.distance_pc ? ` · ${fmtPpm(info.distance_pc * LY_PER_PC)} light-years away` : ""}
                </p>
              )}
              {info && (
                <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line text-sm">
                  {[
                    ["Radius", info.radius_re != null ? `${info.radius_re.toFixed(2)} R⊕ · ${(info.radius_re / R_EARTH_JUP).toFixed(2)} R_Jup` : "—"],
                    ["Mass", info.mass_me != null ? `${info.mass_me.toFixed(1)} M⊕` : "—"],
                    ["Equilibrium T", info.eq_temp_k != null ? `${Math.round(info.eq_temp_k)} K` : "—"],
                    ["Orbit", info.period_days != null ? `${info.period_days.toFixed(2)} days` : "—"],
                    ["Scale height H", info.scale_height_km != null ? `${fmtPpm(info.scale_height_km)} km` : "—"],
                    ["Signal per H", info.ppm_per_h != null ? `${fmtPpm(info.ppm_per_h)} ppm` : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-ink px-3.5 py-3">
                      <dt className="eyebrow !text-[9px]">{k}</dt>
                      <dd className="mt-1 font-mono text-[13px] tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-3 text-[11.5px] leading-relaxed text-dim">
                H = kT/(μg) assumes a hydrogen–helium atmosphere (μ = 2.3) at the equilibrium temperature. Signal per H
                ≈ 2·H·Rp/R★². Parameters: NASA Exoplanet Archive composite table.
              </p>
            </div>

            <div className="min-w-0 lg:col-span-8">
              <div className="mb-4 flex flex-wrap gap-2">
                {(["transit_depth", "eclipse_depth", "brightness_temp"] as Kind[])
                  .filter((k) => kindsAvailable.get(k))
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => switchKind(k)}
                      className={
                        "rounded-full px-4 py-2 text-[13px] transition " +
                        (k === kind ? "bg-fg text-ink" : "border border-line-2 text-fg-2 hover:border-fg")
                      }
                    >
                      {KIND_LABEL[k]} <span className="ml-1 font-mono text-[11px] opacity-60">{kindsAvailable.get(k)}</span>
                    </button>
                  ))}
              </div>

              <div className="relative min-h-[430px] rounded-sm border border-line bg-ink-2/60 p-4 md:p-5">
                {loading && (
                  <div className="absolute inset-0 z-20 grid place-items-center bg-ink/60 backdrop-blur-sm">
                    <p className="font-mono text-xs tracking-[0.2em] text-muted uppercase">Fetching spectra…</p>
                  </div>
                )}
                {error && <p className="text-sm text-ember">{error}</p>}
                {series.length > 0 ? (
                  <SpectrumChart
                    series={series}
                    unit={unit}
                    yLabel={kind === "transit_depth" ? "Transit depth" : kind === "eclipse_depth" ? "Eclipse depth" : "Brightness T"}
                    showRatio={kind === "transit_depth"}
                    ppmPerH={kind === "transit_depth" ? info?.ppm_per_h : null}
                    starRadiusKm={kind === "transit_depth" ? starKm : null}
                  />
                ) : (
                  !loading && (
                    <p className="grid h-[380px] place-items-center text-sm text-muted">
                      Select at least one spectrum below.
                    </p>
                  )
                )}
              </div>

              {/* legend / series toggles */}
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {ofKind.map((s) => {
                  const on = visible.has(s.id);
                  const inst = instMeta(s.inst_key);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-[13px]">
                      <button
                        type="button"
                        onClick={() =>
                          setVisible((v) => {
                            const n = new Set(v);
                            if (n.has(s.id)) n.delete(s.id);
                            else n.add(s.id);
                            return n;
                          })
                        }
                        className="flex min-w-0 items-center gap-3 text-left"
                        aria-pressed={on}
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border"
                          style={{
                            background: on ? legendColor.get(s.id) : "transparent",
                            borderColor: on ? legendColor.get(s.id) : inst.color,
                          }}
                        />
                        <span className={on ? "text-fg" : "text-muted"}>{s.reference ?? s.authors}</span>
                      </button>
                      <span className="font-mono text-[11px]" style={{ color: inst.color }}>
                        {inst.label}
                        {s.mode ? ` ${s.mode}` : ""}
                      </span>
                      <span className="font-mono text-[11px] text-dim">
                        {s.min_wl.toFixed(2)}–{s.max_wl.toFixed(2)} μm · {s.n_points} pts
                        {s.n_points > 350 ? " (binned for display)" : ""}
                        {s.note ? ` · ${s.note}` : ""}
                      </span>
                      {s.bibcode && (
                        <a
                          href={`https://ui.adsabs.harvard.edu/abs/${s.bibcode}`}
                          target="_blank"
                          rel="noreferrer"
                          className="link-underline ml-auto font-mono text-[11px] text-fg-2"
                        >
                          {s.bibcode} ↗
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[12px] leading-relaxed text-dim">
                Different reductions of the same planet can be offset vertically. Choices of limb darkening, orbital
                parameters and stellar activity correction shift the absolute depth. Compare the shapes of features,
                not their levels.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── NOTABLE WORLDS ───────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-20 md:px-8 md:py-24">
          <p className="eyebrow">Headline worlds</p>
          <h2 className="display mt-5 max-w-[20ch] text-[clamp(2rem,3.6vw,3.4rem)]">What Webb has actually found.</h2>
          <div className="mt-12 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-2 xl:grid-cols-3">
            {notable.map((n) => {
              const p = planets.find((x) => x.name === n.planet)!;
              const density =
                p.mass_me && p.radius_re ? (5.514 * p.mass_me) / p.radius_re ** 3 : null; // g/cm³, Earth = 5.514
              return (
                <article key={n.planet} className="flex flex-col bg-ink p-7">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] tracking-[0.2em] text-gold uppercase">{n.tag}</p>
                    <p className="font-mono text-[10px] text-dim">{p.n_spectra} JWST spectra</p>
                  </div>
                  <h3 className="mt-4 text-2xl font-light tracking-tight">{n.planet}</h3>
                  <p className="mt-1 text-[15px] text-fg-2">{n.title}</p>
                  <p className="mt-4 text-[14px] leading-relaxed text-muted">{n.body}</p>
                  <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-fg-2">
                    {p.radius_re != null && <span>{p.radius_re.toFixed(2)} R⊕</span>}
                    {density != null && <span>{density.toFixed(2)} g/cm³</span>}
                    {p.eq_temp_k != null && <span>T_eq {Math.round(p.eq_temp_k)} K</span>}
                    {p.insol_earth != null && <span>{p.insol_earth.toFixed(p.insol_earth < 10 ? 2 : 0)}× Earth&apos;s insolation</span>}
                  </dl>
                  <p className="mt-4 text-[11px] text-dim">{n.refs}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-6">
                    {[n.planet, ...(n.also ?? [])]
                      .filter((name) => planets.some((x) => x.name === name))
                      .map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => select(name)}
                          className={
                            "rounded-full border px-4 py-2 text-[12.5px] transition " +
                            (planet === name ? "border-gold text-gold" : "border-line-2 text-fg hover:border-fg")
                          }
                        >
                          View {name} spectra →
                        </button>
                      ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────────── PLANET BROWSER ───────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-20 md:px-8 md:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow">Every planet with a JWST spectrum</p>
              <h2 className="display mt-5 text-[clamp(2rem,3.6vw,3.4rem)]">{planets.length} worlds, one archive.</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search planet or star…"
                className="w-56 rounded-full border border-line-2 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-dim focus:border-gold"
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                className="rounded-full border border-line-2 bg-ink px-3 py-2 text-sm outline-none focus:border-gold"
                aria-label="Spectrum type"
              >
                <option value="all">All spectra</option>
                <option value="transmission">Transmission</option>
                <option value="eclipse">Eclipse</option>
              </select>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="rounded-full border border-line-2 bg-ink px-3 py-2 text-sm outline-none focus:border-gold"
                aria-label="Planet size"
              >
                {Object.entries(SIZE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* desktop table */}
          <div className="mt-10 hidden max-h-[640px] overflow-auto rounded-sm border border-line md:block">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 z-10 bg-ink-2/95 font-mono text-[10px] tracking-[0.16em] text-muted backdrop-blur">
                <tr>
                  {th("name", "Planet")}
                  {th("radius_re", "Radius (R⊕)")}
                  {th("eq_temp_k", "T_eq")}
                  {th("distance_pc", "Distance")}
                  {th("ppm_per_h", "Signal / H")}
                  {th("n_spectra", "Spectra")}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.name}
                    onClick={() => select(p.name)}
                    className={
                      "cursor-pointer border-t border-line transition hover:bg-white/[0.03] " +
                      (p.name === planet ? "bg-gold/[0.06]" : "")
                    }
                  >
                    <td className="px-3 py-2.5">
                      <span className={p.name === planet ? "text-gold" : "text-fg"}>{p.name}</span>
                      <span className="ml-2 text-[11px] text-dim">{p.host_spectype ?? ""}</span>
                    </td>
                    <td className="px-3 py-2.5">{radiusBar(p.radius_re)}</td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">{p.eq_temp_k != null ? `${Math.round(p.eq_temp_k)} K` : "—"}</td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">
                      {p.distance_pc != null ? `${fmtPpm(p.distance_pc * LY_PER_PC)} ly` : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">{p.ppm_per_h != null ? `${fmtPpm(p.ppm_per_h)} ppm` : "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 font-mono tabular-nums">{p.n_spectra}</span>
                        {p.instruments.map((k) => (
                          <span
                            key={k}
                            className="rounded-full px-1.5 py-px font-mono text-[9.5px] text-ink"
                            style={{ background: instMeta(k).color }}
                          >
                            {instMeta(k).label}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="p-6 text-sm text-muted">No planet matches these filters.</p>}
          </div>

          {/* mobile list */}
          <ul className="mt-8 max-h-[70vh] divide-y divide-line overflow-auto border-y border-line md:hidden">
            {rows.map((p) => (
              <li key={p.name}>
                <button type="button" onClick={() => select(p.name)} className="w-full py-3.5 text-left">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={p.name === planet ? "text-gold" : "text-fg"}>{p.name}</span>
                    <span className="font-mono text-[11px] text-muted">{p.n_spectra} spectra</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-dim">
                    {p.radius_re != null ? `${p.radius_re.toFixed(2)} R⊕` : "—"} ·{" "}
                    {p.eq_temp_k != null ? `${Math.round(p.eq_temp_k)} K` : "—"} ·{" "}
                    {p.distance_pc != null ? `${fmtPpm(p.distance_pc * LY_PER_PC)} ly` : "—"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 font-mono text-[10.5px] text-dim">
            Radius bar: log scale 0.5–25 R⊕ · <span className="text-ice">|</span> Earth · <span className="text-gold">|</span>{" "}
            Jupiter
          </p>
        </div>
      </section>
    </>
  );
}
