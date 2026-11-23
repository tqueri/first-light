"use client";

import { useMemo, useState } from "react";
import type { ExoPoint } from "@/lib/data-exo";
import { bandAt, binSpectrum, fmtPpm, interp, smooth } from "./spectrum-utils";

type Props = {
  planet: string;
  points: ExoPoint[];
  color: string;
  starRadiusKm: number | null;
  ppmPerH: number | null;
  source: string;
};

const STAR_R = 118;

export function TransitDiagram({ planet, points, color, starRadiusKm, ppmPerH, source }: Props) {
  const curve = useMemo(() => smooth(binSpectrum(points, 120), 5), [points]);
  const lo = curve[0]?.[0] ?? 0.6;
  const hi = curve[curve.length - 1]?.[0] ?? 5.3;
  const [wl, setWl] = useState(() => (lo <= 4.3 && hi >= 4.3 ? 4.32 : (lo + hi) / 2));

  const dMin = Math.min(...curve.map((p) => p[1]));
  const dMax = Math.max(...curve.map((p) => p[1]));
  const d = interp(curve, wl) ?? dMin;
  const frac = dMax > dMin ? (d - dMin) / (dMax - dMin) : 0;
  const ratio = Math.sqrt(d / 1e6);
  const ratioMin = Math.sqrt(dMin / 1e6);
  const dRkm = starRadiusKm ? (ratio - ratioMin) * starRadiusKm : null;
  const band = bandAt(wl);

  // Scene geometry: the planet disc is drawn at true scale relative to the star.
  const rp = ratioMin * STAR_R;
  const atmoPx = 3 + frac * 9; // exaggerated, labelled as such
  const pct = ((wl - lo) / (hi - lo)) * 100;

  // Light curve: true-scale transit, trapezoid.
  const lc = (depth: number) => {
    const W = 260;
    const H = 84;
    const top = 10;
    const yOf = (f: number) => top + ((1 - f) / ((dMax / 1e6) * 1.12)) * (H - top - 6);
    const xs = [0, 70, 92, 168, 190, W];
    const ys = [1, 1, 1 - depth / 1e6, 1 - depth / 1e6, 1, 1];
    return xs.map((x, i) => `${i ? "L" : "M"}${x},${yOf(ys[i]).toFixed(2)}`).join(" ");
  };

  return (
    <div className="glass brackets rounded-sm p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">Live model · {planet}</p>
        <p className="font-mono text-[10px] text-dim">data: {source}</p>
      </div>

      <svg viewBox="0 0 640 300" className="mt-4 w-full" role="img" aria-label="Diagram of a planet transiting its star">
        <defs>
          <radialGradient id="star-limb" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fffaf0" />
            <stop offset="55%" stopColor="#ffe2b0" />
            <stop offset="85%" stopColor="#ffb366" />
            <stop offset="100%" stopColor="#e0783a" />
          </radialGradient>
          <radialGradient id="star-glow" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="#ffb366" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffb366" stopOpacity="0" />
          </radialGradient>
          <style>{`
            @keyframes fl-transit { from { transform: translateX(-190px); } to { transform: translateX(190px); } }
            .fl-planet { animation: fl-transit 11s linear infinite; }
            @media (prefers-reduced-motion: reduce) { .fl-planet { animation: none; } }
          `}</style>
        </defs>

        {/* star scene */}
        <circle cx={150} cy={150} r={STAR_R * 1.35} fill="url(#star-glow)" />
        <circle cx={150} cy={150} r={STAR_R} fill="url(#star-limb)" />
        <g className="fl-planet" style={{ transformBox: "view-box" }}>
          <circle cx={150} cy={150 + STAR_R * 0.42} r={rp + atmoPx} fill={color} fillOpacity={0.15 + frac * 0.55} />
          <circle cx={150} cy={150 + STAR_R * 0.42} r={rp} fill="#05060a" />
        </g>
        <text x={150} y={292} textAnchor="middle" fontSize={10} className="font-mono" fill="#5b5e69">
          STAR &amp; PLANET TO SCALE · ATMOSPHERE EXAGGERATED
        </text>

        {/* magnified limb */}
        <clipPath id="fl-limb-clip">
          <rect x={330} y={20} width={300} height={250} />
        </clipPath>
        <g clipPath="url(#fl-limb-clip)"><g transform="translate(330 0)">
          <rect x={0} y={20} width={300} height={250} fill="none" stroke="white" strokeOpacity={0.08} />
          <text x={10} y={36} fontSize={9.5} className="font-mono" fill="#5b5e69">
            LIMB, MAGNIFIED
          </text>
          {/* starlight rays grazing the limb: blocked below the opaque radius */}
          {Array.from({ length: 10 }, (_, i) => {
            const y = 52 + i * 20;
            const blocked = y > 470 - (270 + frac * 70);
            return (
              <line
                key={i}
                x1={0}
                x2={300}
                y1={y}
                y2={y}
                stroke={blocked ? color : "#ffe2b0"}
                strokeOpacity={blocked ? 0.3 : 0.55}
                strokeDasharray={blocked ? "2 4" : undefined}
              />
            );
          })}
          <circle cx={150} cy={470} r={230 + 40 + frac * 70} fill={color} fillOpacity={0.12 + frac * 0.35} />
          <circle cx={150} cy={470} r={230 + 40 + 70} fill="none" stroke={color} strokeOpacity={0.25} strokeDasharray="3 4" />
          <circle cx={150} cy={470} r={230} fill="#05060a" stroke="white" strokeOpacity={0.15} />
          <text x={150} y={262} textAnchor="middle" fontSize={10} className="font-mono" fill="#8a8d98">
            opaque radius at {wl.toFixed(2)} μm
          </text>
        </g></g>
      </svg>

      {/* wavelength slider */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between font-mono text-[10.5px] tracking-wider text-muted">
          <span>{lo.toFixed(1)} μm</span>
          <span className="text-fg">
            λ = {wl.toFixed(2)} μm {band && <span style={{ color: band.color }}>· {band.label}</span>}
          </span>
          <span>{hi.toFixed(1)} μm</span>
        </div>
        <input
          type="range"
          className="slider mt-3"
          min={lo}
          max={hi}
          step={0.01}
          value={wl}
          onChange={(e) => setWl(Number(e.target.value))}
          style={{ ["--pct" as string]: `${pct.toFixed(2)}%`, ["--track-fill" as string]: color }}
          aria-label="Wavelength"
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line sm:grid-cols-4">
        {[
          { k: "Transit depth", v: `${fmtPpm(d)} ppm` },
          { k: "Rp / R★", v: ratio.toFixed(4) },
          { k: "Radius vs. min", v: dRkm != null ? `+${fmtPpm(dRkm)} km` : "—" },
          { k: "Scale heights", v: ppmPerH ? `${((d - dMin) / ppmPerH).toFixed(1)} H` : "—" },
        ].map((s) => (
          <div key={s.k} className="bg-ink px-3 py-3">
            <p className="eyebrow !text-[9px]">{s.k}</p>
            <p className="mt-1 font-mono text-[15px] tabular-nums">{s.v}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <svg viewBox="0 0 260 84" className="h-[84px] w-[260px] shrink-0" aria-hidden>
          <path d={lc(dMin)} fill="none" stroke="white" strokeOpacity={0.25} strokeDasharray="3 3" />
          <path d={lc(d)} fill="none" stroke={color} strokeWidth={1.6} />
        </svg>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Light curve at true scale. At this wavelength the transit is{" "}
          <span className="text-fg">{fmtPpm(d - dMin)} ppm</span> deeper than at the most transparent wavelength.
          The extra depth is starlight absorbed by the atmosphere.
        </p>
      </div>
    </div>
  );
}
