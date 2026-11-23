import type { ExoPoint } from "@/lib/data-exo";

/** Molecular/atomic features at well-established wavelengths (μm). */
export const BANDS: { id: string; label: string; from: number; to: number; color: string }[] = [
  { id: "na", label: "Na", from: 0.583, to: 0.596, color: "#ffd38a" },
  { id: "k", label: "K", from: 0.762, to: 0.773, color: "#ffb38a" },
  { id: "h2o-14", label: "H₂O", from: 1.33, to: 1.5, color: "#7fd4ff" },
  { id: "h2o-19", label: "H₂O", from: 1.8, to: 2.0, color: "#7fd4ff" },
  { id: "ch4-23", label: "CH₄", from: 2.2, to: 2.4, color: "#9ee59b" },
  { id: "h2o-27", label: "H₂O", from: 2.6, to: 2.95, color: "#7fd4ff" },
  { id: "ch4-33", label: "CH₄", from: 3.2, to: 3.45, color: "#9ee59b" },
  { id: "so2-405", label: "SO₂", from: 3.98, to: 4.12, color: "#e8a3ff" },
  { id: "co2-43", label: "CO₂", from: 4.2, to: 4.42, color: "#f2c46d" },
  { id: "co-46", label: "CO", from: 4.52, to: 4.8, color: "#ff8f6b" },
  { id: "h2o-63", label: "H₂O", from: 5.9, to: 6.7, color: "#7fd4ff" },
  { id: "so2-73", label: "SO₂", from: 7.2, to: 7.6, color: "#e8a3ff" },
  { id: "sil-10", label: "Silicates", from: 8.6, to: 10.8, color: "#c9b59a" },
  { id: "co2-15", label: "CO₂", from: 14.4, to: 15.6, color: "#f2c46d" },
];

export function bandAt(wl: number) {
  return BANDS.find((b) => wl >= b.from && wl <= b.to) ?? null;
}

/**
 * Inverse-variance binning in log-wavelength: native JWST spectra can have
 * thousands of channels; for display we bin to ~`target` bins.
 */
export function binSpectrum(points: ExoPoint[], target = 220): ExoPoint[] {
  if (points.length <= target * 1.6) return points;
  const lo = Math.log(points[0][0]);
  const hi = Math.log(points[points.length - 1][0]);
  const step = (hi - lo) / target;
  const out: ExoPoint[] = [];
  let i = 0;
  for (let b = 0; b < target; b++) {
    const a = lo + b * step;
    const z = b === target - 1 ? Infinity : a + step;
    let sw = 0;
    let swx = 0;
    let swy = 0;
    let n = 0;
    let unweighted = 0;
    while (i < points.length && Math.log(points[i][0]) < z) {
      const [wl, v, ep, em] = points[i];
      const e = ep != null && em != null ? (ep + em) / 2 : (ep ?? em);
      if (e && e > 0) {
        const w = 1 / (e * e);
        sw += w;
        swx += w * wl;
        swy += w * v;
      } else {
        unweighted += v;
      }
      n++;
      i++;
    }
    if (!n) continue;
    const half = (Math.exp(a + step) - Math.exp(a)) / 2;
    if (sw > 0) {
      const err = 1 / Math.sqrt(sw);
      out.push([swx / sw, swy / sw, err, err, half]);
    } else {
      out.push([Math.exp(a + step / 2), unweighted / n, null, null, half]);
    }
  }
  return out;
}

/** Linear interpolation of value at wavelength (points sorted by wl). */
export function interp(points: ExoPoint[], wl: number): number | null {
  if (!points.length) return null;
  if (wl <= points[0][0]) return points[0][1];
  if (wl >= points[points.length - 1][0]) return points[points.length - 1][1];
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= wl) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = points[lo];
  const [x1, y1] = points[hi];
  return y0 + ((y1 - y0) * (wl - x0)) / (x1 - x0 || 1);
}

/** Running median smoothing (robust against outliers) for the transit diagram. */
export function smooth(points: ExoPoint[], window = 5): ExoPoint[] {
  if (points.length < window) return points;
  const h = Math.floor(window / 2);
  return points.map((p, i) => {
    const vals = points.slice(Math.max(0, i - h), i + h + 1).map((q) => q[1]).sort((a, b) => a - b);
    return [p[0], vals[vals.length >> 1], p[2], p[3], p[4]] as ExoPoint;
  });
}

export function niceTicks(min: number, max: number, count = 6): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

export function logTicks(min: number, max: number): number[] {
  const cands = [0.5, 0.6, 0.8, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];
  return cands.filter((c) => c >= min * 0.999 && c <= max * 1.001);
}

export const fmtPpm = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);

export function seriesColor(base: string, index: number) {
  // Same-instrument series: progressively lighter variants of the instrument colour.
  if (index === 0) return base;
  const mix = Math.min(0.65, index * 0.22);
  const c = parseInt(base.slice(1), 16);
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const m = (x: number) => Math.round(x + (255 - x) * mix);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}
