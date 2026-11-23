"use client";

import { useState } from "react";

export type Series = { name: string; color: string };
export type Bar = { label: string; values: number[]; tip?: string };

/**
 * Vertical (stacked) bars with an oversized per-bar hit target and a hover tooltip.
 * Pure SVG, so it stays crisp; colours come from validated chart palettes.
 */
export function StackedBars({
  bars,
  series,
  height = 260,
  xTicks = [],
  highlight,
  ariaLabel,
  valueSuffix = "",
}: {
  bars: Bar[];
  series: Series[];
  height?: number;
  xTicks?: { index: number; label: string }[];
  highlight?: { from: number; to: number; label: string };
  ariaLabel: string;
  valueSuffix?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = height;
  const pad = { l: 54, r: 10, t: 14, b: 28 };
  const totals = bars.map((b) => b.values.reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...totals);
  const p10 = Math.pow(10, Math.floor(Math.log10(max)));
  const niceMax = Math.ceil(max / p10) * p10;
  const bw = (W - pad.l - pad.r) / bars.length;
  const y = (v: number) => Math.round((pad.t + (H - pad.t - pad.b) * (1 - v / niceMax)) * 10) / 10;
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <div className="relative">
      {series.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-2 text-xs text-fg-2">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {highlight && (
          <g>
            <rect
              x={pad.l + highlight.from * bw}
              width={(highlight.to - highlight.from) * bw}
              y={pad.t}
              height={H - pad.t - pad.b}
              fill="rgba(242,196,109,0.07)"
            />
            <text x={pad.l + ((highlight.from + highlight.to) / 2) * bw} y={pad.t + 12} textAnchor="middle" className="fill-[#f2c46d] font-mono text-[11px]">
              {highlight.label}
            </text>
          </g>
        )}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(f * niceMax)} y2={y(f * niceMax)} stroke="rgba(255,255,255,0.06)" />
            <text x={pad.l - 10} y={y(f * niceMax) + 3.5} textAnchor="end" className="fill-[#8a8d98] font-mono text-[10px]">
              {f * niceMax >= 1000 ? `${(f * niceMax) / 1000}k` : f * niceMax}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          let acc = 0;
          const x = pad.l + i * bw;
          return (
            <g key={b.label} opacity={hover === null || hover === i ? 1 : 0.4}>
              {b.values.map((v, si) => {
                if (!v) return null;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                return (
                  <rect
                    key={si}
                    x={x + Math.min(1, bw * 0.1)}
                    width={Math.max(1, bw - Math.min(2, bw * 0.2))}
                    y={y1}
                    height={Math.max(0.5, y0 - y1 - (acc < totals[i] ? 0.8 : 0))}
                    rx={Math.min(1.5, bw / 4)}
                    fill={series[si].color}
                  />
                );
              })}
              <rect x={x} width={bw} y={pad.t} height={H - pad.t - pad.b} fill="transparent" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />
            </g>
          );
        })}
        {xTicks.map((t) => (
          <text key={t.index} x={pad.l + t.index * bw} y={H - 8} textAnchor="middle" className="fill-[#8a8d98] font-mono text-[10px]">
            {t.label}
          </text>
        ))}
      </svg>
      {hover !== null && (
        <div
          className="glass pointer-events-none absolute top-8 w-60 rounded-lg p-3 text-xs"
          style={{ left: `clamp(0px, calc(${((pad.l + hover * bw) / W) * 100}% - 120px), calc(100% - 240px))` }}
        >
          <p className="font-mono text-[10.5px] text-fg">{bars[hover].tip ?? bars[hover].label}</p>
          {series.map((s, si) => (
            <p key={s.name} className="mt-1 flex items-center justify-between gap-3 text-fg-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
                <span className="truncate">{s.name}</span>
              </span>
              <span className="font-mono tabular-nums text-fg">
                {fmt(bars[hover].values[si])}
                {valueSuffix}
              </span>
            </p>
          ))}
          {series.length > 1 && (
            <p className="mt-2 border-t border-line pt-2 font-mono text-[10.5px] text-muted">total {fmt(totals[hover])}</p>
          )}
        </div>
      )}
    </div>
  );
}
