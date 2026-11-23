"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { AGE_NOW_GYR, ageAt, comovingMpc, LY_PER_MPC, RECORD_GALAXIES, snapshot } from "@/lib/cosmology";

const Z_MAX = 1100;
const toZ = (p: number) => Math.pow(Z_MAX + 1, p) - 1;
const toP = (z: number) => Math.round((Math.log(z + 1) / Math.log(Z_MAX + 1)) * 1e5) / 1e5;

const PRESETS: { label: string; z: number }[] = [
  { label: "Stephan's Quintet", z: 0.0215 },
  { label: "SMACS 0723 cluster", z: 0.388 },
  { label: "Cosmic noon", z: 2 },
  { label: "End of reionisation", z: 6 },
  { label: "GN-z11", z: 10.6 },
  { label: "MoM-z14", z: 14.44 },
  { label: "Cosmic microwave background", z: 1089.9 },
];

// NIRCam broad/medium filters (pivot wavelength, μm).
const NIRCAM = [
  ["F070W", 0.704], ["F090W", 0.901], ["F115W", 1.154], ["F150W", 1.501], ["F200W", 1.99],
  ["F277W", 2.786], ["F356W", 3.563], ["F410M", 4.092], ["F444W", 4.421],
] as const;

const LINES = [
  { name: "Lyman-α", rest: 0.12157, note: "hydrogen, the brightest UV line of young galaxies" },
  { name: "[O III]", rest: 0.50068, note: "doubly-ionised oxygen" },
  { name: "Hα", rest: 0.65628, note: "hydrogen, traces star formation" },
];

const fmtGyr = (g: number) => (g < 0.001 ? `${(g * 1e6).toFixed(0)} thousand years` : g < 1 ? `${(g * 1000).toFixed(0)} million years` : `${g.toFixed(2)} billion years`);

/** Square-root time axis: gives the crowded first billion years room to breathe. */
const tX = (gyr: number) => Math.round(Math.sqrt(Math.max(0, gyr) / AGE_NOW_GYR) * 10000) / 100;

function wlX(um: number) {
  // log axis 0.1 → 30 μm
  return Math.round(((Math.log10(um) - Math.log10(0.1)) / (Math.log10(30) - Math.log10(0.1))) * 10000) / 100;
}

