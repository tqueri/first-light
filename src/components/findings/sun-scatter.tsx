"use client";

import { useEffect, useRef, useState } from "react";

const sunLambda = (mjd: number) => {
  const n = mjd - 51544.5;
  const g = ((357.528 + 0.9856003 * n) * Math.PI) / 180;
  return (((280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360) + 360) % 360;
};
const mjdToDate = (m: number) => new Date((m - 40587) * 86_400_000);
const fmt = (m: number) => mjdToDate(m).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const LOW = "#f2c46d"; // |β| < 45°
const HIGH = "#7fd4ff"; // |β| ≥ 45°

/**
 * Every public Webb observation: date (x) against the ecliptic longitude it pointed at (y).
 * The Sun's track and the 85°–135° field of regard (for targets on the ecliptic) are drawn underneath.
 */
export function SunScatter({ points }: { points: number[][] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; w: number; mjd: number; lon: number } | null>(null);
  const t0 = Math.min(...points.map((p) => p[0]));
  const t1 = Math.max(...points.map((p) => p[0]));
  const pad = { l: 44, r: 12, t: 10, b: 28 };

  useEffect(() => {
    const c = ref.current!;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = c.clientWidth;
      const H = c.clientHeight;
      c.width = W * dpr;
      c.height = H * dpr;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const pw = W - pad.l - pad.r;
      const ph = H - pad.t - pad.b;
      const X = (m: number) => pad.l + ((m - t0) / (t1 - t0)) * pw;
      const Y = (lon: number) => pad.t + (1 - lon / 360) * ph;

      // field-of-regard bands (85°–135° either side of the Sun), drawn column by column
      ctx.fillStyle = "rgba(242,196,109,0.07)";
      for (let px = 0; px < pw; px += 2) {
        const m = t0 + (px / pw) * (t1 - t0);
        const s = sunLambda(m);
        for (const [a, b] of [[85, 135], [-135, -85]]) {
          for (let lo = s + a; lo < s + b; lo += 2) {
            const l = ((lo % 360) + 360) % 360;
            ctx.fillRect(pad.l + px, Y(l + 2), 2, Math.max(1, (2 / 360) * ph));
          }
        }
      }
      // grid
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.fillStyle = "#8a8d98";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "right";
      for (const lon of [0, 90, 180, 270, 360]) {
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(lon));
        ctx.lineTo(W - pad.r, Y(lon));
        ctx.stroke();
        ctx.fillText(`${lon}°`, pad.l - 8, Y(lon) + 3);
      }
      ctx.textAlign = "center";
      const y0 = mjdToDate(t0).getUTCFullYear();
      const y1 = mjdToDate(t1).getUTCFullYear();
      for (let y = y0; y <= y1 + 1; y++) {
        const m = Date.UTC(y, 0, 1) / 86_400_000 + 40587;
        if (m < t0 || m > t1) continue;
        ctx.beginPath();
        ctx.moveTo(X(m), pad.t);
        ctx.lineTo(X(m), H - pad.b);
        ctx.stroke();
        ctx.fillText(String(y), X(m), H - 8);
      }
      // the Sun's track
      ctx.fillStyle = "rgba(255,214,120,0.9)";
      for (let px = 0; px < pw; px += 1) {
        const m = t0 + (px / pw) * (t1 - t0);
        ctx.fillRect(pad.l + px, Y(sunLambda(m)) - 0.75, 1.2, 1.5);
      }
      // observations
      for (const hi of [1, 0]) {
        ctx.fillStyle = hi ? HIGH : LOW;
        ctx.globalAlpha = hi ? 0.55 : 0.5;
        for (const p of points) {
          if (p[2] !== hi) continue;
          ctx.beginPath();
          ctx.arc(X(p[0]), Y(p[1]), 1.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, t0, t1]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-fg-2">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: LOW }} /> Target near the ecliptic (|β| &lt; 45°)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: HIGH }} /> High ecliptic latitude (|β| ≥ 45°)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-5 rounded-full bg-[#ffd678]" /> The Sun
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-5 rounded-sm bg-[rgba(242,196,109,0.18)]" /> 85°–135° from the Sun
        </span>
      </div>
      <div className="relative">
        <canvas
          ref={ref}
          className="block h-[380px] w-full md:h-[460px]"
          role="img"
          aria-label="Scatter plot of every public Webb observation: observation date against ecliptic longitude, with the Sun's track. Observations form two bands 85 to 135 degrees either side of the Sun."
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            const pw = r.width - pad.l - pad.r;
            const ph = r.height - pad.t - pad.b;
            if (x < pad.l || x > r.width - pad.r || y < pad.t || y > r.height - pad.b) return setHover(null);
            setHover({ x, y, w: r.width, mjd: t0 + ((x - pad.l) / pw) * (t1 - t0), lon: (1 - (y - pad.t) / ph) * 360 });
          }}
          onPointerLeave={() => setHover(null)}
        />
        {hover && (
          <>
            <div className="pointer-events-none absolute bottom-[28px] top-[10px] w-px bg-white/25" style={{ left: hover.x }} />
            <div
              className="pointer-events-none absolute w-56 rounded-lg border border-line-2 bg-ink/95 p-3 font-mono text-[10.5px] text-fg-2 shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
              style={{ left: Math.min(hover.x + 14, hover.w - 232), top: Math.max(8, hover.y - 60) }}
            >
              <p className="text-fg">{fmt(hover.mjd)}</p>
              <p className="mt-1">Sun at λ {sunLambda(hover.mjd).toFixed(0)}°</p>
              <p>Cursor at λ {hover.lon.toFixed(0)}°</p>
              <p className="mt-1 text-gold">
                {(() => {
                  const d = Math.abs(((hover.lon - sunLambda(hover.mjd) + 540) % 360) - 180);
                  return d >= 85 && d <= 135 ? `${d.toFixed(0)}° from the Sun: observable` : `${d.toFixed(0)}° from the Sun: off-limits on the ecliptic`;
                })()}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
