"use client";

import { useEffect, useRef, useState } from "react";

const C_KM_S = 299_792.458;
const AU = 149_597_870.7;
const LY = 9_460_730_472_580.8;
const YEAR_S = 365.25 * 86400;

function fmtDistance(km: number): [string, string] {
  if (km < 1e6) return [Math.round(km).toLocaleString("en-US"), "km"];
  if (km < 1e9) return [(km / 1e6).toFixed(2), "million km"];
  if (km < 0.02 * LY) {
    const au = km / AU;
    return [au < 10 ? au.toFixed(2) : au.toFixed(1), "AU"];
  }
  const ly = km / LY;
  if (ly < 1e3) return [ly < 10 ? ly.toFixed(2) : ly.toFixed(1), "light-years"];
  if (ly < 1e6) return [Math.round(ly).toLocaleString("en-US"), "light-years"];
  if (ly < 1e9) return [(ly / 1e6).toFixed(ly < 1e7 ? 2 : 1), "million light-years"];
  return [(ly / 1e9).toFixed(2), "billion light-years"];
}

function fmtLightTime(km: number): string {
  const s = km / C_KM_S;
  if (s < 60) return `${s.toFixed(2)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  if (s < 86400 * 2) return `${(s / 3600).toFixed(1)} hours`;
  const y = s / YEAR_S;
  if (y < 1) return `${(s / 86400).toFixed(0)} days`;
  if (y < 1e3) return `${y.toFixed(y < 10 ? 2 : 1)} years`;
  if (y < 1e6) return `${Math.round(y).toLocaleString("en-US")} years`;
  if (y < 1e9) return `${(y / 1e6).toFixed(1)} million years`;
  return `${(y / 1e9).toFixed(3)} billion years`;
}

const LOG_MIN = 3.5; // ~3,000 km
const LOG_MAX = 23.7; // past the observable universe (4.4e23 km)
const TICKS: [number, string][] = [
  [5.585, "Moon"],
  [8.175, "1 AU"],
  [12.976, "1 ly"],
  [15.976, "1 kly"],
  [18.976, "1 Mly"],
  [21.976, "1 Gly"],
];

/**
 * Fixed HUD that reads `data-logkm` from every `[data-stop]` element and
 * interpolates (in log space) between the two stops around the viewport
 * centre, so the distance counts up continuously while scrolling.
 */
export function Odometer() {
  const distRef = useRef<HTMLSpanElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stops = Array.from(document.querySelectorAll<HTMLElement>("[data-stop]"));
    const journey = document.querySelector<HTMLElement>("[data-journey]");
    if (!stops.length || !journey) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const mid = window.innerHeight * 0.5;
      const centers = stops.map((el) => {
        const r = el.getBoundingClientRect();
        return { c: r.top + r.height * 0.35, v: Number(el.dataset.logkm) };
      });
      let logkm = centers[0].v;
      if (mid >= centers[centers.length - 1].c) logkm = centers[centers.length - 1].v;
      else {
        for (let i = 0; i < centers.length - 1; i++) {
          const a = centers[i];
          const b = centers[i + 1];
          if (mid >= a.c && mid < b.c) {
            const t = (mid - a.c) / (b.c - a.c);
            const e = t * t * (3 - 2 * t);
            logkm = a.v + (b.v - a.v) * e;
            break;
          }
        }
      }
      const km = Math.pow(10, logkm);
      const [d, u] = fmtDistance(km);
      if (distRef.current) distRef.current.textContent = d;
      if (unitRef.current) unitRef.current.textContent = u;
      if (timeRef.current) timeRef.current.textContent = fmtLightTime(km);
      if (barRef.current) barRef.current.style.width = `${((logkm - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100}%`;

      const jr = journey.getBoundingClientRect();
      setVisible(jr.top < window.innerHeight * 0.6 && jr.bottom > window.innerHeight * 0.4);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className={
        "pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 transition-all duration-700 md:inset-x-auto md:bottom-6 md:right-6 md:px-0 " +
        (visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0")
      }
      aria-hidden
    >
      <div className="w-full max-w-md rounded-2xl border border-line-2 bg-ink/85 px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl md:w-[420px]">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <div>
            <p className="eyebrow !text-[9px]">Distance travelled by the light</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span ref={distRef} className="font-mono text-2xl tabular-nums">
                6,371
              </span>
              <span ref={unitRef} className="text-sm text-muted">
                km
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="eyebrow !text-[9px]">Light-travel time</p>
            <p className="mt-1 font-mono text-base tabular-nums text-gold">
              <span ref={timeRef}>0.02 s</span>
            </p>
          </div>
        </div>
        <div className="relative mt-4 h-6">
          <div className="absolute inset-x-0 top-2 h-px bg-line-2" />
          <div ref={barRef} className="absolute left-0 top-[7px] h-[3px] rounded-full bg-gradient-to-r from-gold-2 to-gold shadow-[0_0_12px_rgba(242,196,109,0.7)]" />
          {TICKS.map(([v, l]) => (
            <div
              key={l}
              className="absolute top-0 -translate-x-1/2 text-center"
              style={{ left: `${((v - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100}%` }}
            >
              <div className="mx-auto h-[17px] w-px bg-line-2" />
              <span className="mt-0.5 block font-mono text-[8.5px] tracking-wider text-dim">{l}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 font-mono text-[8.5px] tracking-[0.18em] text-dim uppercase">Logarithmic scale · from 10⁴ km to the edge of the observable universe</p>
      </div>
    </div>
  );
}
