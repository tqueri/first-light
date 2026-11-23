"use client";

import { useState } from "react";
import { TRACES } from "@/lib/lab/filters";
import type { LabFilter, LayerState } from "@/lib/lab/types";

const MIN = 0.6;
const MAX = 28;
const xn = (um: number) => ((Math.log10(um) - Math.log10(MIN)) / (Math.log10(MAX) - Math.log10(MIN))) * 100;
/** CSS percentage, rounded so server and client serialise identically. */
const pc = (v: number) => `${v.toFixed(3)}%`;
const x = (um: number) => pc(xn(um));
const TICKS = [0.6, 1, 2, 3, 5, 10, 20, 28];

/** Log-wavelength axis (0.6–28 μm) with each filter at its pivot, drawn in its current colour. */
export function WavelengthStrip({ filters, layers }: { filters: LabFilter[]; layers: LayerState[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? filters[hover] : null;
  return (
    <div className="relative border-t border-line bg-ink-2 px-4 pb-3 pt-2 md:px-6">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow !text-[9px]">Wavelength · log scale</p>
        <p className="hidden truncate pl-4 text-[11px] text-muted md:block">
          {h ? (
            <>
              <span className="font-mono text-fg-2">{h.name}</span> · {h.pivot_um.toFixed(3)} μm ·{" "}
              {TRACES[h.name]?.short ?? "broad-band continuum"}
            </>
          ) : (
            "Everything here is invisible to the eye: human vision stops at about 0.7 μm."
          )}
        </p>
      </div>
      <div className="relative mt-2 h-14">
        {/* bands */}
        <div
          className="absolute top-6 h-1.5 rounded-full"
          style={{ left: x(0.6), width: pc(xn(5.0) - xn(0.6)), backgroundImage: "linear-gradient(90deg, rgba(242,196,109,.15), rgba(242,196,109,.35))" }}
        />
        <div
          className="absolute top-6 h-1.5 rounded-full"
          style={{ left: x(4.9), width: pc(xn(27.9) - xn(4.9)), backgroundImage: "linear-gradient(90deg, rgba(255,107,74,.35), rgba(255,107,74,.12))" }}
        />
        <div
          className="absolute top-6 h-1.5 rounded-l-full"
          style={{ left: "0%", width: x(0.7), backgroundImage: "linear-gradient(90deg, #ff6a3d, #b0001e)" }}
          title="The red end of visible light"
        />
        <span className="absolute top-9 font-mono text-[8.5px] tracking-wider text-gold/70" style={{ left: x(1.6) }}>
          NIRCam
        </span>
        <span className="absolute top-9 font-mono text-[8.5px] tracking-wider text-ember/70" style={{ left: x(11) }}>
          MIRI
        </span>
        {/* ticks */}
        {TICKS.map((t) => (
          <span key={t} className="absolute bottom-0 -translate-x-1/2 font-mono text-[8.5px] text-dim" style={{ left: x(t) }}>
            {t}
          </span>
        ))}
        {/* filters */}
        {filters.map((f, i) => {
          const L = layers[i];
          const on = L?.on;
          return (
            <button
              key={f.name}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="group absolute top-0 -translate-x-1/2"
              style={{ left: x(f.pivot_um) }}
              aria-label={`${f.name}, ${f.pivot_um} microns`}
            >
              <span
                className="block font-mono text-[9px] leading-none transition"
                style={{ color: on ? L.color : "var(--color-dim)", transform: `translateY(${i % 2 ? 0 : -2}px)` }}
              >
                {f.name.replace(/^F/, "")}
              </span>
              <span
                className="mx-auto mt-1 block h-4 w-[3px] rounded-full transition group-hover:h-5"
                style={{ background: on ? L.color : "rgba(255,255,255,.18)", boxShadow: on ? `0 0 10px ${L.color}` : undefined }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
