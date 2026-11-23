"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ExoPoint } from "@/lib/data-exo";
import { BANDS, bandAt, fmtPpm, logTicks, niceTicks } from "./spectrum-utils";

export type ChartSeries = {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  points: ExoPoint[];
  binned: boolean;
};

type Props = {
  series: ChartSeries[];
  unit: string; // "ppm" | "K"
  yLabel: string;
  /** Planet/star context for hover readouts (transit depth only). */
  ppmPerH?: number | null;
  starRadiusKm?: number | null;
  showRatio?: boolean;
  height?: number;
};

const M = { top: 34, right: 18, bottom: 44, left: 66 };

export function SpectrumChart({ series, unit, yLabel, ppmPerH, starRadiusKm, showRatio, height = 430 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = "clip" + useId().replace(/:/g, "");
  const [width, setWidth] = useState(0); // 0 until measured: the chart renders client-side only
  const [xDomain, setXDomain] = useState<[number, number] | null>(null);
  const [showBands, setShowBands] = useState(true);
  const [logX, setLogX] = useState<boolean | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; s: ChartSeries; p: ExoPoint } | null>(null);
  const [drag, setDrag] = useState<{ x0: number; x1: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(300, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset zoom whenever the set of series changes.
  const seriesKey = series.map((s) => s.id).join("|");
  const [prevKey, setPrevKey] = useState(seriesKey);
  if (prevKey !== seriesKey) {
    setPrevKey(seriesKey);
    setXDomain(null);
    setHover(null);
  }

  const h = width && width < 640 ? Math.min(height, 340) : height;
  const iw = width - M.left - M.right;
  const ih = h - M.top - M.bottom;

  const full = useMemo<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series)
      for (const p of s.points) {
        lo = Math.min(lo, p[0] - (p[4] ?? 0));
        hi = Math.max(hi, p[0] + (p[4] ?? 0));
      }
    if (!Number.isFinite(lo)) return [0.6, 5.3];
    const pad = (hi - lo) * 0.02 || 0.1;
    return [Math.max(0.3, lo - pad), hi + pad];
  }, [series]);

  const [x0, x1] = xDomain ?? full;
  const useLog = logX ?? full[1] / full[0] > 5;

  const xScale = useCallback(
    (v: number) =>
      useLog
        ? M.left + ((Math.log(v) - Math.log(x0)) / (Math.log(x1) - Math.log(x0))) * iw
        : M.left + ((v - x0) / (x1 - x0)) * iw,
    [useLog, x0, x1, iw],
  );
  const xInvert = useCallback(
    (px: number) => {
      const t = (px - M.left) / iw;
      return useLog ? Math.exp(Math.log(x0) + t * (Math.log(x1) - Math.log(x0))) : x0 + t * (x1 - x0);
    },
    [useLog, x0, x1, iw],
  );

  const [y0, y1] = useMemo(() => {
    const vals: number[] = [];
    for (const s of series)
      for (const p of s.points) {
        if (p[0] < x0 || p[0] > x1) continue;
        vals.push(p[1] - (p[3] ?? 0) * 0.6, p[1] + (p[2] ?? 0) * 0.6);
      }
    if (!vals.length) return [0, 1];
    vals.sort((a, b) => a - b);
    const lo = vals[Math.floor(vals.length * 0.01)];
    const hi = vals[Math.ceil(vals.length * 0.99) - 1];
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
    return [lo - pad, hi + pad];
  }, [series, x0, x1]);
  const yScale = (v: number) => M.top + ih - ((v - y0) / (y1 - y0)) * ih;

  const xt =
    useLog && x1 / x0 > 2.5 ? logTicks(x0, x1) : niceTicks(x0, x1, Math.max(4, Math.round(iw / 110)));
  const yt = niceTicks(y0, y1, 6);

  const dense = series.reduce((n, s) => n + s.points.filter((p) => p[0] >= x0 && p[0] <= x1).length, 0) > 500;

  const minDepth = useMemo(() => {
    let m = Infinity;
    for (const s of series) for (const p of s.points) m = Math.min(m, p[1]);
    return m;
  }, [series]);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (drag) {
      setDrag({ ...drag, x1: Math.min(Math.max(px, M.left), M.left + iw) });
      return;
    }
    if (px < M.left || px > M.left + iw) return setHover(null);
    let best: { d: number; s: ChartSeries; p: ExoPoint } | null = null;
    for (const s of series)
      for (const p of s.points) {
        if (p[0] < x0 || p[0] > x1) continue;
        const dx = xScale(p[0]) - px;
        const dy = (yScale(p[1]) - py) * 0.35;
        const d = dx * dx + dy * dy;
        if (!best || d < best.d) best = { d, s, p };
      }
    if (best && best.d < 60 * 60) setHover({ x: xScale(best.p[0]), y: yScale(best.p[1]), s: best.s, p: best.p });
    else setHover(null);
  }

  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < M.left || px > M.left + iw) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ x0: px, x1: px });
  }

  function onUp() {
    if (drag && Math.abs(drag.x1 - drag.x0) > 8) {
      const a = xInvert(Math.min(drag.x0, drag.x1));
      const b = xInvert(Math.max(drag.x0, drag.x1));
      setXDomain([a, b]);
    }
    setDrag(null);
  }

  const visibleBands = showBands ? BANDS.filter((b) => b.to > x0 && b.from < x1) : [];
  const hb = hover ? bandAt(hover.p[0]) : null;
  const tipLeft = hover ? (hover.x > width - 260 ? hover.x - 236 : hover.x + 14) : 0;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase">
        <button
          type="button"
          onClick={() => setShowBands((v) => !v)}
          className={
            "rounded-full border px-3 py-1.5 transition " +
            (showBands ? "border-gold/60 text-gold" : "border-line-2 text-muted hover:text-fg")
          }
        >
          Molecular bands
        </button>
        <button
          type="button"
          onClick={() => setLogX(!useLog)}
          className="rounded-full border border-line-2 px-3 py-1.5 text-muted transition hover:text-fg"
        >
          λ axis: {useLog ? "log" : "linear"}
        </button>
        {xDomain && (
          <button
            type="button"
            onClick={() => setXDomain(null)}
            className="rounded-full border border-fg/40 px-3 py-1.5 text-fg transition hover:bg-fg hover:text-ink"
          >
            Reset zoom
          </button>
        )}
        <span className="ml-auto hidden text-dim sm:inline">Drag across the chart to zoom · double-click to reset</span>
      </div>

      {!width ? (
        <div style={{ height: h }} className="grid place-items-center font-mono text-[10px] tracking-[0.2em] text-dim uppercase">
          Plotting…
        </div>
      ) : (
      <svg
        ref={svgRef}
        width={width}
        height={h}
        className="block touch-none cursor-crosshair"
        onPointerMove={onMove}
        onPointerLeave={() => !drag && setHover(null)}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onDoubleClick={() => setXDomain(null)}
        role="img"
        aria-label={`Spectrum chart: ${yLabel} versus wavelength`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={M.left} y={M.top - 4} width={iw} height={ih + 8} />
          </clipPath>
        </defs>

        {/* bands */}
        <g clipPath={`url(#${clipId})`}>
          {visibleBands.map((b) => {
            const bx0 = xScale(Math.max(b.from, x0));
            const bx1 = xScale(Math.min(b.to, x1));
            return (
              <g key={b.id}>
                <rect x={bx0} y={M.top} width={Math.max(1.5, bx1 - bx0)} height={ih} fill={b.color} opacity={0.07} />
                <line x1={bx0} x2={bx0} y1={M.top} y2={M.top + ih} stroke={b.color} strokeOpacity={0.18} />
              </g>
            );
          })}
        </g>
        {visibleBands.map((b) => {
          const cx = (xScale(Math.max(b.from, x0)) + xScale(Math.min(b.to, x1))) / 2;
          return (
            <text
              key={b.id + "-l"}
              x={cx}
              y={M.top - 10}
              textAnchor="middle"
              className="font-mono"
              fontSize={9.5}
              fill={b.color}
              fillOpacity={0.85}
            >
              {b.label}
            </text>
          );
        })}

        {/* grid + axes */}
        {yt.map((v) => (
          <g key={"y" + v}>
            <line x1={M.left} x2={M.left + iw} y1={yScale(v)} y2={yScale(v)} stroke="white" strokeOpacity={0.06} />
            <text x={M.left - 10} y={yScale(v) + 3.5} textAnchor="end" fontSize={10} className="font-mono" fill="#8a8d98">
              {unit === "ppm" ? fmtPpm(v) : v.toFixed(0)}
            </text>
          </g>
        ))}
        {xt.map((v) => (
          <g key={"x" + v}>
            <line x1={xScale(v)} x2={xScale(v)} y1={M.top + ih} y2={M.top + ih + 5} stroke="white" strokeOpacity={0.3} />
            <text x={xScale(v)} y={M.top + ih + 18} textAnchor="middle" fontSize={10} className="font-mono" fill="#8a8d98">
              {v < 1 ? v.toFixed(1) : +v.toFixed(2)}
            </text>
          </g>
        ))}
        <line x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} stroke="white" strokeOpacity={0.2} />
        <text x={M.left + iw / 2} y={h - 6} textAnchor="middle" fontSize={10} className="font-mono" fill="#5b5e69">
          WAVELENGTH (μm)
        </text>
        <text
          transform={`translate(14 ${M.top + ih / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={10}
          className="font-mono"
          fill="#5b5e69"
        >
          {yLabel.toUpperCase()} ({unit})
        </text>

        {/* data */}
        <g clipPath={`url(#${clipId})`}>
          {series.map((s) => (
            <g key={s.id}>
              {s.points.map((p, i) => {
                if (p[0] < x0 - (p[4] ?? 0) || p[0] > x1 + (p[4] ?? 0)) return null;
                const cx = xScale(p[0]);
                const cy = yScale(p[1]);
                return (
                  <g key={i}>
                    {p[2] != null && p[3] != null && (
                      <line
                        x1={cx}
                        x2={cx}
                        y1={yScale(p[1] + p[2])}
                        y2={yScale(p[1] - p[3])}
                        stroke={s.color}
                        strokeOpacity={dense ? 0.28 : 0.5}
                        strokeWidth={1}
                      />
                    )}
                    {p[4] != null && !dense && (
                      <line
                        x1={xScale(p[0] - p[4])}
                        x2={xScale(p[0] + p[4])}
                        y1={cy}
                        y2={cy}
                        stroke={s.color}
                        strokeOpacity={0.35}
                      />
                    )}
                    <circle cx={cx} cy={cy} r={dense ? 1.6 : 2.6} fill={s.color} />
                  </g>
                );
              })}
            </g>
          ))}
        </g>

        {/* hover */}
        {hover && !drag && (
          <g pointerEvents="none">
            <line x1={hover.x} x2={hover.x} y1={M.top} y2={M.top + ih} stroke="white" strokeOpacity={0.25} strokeDasharray="2 3" />
            <circle cx={hover.x} cy={hover.y} r={6} fill="none" stroke={hover.s.color} strokeWidth={1.5} />
          </g>
        )}
        {drag && (
          <rect
            x={Math.min(drag.x0, drag.x1)}
            y={M.top}
            width={Math.abs(drag.x1 - drag.x0)}
            height={ih}
            fill="#f2c46d"
            fillOpacity={0.08}
            stroke="#f2c46d"
            strokeOpacity={0.5}
          />
        )}
      </svg>
      )}

      {hover && !drag && (
        <div
          className="glass pointer-events-none absolute z-10 w-[224px] rounded-sm px-3.5 py-3 text-[12px]"
          style={{ left: tipLeft, top: Math.max(40, hover.y - 30) }}
        >
          <p className="flex items-center gap-2 font-mono text-[10px] tracking-wider text-muted uppercase">
            <span className="h-2 w-2 rounded-full" style={{ background: hover.s.color }} />
            <span className="truncate">{hover.s.label}</span>
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono tabular-nums">
            <dt className="text-dim">λ</dt>
            <dd className="text-right">
              {hover.p[0].toFixed(3)} μm{hover.p[4] ? <span className="text-dim"> ±{hover.p[4].toFixed(3)}</span> : null}
            </dd>
            <dt className="text-dim">{unit === "K" ? "T" : "depth"}</dt>
            <dd className="text-right">
              {unit === "ppm" ? fmtPpm(hover.p[1]) : hover.p[1].toFixed(0)} {unit}
            </dd>
            {hover.p[2] != null && (
              <>
                <dt className="text-dim">σ</dt>
                <dd className="text-right">
                  ±{unit === "ppm" ? fmtPpm(((hover.p[2] ?? 0) + (hover.p[3] ?? 0)) / 2) : (((hover.p[2] ?? 0) + (hover.p[3] ?? 0)) / 2).toFixed(0)}{" "}
                  {unit}
                </dd>
              </>
            )}
            {showRatio && unit === "ppm" && hover.p[1] > 0 && (
              <>
                <dt className="text-dim">Rp/R★</dt>
                <dd className="text-right">{Math.sqrt(hover.p[1] / 1e6).toFixed(5)}</dd>
              </>
            )}
            {showRatio && ppmPerH && Number.isFinite(minDepth) && (
              <>
                <dt className="text-dim">above min</dt>
                <dd className="text-right">{((hover.p[1] - minDepth) / ppmPerH).toFixed(1)} H</dd>
              </>
            )}
            {showRatio && starRadiusKm && Number.isFinite(minDepth) && hover.p[1] > 0 && (
              <>
                <dt className="text-dim">Δ radius</dt>
                <dd className="text-right">
                  +{fmtPpm((Math.sqrt(hover.p[1] / 1e6) - Math.sqrt(Math.max(minDepth, 0) / 1e6)) * starRadiusKm)} km
                </dd>
              </>
            )}
          </dl>
          {hb && (
            <p className="mt-2 border-t border-line pt-2 font-mono text-[10px]" style={{ color: hb.color }}>
              inside {hb.label} band
            </p>
          )}
          {hover.s.binned && <p className="mt-1 font-mono text-[9.5px] text-dim">binned for display</p>}
        </div>
      )}
    </div>
  );
}
