"use client";

import { useMemo, useState } from "react";
import { CHART_TYPE, TYPE_LABEL } from "@/lib/instruments";

type Row = { month: string; image: number; spectrum: number; cube: number; timeseries: number };
const KEYS = ["image", "spectrum", "cube", "timeseries"] as const;

const fmt = (n: number) => n.toLocaleString("en-US");
const monthLabel = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** Stacked monthly bars (by observation date), with a per-bar hover tooltip and a table view. */
export function MonthlyChart({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 1000;
  const H = 300;
  const pad = { l: 56, r: 12, t: 12, b: 30 };
  const totals = rows.map((r) => KEYS.reduce((s, k) => s + r[k], 0));
  const max = Math.max(1, ...totals);
  const niceMax = useMemo(() => {
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / p) * p;
  }, [max]);
  const bw = (W - pad.l - pad.r) / rows.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / niceMax);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          {KEYS.map((k) => (
            <span key={k} className="flex items-center gap-2 text-xs text-fg-2">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: CHART_TYPE[k] }} />
              {TYPE_LABEL[k]}
            </span>
          ))}
        </div>
        <button onClick={() => setTable((t) => !t)} className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase hover:text-fg">
          {table ? "Show chart" : "Show table"}
        </button>
      </div>

      {table ? (
        <div className="max-h-[320px] overflow-auto rounded-sm border border-line">
          <table className="w-full text-left font-mono text-[11px]">
            <thead className="sticky top-0 bg-ink-2 text-muted">
              <tr>
                <th className="px-3 py-2">Month</th>
                {KEYS.map((k) => (
                  <th key={k} className="px-3 py-2 text-right">{TYPE_LABEL[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="border-t border-line text-fg-2">
                  <td className="px-3 py-1.5">{r.month}</td>
                  {KEYS.map((k) => (
                    <td key={k} className="px-3 py-1.5 text-right tabular-nums">{fmt(r[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Public Webb data products per month of observation, stacked by type">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
                <text x={pad.l - 10} y={y(t) + 3.5} textAnchor="end" className="fill-[#8a8d98] font-mono text-[10px]">
                  {t >= 1000 ? `${t / 1000}k` : t}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              let acc = 0;
              const x = pad.l + i * bw;
              return (
                <g key={r.month} opacity={hover === null || hover === i ? 1 : 0.35}>
                  {KEYS.map((k) => {
                    const v = r[k];
                    if (!v) return null;
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    return (
                      <rect
                        key={k}
                        x={x + 1}
                        width={Math.max(1, bw - 2)}
                        y={y1}
                        height={Math.max(0, y0 - y1 - (acc < totals[i] ? 1 : 0))}
                        rx={1.5}
                        fill={CHART_TYPE[k]}
                      />
                    );
                  })}
                  {/* oversized hit target */}
                  <rect
                    x={x}
                    width={bw}
                    y={pad.t}
                    height={H - pad.t - pad.b}
                    fill="transparent"
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                  />
                </g>
              );
            })}
            {rows.map((r, i) =>
              r.month.endsWith("-01") || i === 0 ? (
                <text key={r.month} x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="fill-[#8a8d98] font-mono text-[10px]">
                  {r.month.slice(0, 4)}
                </text>
              ) : null,
            )}
          </svg>
          {hover !== null && rows[hover] && (
            <div
              className="glass pointer-events-none absolute top-2 w-52 rounded-lg p-3 text-xs"
              style={{ left: `clamp(0px, calc(${((pad.l + hover * bw) / W) * 100}% - 104px), calc(100% - 208px))` }}
            >
              <p className="font-mono text-[10.5px] text-fg">{monthLabel(rows[hover].month)}</p>
              {KEYS.map((k) => (
                <p key={k} className="mt-1 flex items-center justify-between gap-3 text-fg-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: CHART_TYPE[k] }} />
                    {TYPE_LABEL[k]}
                  </span>
                  <span className="font-mono tabular-nums text-fg">{fmt(rows[hover][k])}</span>
                </p>
              ))}
              <p className="mt-2 border-t border-line pt-2 font-mono text-[10.5px] text-muted">
                total {fmt(totals[hover])}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