export function TimeMachine() {
  const [z, setZ] = useState(14.44);
  const s = useMemo(() => snapshot(z), [z]);
  const p = toP(z);
  const breakUm = 0.1216 * (1 + z);

  const curve = useMemo(() => {
    // Age of the universe vs redshift, and angular-diameter distance (both z ≤ 20).
    const pts: { z: number; age: number; da: number }[] = [];
    for (let i = 0; i <= 160; i++) {
      const zz = (Math.pow(21, i / 160) - 1);
      const dc = comovingMpc(zz);
      pts.push({ z: zz, age: ageAt(zz), da: ((dc / (1 + zz)) * LY_PER_MPC) / 1e9 });
    }
    return pts;
  }, []);
  const daMax = Math.max(...curve.map((c) => c.da));
  const daPeak = curve.find((c) => c.da === daMax)!;

  const W = 600;
  const H = 220;
  // Rounded so server and client render identical SVG attributes (no hydration mismatch).
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const px = (zz: number) => r1(40 + (Math.log(zz + 1) / Math.log(21)) * (W - 56));
  const pyDa = (v: number) => r1(H - 28 - (v / (daMax * 1.1)) * (H - 44));

  return (
    <div>
      {/* ── slider + headline readout ── */}
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="eyebrow">Redshift</p>
          <p className="mt-3 flex items-baseline gap-4">
            <span className="display text-[clamp(4rem,10vw,9rem)] tabular-nums text-gradient-gold">
              {z < 10 ? z.toFixed(3) : z < 100 ? z.toFixed(2) : z.toFixed(0)}
            </span>
            <span className="font-mono text-sm text-muted">z</span>
          </p>
          <input
            type="range"
            className="slider mt-8"
            min={0}
            max={1}
            step={0.0005}
            value={p}
            onChange={(e) => setZ(Number(toZ(Number(e.target.value)).toFixed(4)))}
            style={{ ["--pct" as string]: `${p * 100}%` }}
            aria-label="Redshift"
          />
          <div className="relative mt-2 h-5 font-mono text-[9.5px] text-dim">
            {[0.1, 1, 3, 10, 100, 1000].map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: `${toP(t) * 100}%` }}>
                {t}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {PRESETS.map((pr) => (
              <button
                key={pr.label}
                onClick={() => setZ(pr.z)}
                className={clsx(
                  "rounded-full border px-3 py-1.5 text-xs transition",
                  Math.abs(pr.z - z) < 1e-6 ? "border-gold bg-gold text-ink" : "border-line text-fg-2 hover:border-fg hover:text-fg",
                )}
              >
                {pr.label} <span className="font-mono opacity-70">z={pr.z}</span>
              </button>
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-sm border border-line bg-line lg:col-span-5">
          {[
            ["Light left", `${fmtGyr(s.lookbackGyr)} ago`],
            ["Universe was", `${fmtGyr(s.ageGyr)} old`],
            ["Where it is now", `${s.comovingGly.toFixed(2)} billion ly`],
            ["Where it was then", `${s.emitDistanceGly < 0.1 ? (s.emitDistanceGly * 1000).toFixed(0) + " million" : s.emitDistanceGly.toFixed(2) + " billion"} ly`],
            ["Light stretched", `${s.stretch.toFixed(2)}×`],
            ["Receding today", `${s.recessionC.toFixed(2)} c`],
            ["Background radiation", `${s.cmbK.toFixed(1)} K`],
            ["1 arcsecond spans", `${(s.kpcPerArcsec * 3261.6).toLocaleString("en-US", { maximumFractionDigits: 0 })} ly`],
          ].map(([k, v]) => (
            <div key={k} className="bg-ink px-4 py-4">
              <dt className="eyebrow !text-[9px]">{k}</dt>
              <dd className="mt-1.5 font-mono text-[14px] text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── cosmic timeline ── */}
      <div className="mt-20">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">The cosmic timeline</p>
          <p className="font-mono text-[10px] text-muted">0 → {AGE_NOW_GYR.toFixed(2)} Gyr · square-root scale</p>
        </div>
        <div className="relative mt-6 h-24">
          <div className="absolute inset-x-0 top-8 h-2 overflow-hidden rounded-full bg-gradient-to-r from-[#1a1208] via-[#3a2a12] to-[#7a5a24]" />
          {[
            [0.00038, "CMB released"],
            [0.2, "First stars & galaxies"],
            [0.95, "Reionisation ends"],
            [3.3, "Cosmic noon"],
            [9.2, "Sun forms"],
            [AGE_NOW_GYR, "Today"],
          ].map(([t, l]) => (
            <div key={l as string} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${tX(t as number)}%` }}>
              <span className="block whitespace-nowrap font-mono text-[9px] tracking-wide text-dim">{l}</span>
              <span className="mx-auto mt-1 block h-[22px] w-px bg-line-2" />
            </div>
          ))}
          <div
            className="absolute top-[22px] -translate-x-1/2 transition-[left] duration-300"
            style={{ left: `${tX(s.ageGyr)}%` }}
          >
            <span className="block h-5 w-5 rounded-full border-2 border-ink bg-gold shadow-[0_0_20px_rgba(242,196,109,0.9)]" />
            <span className="mt-2 block -translate-x-[calc(50%-10px)] whitespace-nowrap font-mono text-[10px] text-gold">
              {fmtGyr(s.ageGyr)}
            </span>
          </div>
        </div>
      </div>

      {/* ── dropout + lines ── */}
      <div className="mt-20 grid gap-16 lg:grid-cols-2">
        <div>
          <h3 className="text-2xl font-light tracking-tight">How Webb finds them: the Lyman break</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
            Neutral hydrogen between galaxies absorbs everything bluer than 121.6 nm. Redshift moves that cut-off into
            the infrared, to <span className="font-mono text-gold">{breakUm.toFixed(2)} μm</span> at this z. The galaxy
            vanishes from every filter bluer than the break and appears in the redder ones. Astronomers hunt for exactly
            this &ldquo;dropout&rdquo; pattern, then confirm the distance with a spectrum.
          </p>
          <div className="mt-8 grid grid-cols-9 gap-1.5">
            {NIRCAM.map(([name, um]) => {
              const seen = um > breakUm * 1.04;
              const partial = !seen && um > breakUm * 0.96;
              return (
                <div key={name} className="text-center">
                  <div className="relative aspect-square overflow-hidden rounded-sm border border-line bg-[#05060a]">
                    <div
                      className="absolute left-1/2 top-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-500"
                      style={{
                        background: "radial-gradient(circle, rgba(255,214,150,0.95) 0%, rgba(255,150,80,0.35) 35%, transparent 70%)",
                        opacity: seen ? 1 : partial ? 0.35 : 0,
                      }}
                    />
                  </div>
                  <p className={clsx("mt-1.5 font-mono text-[8.5px]", seen ? "text-fg-2" : "text-dim")}>{name}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-[10px] text-muted">
            Simulated source in NIRCam filters 0.7–4.4 μm. {NIRCAM.filter(([, um]) => um > breakUm * 1.04).length} of 9 detect it.
          </p>
        </div>

        <div>
          <h3 className="text-2xl font-light tracking-tight">Where the light lands</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
            Rest-frame lines, multiplied by {s.stretch.toFixed(2)}. Hubble&apos;s infrared camera stops at 1.7 μm;
            Webb&apos;s instruments cover 0.6–28 μm.
          </p>
          <div className="relative mt-8 h-44">
            {/* bands */}
            {[
              { a: 0.38, b: 0.75, label: "Human eye", color: "rgba(255,255,255,0.10)" },
              { a: 0.6, b: 5.3, label: "NIRCam · NIRSpec · NIRISS", color: "rgba(242,196,109,0.16)" },
              { a: 4.9, b: 28, label: "MIRI", color: "rgba(255,107,74,0.16)" },
              { a: 0.115, b: 1.7, label: "Hubble", color: "rgba(127,212,255,0.10)" },
            ].map((b, i) => (
              <div
                key={b.label}
                className="absolute flex h-6 items-center rounded-sm px-1.5 font-mono text-[9px] text-fg-2"
                style={{ left: `${wlX(b.a)}%`, width: `${wlX(b.b) - wlX(b.a)}%`, top: 8 + i * 28, background: b.color }}
              >
                <span className="truncate">{b.label}</span>
              </div>
            ))}
            {LINES.map((l, li) => {
              const obs = l.rest * (1 + z);
              const inRange = obs <= 30;
              return inRange ? (
                <div key={l.name} className="absolute bottom-6 top-0 transition-[left] duration-300" style={{ left: `${wlX(obs)}%` }}>
                  <div className="h-full w-px bg-gold/80 shadow-[0_0_8px_rgba(242,196,109,0.8)]" />
                  <span className="absolute left-1 whitespace-nowrap font-mono text-[9.5px] text-gold" style={{ bottom: li * 13 }}>
                    {l.name} {obs < 1 ? `${(obs * 1000).toFixed(0)} nm` : `${obs.toFixed(2)} μm`}
                  </span>
                </div>
              ) : null;
            })}
            <div className="absolute inset-x-0 bottom-0 flex justify-between font-mono text-[9px] text-dim">
              <span>0.1 μm</span>
              <span>1 μm</span>
              <span>10 μm</span>
              <span>30 μm</span>
            </div>
          </div>
          {LINES.some((l) => l.rest * (1 + z) > 30) && (
            <p className="mt-2 text-xs text-muted">Some lines are stretched beyond 30 μm: past every infrared instrument Webb carries.</p>
          )}
        </div>
      </div>

      {/* ── angular diameter turnover ── */}
      <div className="mt-24 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h3 className="text-2xl font-light tracking-tight">Farther, yet larger</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
            In an expanding universe, apparent size stops shrinking with distance. The &ldquo;angular-diameter
            distance&rdquo;, which sets how big an object looks, peaks at z ≈ {daPeak.z.toFixed(1)} and then falls. Beyond that
            point, a galaxy of fixed size appears <em>bigger</em> the farther away it is. We see it as it was when
            it was much closer to us.
          </p>
          <p className="mt-4 text-sm text-muted">
            Peak: {daMax.toFixed(2)} billion light-years. At your selected z the value is{" "}
            {((s.angularDiameterMpc * LY_PER_MPC) / 1e9).toFixed(2)} billion light-years.
          </p>
        </div>
        <div className="lg:col-span-7">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Angular-diameter distance versus redshift">
            {[0, 2, 4, 6].map((v) => (
              <g key={v}>
                <line x1={40} x2={W - 16} y1={pyDa(v)} y2={pyDa(v)} stroke="rgba(255,255,255,0.06)" />
                <text x={32} y={pyDa(v) + 3} textAnchor="end" className="fill-[#8a8d98] font-mono text-[9px]">
                  {v}
                </text>
              </g>
            ))}
            {[0, 1, 2, 5, 10, 20].map((t) => (
              <text key={t} x={px(t)} y={H - 10} textAnchor="middle" className="fill-[#8a8d98] font-mono text-[9px]">
                z={t}
              </text>
            ))}
            <path
              d={curve.map((c, i) => `${i ? "L" : "M"}${px(c.z).toFixed(1)},${pyDa(c.da).toFixed(1)}`).join(" ")}
              fill="none"
              stroke="#bb8809"
              strokeWidth={2}
            />
            {z <= 20 && (
              <g>
                <line x1={px(z)} x2={px(z)} y1={16} y2={H - 28} stroke="rgba(242,196,109,0.4)" strokeDasharray="3 3" />
                <circle cx={px(z)} cy={pyDa((s.angularDiameterMpc * LY_PER_MPC) / 1e9)} r={5} fill="#f2c46d" stroke="#030407" strokeWidth={2} />
              </g>
            )}
            <text x={44} y={14} className="fill-[#8a8d98] font-mono text-[9px]">
              billion light-years
            </text>
          </svg>
        </div>
      </div>

      {/* ── record holders ── */}
      <div className="mt-24">
        <h3 className="text-2xl font-light tracking-tight">The race to the first galaxies</h3>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-2">
          A selection of galaxies spectroscopically confirmed with Webb (GN-z11 was re-confirmed), placed on the first
          600 million years of cosmic history. Click one to load its redshift.
        </p>
        <div className="mt-10 space-y-2">
          {RECORD_GALAXIES.map((g) => {
            const age = ageAt(g.z) * 1000;
            const active = Math.abs(g.z - z) < 1e-6;
            return (
              <button
                key={g.name}
                onClick={() => setZ(g.z)}
                className={clsx(
                  "group grid w-full grid-cols-12 items-center gap-4 rounded-sm px-3 py-2.5 text-left transition",
                  active ? "bg-white/[0.05]" : "hover:bg-white/[0.03]",
                )}
              >
                <span className="col-span-4 truncate text-sm md:col-span-3">{g.name}</span>
                <span className="col-span-2 font-mono text-xs text-gold md:col-span-1">z {g.z}</span>
                <span className="relative col-span-6 h-2 md:col-span-5">
                  <span className="absolute inset-y-[3px] left-0 right-0 rounded-full bg-white/5" />
                  <span
                    className={clsx("absolute top-0 h-2 w-2 -translate-x-1/2 rounded-full", active ? "bg-gold shadow-[0_0_12px_#f2c46d]" : "bg-fg-2")}
                    style={{ left: `${Math.round((age / 600) * 10000) / 100}%` }}
                  />
                </span>
                <span className="col-span-12 font-mono text-[10.5px] text-muted md:col-span-3">
                  {age.toFixed(0)} Myr after the Big Bang · {g.ref}
                </span>
              </button>
            );
          })}
          <div className="grid grid-cols-12 gap-4 px-3 font-mono text-[9px] text-dim">
            <span className="col-span-6 md:col-span-4" />
            <span className="col-span-6 flex justify-between md:col-span-5">
              <span>0</span>
              <span>200</span>
              <span>400</span>
              <span>600 Myr</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
