/**
 * Builds the Lab's layer sets from raw MAST preview frames.
 *
 *   pnpm lab:build            (needs DATABASE_URL or the local embedded Postgres)
 *
 * For each curated observation set: download every filter's level-3 `_i2d.jpg`
 * preview (cached in .cache/lab), register all layers onto the highest-resolution
 * one with a similarity transform (translation + scale + rotation, found by
 * masked normalised cross-correlation — first globally on a pyramid, then on a
 * grid of patches), crop to the region every layer covers, and write grayscale
 * WebP layers + public/lab/manifest.json.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import sharp from "sharp";
import { ESA_COLORS, PIVOT_UM } from "../src/lib/lab/filters.ts";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".cache", "lab");
const OUT = path.join(ROOT, "public", "lab");
const MAX_W = 2400;
const INVALID = 250; // MAST previews paint "no data" white; saturated cores are also ≥250

type DatasetDef = {
  slug: string;
  title: string;
  target: string;
  obsPrefix: string;
  esaId?: string;
  esaNote?: string;
  /** ESA caption typos: their wavelength string → the real pivot (μm). */
  esaFix?: Record<string, number>;
  blurb: string;
};

const DATASETS: DatasetDef[] = [
  {
    slug: "cosmic-cliffs-nircam",
    title: "Cosmic Cliffs",
    target: "NGC 3324, Carina Nebula",
    obsPrefix: "jw02731-o001",
    esaId: "weic2205a",
    blurb:
      "The edge of a cavity carved into the Carina Nebula by the radiation of massive young stars, about 7,600 light-years away.",
  },
  {
    slug: "cosmic-cliffs-miri",
    title: "Cosmic Cliffs · mid-infrared",
    target: "NGC 3324, Carina Nebula",
    obsPrefix: "jw02731-o002",
    esaId: "weic2205b",
    esaNote: "MIRI colours from ESA's combined NIRCam + MIRI release",
    blurb: "The same ridge in mid-infrared: stars fade away and the dust itself glows.",
  },
  {
    slug: "pillars-nircam",
    title: "Pillars of Creation",
    target: "M16, Eagle Nebula",
    obsPrefix: "jw02739-o001",
    esaId: "weic2216b",
    blurb: "Columns of cold gas and dust a few light-years tall, being eroded by nearby massive stars, about 6,500 light-years away.",
  },
  {
    slug: "pillars-miri",
    title: "Pillars of Creation · mid-infrared",
    target: "M16, Eagle Nebula",
    obsPrefix: "jw02739-o002",
    esaId: "weic2218a",
    blurb: "In mid-infrared, the stars almost disappear; what remains is dust, glowing faintly.",
  },
  {
    slug: "southern-ring-nircam",
    title: "Southern Ring Nebula",
    target: "NGC 3132",
    obsPrefix: "jw02733-o001",
    esaId: "weic2207b",
    blurb: "A dying star's ejected shells, ~2,500 light-years away. Narrow filters isolate ionised and molecular gas.",
  },
  {
    slug: "southern-ring-miri",
    title: "Southern Ring · mid-infrared",
    target: "NGC 3132",
    obsPrefix: "jw02733-o002",
    esaId: "weic2207c",
    esaFix: { "1.13 μm": 11.3 },
    blurb: "MIRI reveals the second, dust-shrouded star at the heart of the nebula.",
  },
  {
    slug: "smacs-0723-nircam",
    title: "Webb's First Deep Field",
    target: "Galaxy cluster SMACS J0723.3−7327",
    obsPrefix: "jw02736-o001",
    esaId: "weic2209a",
    blurb: "A galaxy cluster 4.2 billion light-years away, magnifying galaxies far behind it through gravitational lensing.",
  },
  {
    slug: "l1527-nircam",
    title: "Protostar L1527",
    target: "LDN 1527, Taurus",
    obsPrefix: "jw02739-o005",
    esaId: "weic2219a",
    blurb:
      "An hourglass of gas lit by a protostar only ~100,000 years old, hidden inside the dark disc at its waist, about 460 light-years away.",
  },
];

/* ───────────────────────── helpers ───────────────────────── */

function filterName(obsId: string): string | null {
  const last = obsId.split("_").pop()!.toLowerCase();
  const tokens = last.split("-").filter((t) => /^f\d{3,4}[wmnlp]$/.test(t));
  if (tokens.length === 0) return null;
  const narrow = tokens.find((t) => t.endsWith("n")) ?? tokens.find((t) => t.endsWith("m"));
  return (narrow ?? tokens[tokens.length - 1]).toUpperCase();
}

async function download(uri: string): Promise<string> {
  const file = path.join(CACHE, path.basename(uri));
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return file;
  const url = `https://mast.stsci.edu/portal/Download/file?uri=${uri}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("not a JPEG");
      fs.writeFileSync(file, buf);
      return file;
    } catch (e) {
      if (attempt >= 3) throw new Error(`${uri}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

type Img = { w: number; h: number; d: Float32Array }; // NaN = invalid

async function loadGray(file: string, width: number, height?: number): Promise<{ u8: Uint8Array; w: number; h: number }> {
  const { data, info } = await sharp(file, { limitInputPixels: false })
    .greyscale()
    .resize({ width, height, fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { u8: new Uint8Array(data.buffer, data.byteOffset, data.length), w: info.width, h: info.height };
}

const toF = (u8: Uint8Array, w: number, h: number): Img => {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = u8[i] >= INVALID ? NaN : u8[i];
  return { w, h, d };
};

/** Remove extended emission (box-blur subtraction) so stars and fine edges drive the match. */
function highpass(img: Img, r = 5): Img {
  const { w, h, d } = img;
  const S = new Float64Array((w + 1) * (h + 1)), N = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rn = 0;
    for (let x = 0; x < w; x++) {
      const v = d[y * w + x];
      if (v === v) { rs += v; rn++; }
      S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + rs;
      N[(y + 1) * (w + 1) + x + 1] = N[y * (w + 1) + x + 1] + rn;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const v = d[y * w + x];
      if (v !== v) { out[y * w + x] = NaN; continue; }
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0];
      const n = N[y1 * (w + 1) + x1] - N[y0 * (w + 1) + x1] - N[y1 * (w + 1) + x0] + N[y0 * (w + 1) + x0];
      out[y * w + x] = Math.max(0, v - sum / n);
    }
  }
  return { w, h, d: out };
}

function downsample(img: Img, k: number): Img {
  const w = Math.floor(img.w / k);
  const h = Math.floor(img.h / k);
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const v = img.d[(y * k + j) * img.w + x * k + i];
          if (v === v) {
            s += v;
            n++;
          }
        }
      d[y * w + x] = n > (k * k) / 2 ? s / n : NaN;
    }
  return { w, h, d };
}

/** Masked NCC between a(x,y) and b(x+dx, y+dy) over a's region. */
function ncc(a: Img, b: Img, dx: number, dy: number, x0 = 0, y0 = 0, x1 = a.w, y1 = a.h, step = 1): number {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
  const xs = Math.max(x0, -dx), xe = Math.min(x1, b.w - dx);
  const ys = Math.max(y0, -dy), ye = Math.min(y1, b.h - dy);
  for (let y = ys; y < ye; y += step) {
    const ra = y * a.w, rb = (y + dy) * b.w + dx;
    for (let x = xs; x < xe; x += step) {
      const va = a.d[ra + x], vb = b.d[rb + x];
      if (va !== va || vb !== vb) continue;
      sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb; n++;
    }
  }
  if (n < 200) return -1;
  const cov = sab - (sa * sb) / n;
  const va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : -1;
}

function searchShift(a: Img, b: Img, cx: number, cy: number, r: number, region?: [number, number, number, number], step = 1) {
  let best = { dx: cx, dy: cy, v: -2 };
  const grid = new Map<string, number>();
  for (let dy = cy - r; dy <= cy + r; dy++)
    for (let dx = cx - r; dx <= cx + r; dx++) {
      const v = region ? ncc(a, b, dx, dy, ...region, step) : ncc(a, b, dx, dy, 0, 0, a.w, a.h, step);
      grid.set(`${dx},${dy}`, v);
      if (v > best.v) best = { dx, dy, v };
    }
  // sub-pixel parabolic refinement
  const g = (dx: number, dy: number) => grid.get(`${dx},${dy}`);
  let sx = 0, sy = 0;
  const l = g(best.dx - 1, best.dy), rr = g(best.dx + 1, best.dy), u = g(best.dx, best.dy - 1), d = g(best.dx, best.dy + 1);
  if (l !== undefined && rr !== undefined) { const den = l - 2 * best.v + rr; if (den < 0) sx = (0.5 * (l - rr)) / den; }
  if (u !== undefined && d !== undefined) { const den = u - 2 * best.v + d; if (den < 0) sy = (0.5 * (u - d)) / den; }
  return { ...best, fx: best.dx + Math.max(-0.5, Math.min(0.5, sx)), fy: best.dy + Math.max(-0.5, Math.min(0.5, sy)) };
}

type Sim = { a: number; b: number; tx: number; ty: number }; // q = [a -b; b a] p + t

function fitSimilarity(P: [number, number][], Q: [number, number][], W?: number[]): Sim {
  const n = P.length;
  const w = W ?? P.map(() => 1);
  let sw = 0, mpx = 0, mpy = 0, mqx = 0, mqy = 0;
  for (let i = 0; i < n; i++) { sw += w[i]; mpx += w[i] * P[i][0]; mpy += w[i] * P[i][1]; mqx += w[i] * Q[i][0]; mqy += w[i] * Q[i][1]; }
  mpx /= sw; mpy /= sw; mqx /= sw; mqy /= sw;
  let sxx = 0, num_a = 0, num_b = 0;
  for (let i = 0; i < n; i++) {
    const px = P[i][0] - mpx, py = P[i][1] - mpy, qx = Q[i][0] - mqx, qy = Q[i][1] - mqy;
    sxx += w[i] * (px * px + py * py);
    num_a += w[i] * (px * qx + py * qy);
    num_b += w[i] * (px * qy - py * qx);
  }
  const a = num_a / sxx, b = num_b / sxx;
  return { a, b, tx: mqx - (a * mpx - b * mpy), ty: mqy - (b * mpx + a * mpy) };
}

const applySim = (s: Sim, x: number, y: number): [number, number] => [s.a * x - s.b * y + s.tx, s.b * x + s.a * y + s.ty];

/** Resample a uint8 image through a similarity transform (ref coords → src coords). OOB → 255. */
function warp(src: { u8: Uint8Array; w: number; h: number }, s: Sim, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [u, v] = applySim(s, x, y);
      const x0 = Math.floor(u), y0 = Math.floor(v);
      if (x0 < 0 || y0 < 0 || x0 >= src.w - 1 || y0 >= src.h - 1) { out[y * w + x] = 255; continue; }
      const fx = u - x0, fy = v - y0, i = y0 * src.w + x0;
      const p00 = src.u8[i], p10 = src.u8[i + 1], p01 = src.u8[i + src.w], p11 = src.u8[i + src.w + 1];
      // keep "no data" crisp: if any neighbour is no-data, take the nearest sample
      if (p00 >= INVALID || p10 >= INVALID || p01 >= INVALID || p11 >= INVALID) {
        out[y * w + x] = src.u8[Math.round(v) * src.w + Math.round(u)];
        continue;
      }
      out[y * w + x] = Math.round(p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy);
    }
  return out;
}

/** Float warp (NaN-aware, nearest at no-data) for registration-time images. */
function warpF(src: Img, s: Sim): Img {
  const { w, h } = src;
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [u, v] = applySim(s, x, y);
      const xi = Math.round(u), yi = Math.round(v);
      d[y * w + x] = xi < 0 || yi < 0 || xi >= w || yi >= h ? NaN : src.d[yi * w + xi];
    }
  return { w, h, d };
}

/* ── star-based registration ── */
type Star = { x: number; y: number; f: number };

/** Point sources: local maxima of the high-pass image well above its noise, centroided. */
function detectStars(hp: Img, maxN = 600): Star[] {
  const { w, h, d } = hp;
  let s = 0, ss = 0, n = 0;
  for (let i = 0; i < d.length; i += 3) { const v = d[i]; if (v === v) { s += v; ss += v * v; n++; } }
  const mean = s / n, std = Math.sqrt(Math.max(1e-6, ss / n - mean * mean));
  const thr = mean + 5 * std;
  const out: Star[] = [];
  for (let y = 3; y < h - 3; y++)
    for (let x = 3; x < w - 3; x++) {
      const v = d[y * w + x];
      if (!(v > thr)) continue;
      let isMax = true;
      for (let j = -2; j <= 2 && isMax; j++) for (let i = -2; i <= 2; i++) { const u = d[(y + j) * w + x + i]; if (u > v || u !== u) { isMax = false; break; } }
      if (!isMax) continue;
      let sx = 0, sy = 0, sw = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const u = d[(y + j) * w + x + i]; sx += u * (x + i); sy += u * (y + j); sw += u; }
      out.push({ x: sx / sw, y: sy / sw, f: v });
    }
  return out.sort((a, b) => b.f - a.f).slice(0, maxN);
}

/** Match stars under a guess, then RANSAC a similarity; returns the fit and its residuals. */
function starFit(refS: Star[], layS: Star[], guess: Sim, radius: number) {
  const cell = 32;
  const grid = new Map<string, Star[]>();
  for (const st of layS) { const k = `${Math.floor(st.x / cell)},${Math.floor(st.y / cell)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(st); }
  const P: [number, number][] = [], Q: [number, number][] = [];
  for (const r of refS) {
    const [qx, qy] = applySim(guess, r.x, r.y);
    let best: Star | null = null, bd = radius;
    const cx = Math.floor(qx / cell), cy = Math.floor(qy / cell), span = Math.ceil(radius / cell);
    for (let j = -span; j <= span; j++) for (let i = -span; i <= span; i++)
      for (const st of grid.get(`${cx + i},${cy + j}`) ?? []) { const dd = Math.hypot(st.x - qx, st.y - qy); if (dd < bd) { bd = dd; best = st; } }
    if (best) { P.push([r.x, r.y]); Q.push([best.x, best.y]); }
  }
  if (P.length < 6) return null;
  // RANSAC on pairs
  let bestIn: number[] = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let it = 0; it < 400; it++) {
    const i = Math.floor(rnd() * P.length), j = Math.floor(rnd() * P.length);
    if (i === j || Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) < 100) continue;
    const m = fitSimilarity([P[i], P[j]], [Q[i], Q[j]]);
    const sc = Math.hypot(m.a, m.b);
    if (sc < 0.97 || sc > 1.03) continue;
    const inl: number[] = [];
    for (let k = 0; k < P.length; k++) { const [u, v] = applySim(m, ...P[k]); if (Math.hypot(u - Q[k][0], v - Q[k][1]) < 1.5) inl.push(k); }
    if (inl.length > bestIn.length) bestIn = inl;
  }
  if (bestIn.length < 8) return null;
  let sim = fitSimilarity(bestIn.map((k) => P[k]), bestIn.map((k) => Q[k]));
  for (let iter = 0; iter < 2; iter++) {
    const inl = P.map((p, k) => k).filter((k) => { const [u, v] = applySim(sim, ...P[k]); return Math.hypot(u - Q[k][0], v - Q[k][1]) < 1.0; });
    if (inl.length >= 8) { sim = fitSimilarity(inl.map((k) => P[k]), inl.map((k) => Q[k])); bestIn = inl; }
  }
  const res = bestIn.map((k) => { const [u, v] = applySim(sim, ...P[k]); return Math.hypot(u - Q[k][0], v - Q[k][1]); });
  return { sim, n: bestIn.length, rms: Math.sqrt(res.reduce((a, b) => a + b * b, 0) / res.length) };
}

/** Patch grid matching: returns correspondences ref p → layer q and their NCC peaks. */
function matchPatches(ref: Img, lay: Img, guess: Sim, nx = 7, ny = 4, size = 180, r = 6) {
  const P: [number, number][] = [], Q: [number, number][] = [], W: number[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const cx = Math.round(((i + 0.5) / nx) * ref.w), cy = Math.round(((j + 0.5) / ny) * ref.h);
      const x0 = Math.max(0, cx - size / 2), y0 = Math.max(0, cy - size / 2);
      const x1 = Math.min(ref.w, cx + size / 2), y1 = Math.min(ref.h, cy + size / 2);
      // need structure in the reference patch
      let s = 0, ss = 0, n = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const v = ref.d[y * ref.w + x]; if (v === v) { s += v; ss += v * v; n++; } }
      if (n < ((x1 - x0) * (y1 - y0)) / 8) continue;
      const std = Math.sqrt(Math.max(0, ss / n - (s / n) ** 2));
      if (std < 1.2) continue;
      const [gx, gy] = applySim(guess, cx, cy);
      const ox = Math.round(gx - cx), oy = Math.round(gy - cy);
      const m = searchShift(ref, lay, ox, oy, r, [x0, y0, x1, y1]);
      if (m.v < 0.5) continue;
      P.push([cx, cy]);
      Q.push([cx + m.fx, cy + m.fy]);
      W.push(m.v * m.v);
    }
  return { P, Q, W };
}

/** Register `lay` (already roughly at reference scale) onto `ref`. */
function register(ref: Img, lay: Img, seed?: Sim, prior?: { a: number; b: number }) {
  let sim: Sim;
  let globalPeak = NaN;
  if (seed) {
    sim = seed; // a sibling layer (same detector channel) already registered
  } else {
    // 1. global translation on a pyramid (after applying the rotation/scale prior, if any)
    const A = prior ?? { a: 1, b: 0 };
    const pre = prior ? warpF(lay, { ...A, tx: 0, ty: 0 }) : lay;
    const r8 = downsample(ref, 8), l8 = downsample(pre, 8);
    const R8 = Math.ceil(r8.w * 0.06);
    const c8 = searchShift(r8, l8, 0, 0, R8);
    const r2 = downsample(ref, 2), l2 = downsample(pre, 2);
    const c2 = searchShift(r2, l2, c8.dx * 4, c8.dy * 4, 5, undefined, 2);
    const c1 = searchShift(ref, pre, c2.dx * 2, c2.dy * 2, 2, undefined, 2);
    // ref(p) ≈ pre(p + t) = lay(A·(p + t))  →  translation A·t
    const [tx, ty] = applySim({ ...A, tx: 0, ty: 0 }, c1.fx, c1.fy);
    sim = { a: A.a, b: A.b, tx, ty };
    globalPeak = c1.v;
  }
  // 2a. stars: the one thing every filter agrees on
  const refStars = detectStars(ref), layStars = detectStars(lay);
  const sf = starFit(refStars, layStars, sim, Math.max(6, ref.w * 0.012));
  if (sf && sf.n >= 12) return { sim: sf.sim, globalPeak, stars: sf.n };
  // 2b. otherwise a patch grid → similarity, with outlier rejection
  for (let iter = 0; iter < 2; iter++) {
    const { P, Q, W } = matchPatches(ref, lay, sim);
    if (P.length < 4) break;
    let s = fitSimilarity(P, Q, W);
    const resid = P.map((p, i) => Math.hypot(applySim(s, ...p)[0] - Q[i][0], applySim(s, ...p)[1] - Q[i][1]));
    const keep = resid.map((r) => r < 1.2);
    if (keep.filter(Boolean).length >= 4) s = fitSimilarity(P.filter((_, i) => keep[i]), Q.filter((_, i) => keep[i]), W.filter((_, i) => keep[i]));
    sim = s;
  }
  return { sim, globalPeak, stars: sf?.n ?? 0 };
}

/** Residual misalignment after warping: RMS of patch offsets (px at output scale). */
function residual(ref: Img, warped: Img) {
  const sf = starFit(detectStars(ref), detectStars(warped), { a: 1, b: 0, tx: 0, ty: 0 }, 3);
  if (sf && sf.n >= 12) {
    // residual misalignment = how far the best-fit correction moves points, sampled over the frame
    let m = 0;
    for (const [x, y] of [[0, 0], [ref.w, 0], [0, ref.h], [ref.w, ref.h], [ref.w / 2, ref.h / 2]] as [number, number][]) {
      const [u, v] = applySim(sf.sim, x, y);
      m = Math.max(m, Math.hypot(u - x, v - y));
    }
    return { rms: Math.max(sf.rms, m), max: m, n: sf.n };
  }
  const { P, Q } = matchPatches(ref, warped, { a: 1, b: 0, tx: 0, ty: 0 }, 7, 4, 180, 3);
  if (P.length === 0) return { rms: NaN, n: 0 };
  const d = P.map((p, i) => Math.hypot(Q[i][0] - p[0], Q[i][1] - p[1]));
  return { rms: Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length), max: Math.max(...d), n: P.length };
}

/** Pixels connected to the border through "no data" (white) — the outside of the mosaic footprint. */
function outsideMask(u8: Uint8Array, w: number, h: number, k = 4) {
  const W = Math.floor(w / k), H = Math.floor(h / k);
  const white = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (u8[(y * k + j) * w + x * k + i] >= INVALID) n++;
      white[y * W + x] = n >= (k * k) / 2 ? 1 : 0;
    }
  const out = new Uint8Array(W * H);
  const stack: number[] = [];
  const push = (i: number) => { if (white[i] && !out[i]) { out[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop()!, x = i % W, y = (i / W) | 0;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (y > 0) push(i - W);
    if (y < H - 1) push(i + W);
  }
  return { out, W, H, k };
}

/** Largest axis-aligned rectangle of zeros in a binary grid (histogram method). */
function maxRect(bad: Uint8Array, W: number, H: number) {
  const hgt = new Int32Array(W);
  let best = { area: 0, x: 0, y: 0, w: W, h: H };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) hgt[x] = bad[y * W + x] ? 0 : hgt[x] + 1;
    const st: number[] = [];
    for (let x = 0; x <= W; x++) {
      const cur = x === W ? 0 : hgt[x];
      while (st.length && hgt[st[st.length - 1]] >= cur) {
        const top = st.pop()!;
        const left = st.length ? st[st.length - 1] + 1 : 0;
        const area = hgt[top] * (x - left);
        if (area > best.area) best = { area, x: left, y: y - hgt[top] + 1, w: x - left, h: hgt[top] };
      }
      st.push(x);
    }
  }
  return best;
}

/* ───────────────────────── main ───────────────────────── */

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const manifestPath = path.join(OUT, "manifest.json");
const prev = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { datasets: [] };
const results: Record<string, unknown>[] = [];

for (const ds of DATASETS) {
  if (only.length && !only.includes(ds.slug)) {
    const old = prev.datasets.find((d: { slug: string }) => d.slug === ds.slug);
    if (old) results.push(old);
    continue;
  }
  console.log(`\n▶ ${ds.slug}`);
  const { rows } = await pool.query<{
    obs_id: string; jpeg_url: string; instrument: string; t_min: number; proposal_id: number; title: string; proposal_pi: string;
  }>(
    `select obs_id, jpeg_url, instrument, t_min, proposal_id, title, proposal_pi from products
     where product_type = 'image' and jpeg_url is not null and obs_id like $1 order by em_min`,
    [ds.obsPrefix + "\\_%"],
  );
  if (rows.length === 0) { console.warn("  no products"); continue; }

  // ESA official palette
  const esa: Record<string, string> = {};
  if (ds.esaId) {
    const g = await pool.query<{ filters: { color: string; wavelength: string }[] }>(`select filters from gallery_images where id = $1`, [ds.esaId]);
    const fl = g.rows[0]?.filters ?? [];
    const names = rows.map((r) => filterName(r.obs_id)!).filter(Boolean);
    for (const f of fl) {
      let um: number;
      if (ds.esaFix?.[f.wavelength]) um = ds.esaFix[f.wavelength];
      else {
        const m = f.wavelength.match(/([\d.]+)\s*(nm|μm|um)/);
        if (!m) continue;
        um = m[2] === "nm" ? Number(m[1]) / 1000 : Number(m[1]);
      }
      let best: string | null = null, bestErr = Infinity;
      for (const n of names) {
        if (esa[n]) continue; // nearest *unassigned* filter
        const err = Math.abs(Math.log(PIVOT_UM[n] / um));
        if (err < bestErr) { bestErr = err; best = n; }
      }
      if (best && bestErr < Math.log(1.12) && ESA_COLORS[f.color]) esa[best] = ESA_COLORS[f.color];
    }
    console.log(`  ESA palette (${ds.esaId}):`, esa);
  }

  // download + metadata
  const layers: { name: string; file: string; W: number; H: number; obs_id: string }[] = [];
  for (const r of rows) {
    const name = filterName(r.obs_id);
    if (!name || !PIVOT_UM[name]) { console.warn(`  skip ${r.obs_id} (unknown filter)`); continue; }
    const file = await download(r.jpeg_url);
    const meta = await sharp(file, { limitInputPixels: false }).metadata();
    layers.push({ name, file, W: meta.width!, H: meta.height!, obs_id: r.obs_id });
    console.log(`  ${name.padEnd(7)} ${meta.width}×${meta.height}  ${r.obs_id}`);
  }
  layers.sort((a, b) => PIVOT_UM[a.name] - PIVOT_UM[b.name]);

  const refL = layers.reduce((a, b) => (b.W * b.H > a.W * a.H ? b : a));
  type W = {
    name: string; W: number; u8: Uint8Array; rms: number; maxErr: number; n: number; scale: number; rotDeg: number;
    sim?: Sim; how: "reference" | "matched" | "seeded" | "native-grid";
  };
  // NIRCam long-wave → short-wave mosaics differ by a near-constant rotation/scale (measured on 3 fields).
  const LW_PRIOR = { a: 1.0079 * Math.cos((0.465 * Math.PI) / 180), b: 1.0079 * Math.sin((0.465 * Math.PI) / 180) };
  const isNircamLW = (L: (typeof layers)[number]) => rows[0].instrument.startsWith("NIRCAM") && L.W < refL.W * 0.6;
  const nativeGrid = (L: (typeof layers)[number]) =>
    Math.abs(L.W - refL.W) / refL.W < 0.002 && Math.abs(L.H - refL.H) / refL.H < 0.002;

  async function align(outW: number) {
    const outH = Math.round((refL.H * outW) / refL.W);
    const k8 = Math.max(1, outW / MAX_W); // residuals are in output px; judge them at display scale
    const confident = (w: W) => w.how === "reference" || (w.n >= 6 && w.rms < 0.5 * k8);
    const refU = await loadGray(refL.file, outW, outH);
    const ref = highpass(toF(refU.u8, outW, outH));
    const attempt = async (L: (typeof layers)[number], seed?: Sim | "identity" | "noprior"): Promise<W> => {
      // initial guess: same footprint width → resample to the output width
      const h = Math.round((L.H * outW) / L.W);
      const src = await loadGray(L.file, outW, h);
      const lay = highpass(toF(src.u8, outW, h));
      const { sim, globalPeak, stars } =
        seed === "identity"
          ? { sim: { a: 1, b: 0, tx: 0, ty: 0 }, globalPeak: NaN, stars: 0 }
          : seed === "noprior"
            ? register(ref, lay)
            : register(ref, lay, seed, isNircamLW(L) ? LW_PRIOR : undefined);
      const u8 = warp(src, sim, outW, outH);
      const res = residual(ref, highpass(toF(u8, outW, outH)));
      const scale = Math.hypot(sim.a, sim.b), rotDeg = (Math.atan2(sim.b, sim.a) * 180) / Math.PI;
      const how = seed === "identity" ? "native-grid" : seed && seed !== "noprior" ? "seeded" : "matched";
      console.log(
        `  ${L.name.padEnd(7)} ${how.padEnd(11)} stars ${String(stars).padStart(3)} peak ${globalPeak.toFixed(2)}  shift ${sim.tx.toFixed(2)},${sim.ty.toFixed(2)}  scale ${scale.toFixed(5)}  rot ${rotDeg.toFixed(3)}°  → residual ${res.rms.toFixed(2)} px (max ${res.max?.toFixed(2)}, n=${res.n})`,
      );
      return { name: L.name, W: L.W, u8, rms: res.rms, maxErr: res.max ?? NaN, n: res.n, scale, rotDeg, sim, how };
    };
    const warped: W[] = [];
    for (const L of layers) {
      if (L === refL) {
        warped.push({ name: L.name, W: L.W, u8: refU.u8, rms: 0, maxErr: 0, n: 0, scale: 1, rotDeg: 0, how: "reference" });
        continue;
      }
      warped.push(await attempt(L));
    }
    for (let i = 0; i < warped.length; i++) {
      if (confident(warped[i])) continue;
      const L = layers.find((l) => l.name === warped[i].name)!;
      const tries: W[] = [warped[i]];
      // retry seeded from a confidently registered sibling of the same native size …
      const sib = warped
        .filter((w) => w !== warped[i] && w.sim && w.n >= 6 && w.rms < 1.0 * k8 && Math.abs(w.W - L.W) / L.W < 0.01)
        .sort((a, b) => a.rms - b.rms)[0];
      if (sib) tries.push(await attempt(L, sib.sim));
      if (isNircamLW(L)) tries.push(await attempt(L, "noprior"));
      // … and the pipeline's own grid when the layer shares the reference's native grid
      if (nativeGrid(L)) tries.push(await attempt(L, "identity"));
      const measurable = tries.filter((t) => t.n >= 4 && t.rms === t.rms).sort((a, b) => a.rms - b.rms);
      if (measurable.length && measurable[0].rms < 1.0 * k8) warped[i] = { ...measurable[0], how: measurable[0].how };
      else if (!measurable.length && nativeGrid(L)) warped[i] = tries.find((t) => t.how === "native-grid")!;
      else if (!measurable.length && sib && Math.abs(sib.W - L.W) / L.W < 0.002) warped[i] = { ...tries.find((t) => t.how === "seeded")!, how: "seeded" };
      else continue;
      (warped[i] as W & { accepted?: boolean }).accepted = true;
    }
    const good = warped.filter((w) => confident(w) || (w as W & { accepted?: boolean }).accepted);
    for (const w of warped) if (!good.includes(w)) console.warn(`  ✗ dropping ${w.name}: residual ${w.rms.toFixed(2)} px over ${w.n} patches`);

    // common crop: largest rectangle every kept layer covers, inset to lose noisy mosaic edges
    const k = 4;
    let combined: Uint8Array | null = null, MW = 0, MH = 0;
    for (const w of good) {
      const m = outsideMask(w.u8, outW, outH, k);
      MW = m.W; MH = m.H;
      if (!combined) combined = m.out.slice();
      else for (let i = 0; i < combined.length; i++) combined[i] |= m.out[i];
    }
    const rect = maxRect(combined!, MW, MH);
    const inset = 0.015;
    const cx = Math.round(rect.x * k + rect.w * k * inset), cy = Math.round(rect.y * k + rect.h * k * inset);
    let cw = Math.round(rect.w * k * (1 - 2 * inset)), ch = Math.round(rect.h * k * (1 - 2 * inset));
    cw = Math.min(cw, outW - cx); ch = Math.min(ch, outH - cy);
    console.log(`  crop ${cw}×${ch} at ${cx},${cy} (of ${outW}×${outH})`);
    return { good, outW, outH, cx, cy, cw, ch };
  }

  let A = await align(Math.min(MAX_W, refL.W));
  if (A.cw < 0.8 * MAX_W && refL.W > A.outW) {
    const w2 = Math.min(refL.W, Math.round((A.outW * MAX_W) / A.cw));
    console.log(`  crop is only ${A.cw}px wide → re-running at ${w2}px`);
    A = await align(w2);
  }
  const { good, outW, outH, cx, cy, cw, ch } = A;

  const dir = path.join(OUT, ds.slug);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const filters = [];
  let bytes = 0;
  for (const w of good) {
    const file = `${w.name.toLowerCase()}.webp`;
    const info = await sharp(Buffer.from(w.u8), { raw: { width: outW, height: outH, channels: 1 } })
      .extract({ left: cx, top: cy, width: cw, height: ch })
      .webp({ quality: 82, effort: 5 })
      .toFile(path.join(dir, file));
    bytes += info.size;
    const meta = rows.find((r) => filterName(r.obs_id) === w.name)!;
    filters.push({
      name: w.name,
      pivot_um: PIVOT_UM[w.name],
      file: `/lab/${ds.slug}/${file}`,
      w: cw,
      h: ch,
      obs_id: meta.obs_id,
      esa_color: esa[w.name] ?? null,
      registration:
        w.how === "reference" || w.how === "native-grid"
          ? { method: w.how }
          : { method: w.how, rms_px: +w.rms.toFixed(2), patches: w.n, scale: +w.scale.toFixed(5), rotation_deg: +w.rotDeg.toFixed(3) },
    });
  }

  // a chromatic-order check composite for eyeballing fringing
  {
    const n = good.length;
    const rgb = new Uint8Array(cw * ch * 3);
    const hues = good.map((_, i) => (n === 1 ? 0 : 240 - (240 * i) / (n - 1)));
    const col = hues.map((hDeg) => {
      const f = (o: number) => { const kk = (o + hDeg / 60) % 6; return 1 - Math.max(0, Math.min(kk, 4 - kk, 1)); };
      return [f(5), f(3), f(1)];
    });
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < n; i++) {
          const v = good[i].u8[(y + cy) * outW + x + cx] / 255;
          r += v * col[i][0]; g += v * col[i][1]; b += v * col[i][2];
        }
        const o = (y * cw + x) * 3, s = 255 * (3 / n);
        rgb[o] = Math.min(255, r * s); rgb[o + 1] = Math.min(255, g * s); rgb[o + 2] = Math.min(255, b * s);
      }
    await sharp(Buffer.from(rgb), { raw: { width: cw, height: ch, channels: 3 } }).jpeg({ quality: 88 }).toFile(path.join(CACHE, `check-${ds.slug}.jpg`));
  }

  const r0 = rows[0];
  results.push({
    slug: ds.slug,
    title: ds.title,
    target: ds.target,
    blurb: ds.blurb,
    instrument: r0.instrument.split("/")[0] === "NIRCAM" ? "NIRCam" : r0.instrument.split("/")[0],
    programme: r0.proposal_id,
    programme_title: r0.title,
    pi: r0.proposal_pi,
    observed: new Date((Math.min(...rows.map((r) => r.t_min)) - 40587) * 86400000).toISOString().slice(0, 10),
    esa_id: ds.esaId ?? null,
    esa_note: ds.esaNote ?? null,
    width: cw,
    height: ch,
    bytes,
    filters,
  });
  console.log(`  ✓ ${good.length} layers, ${(bytes / 1e6).toFixed(2)} MB`);
}

const ordered = DATASETS.map((d) => results.find((r) => r.slug === d.slug)).filter(Boolean);
fs.writeFileSync(manifestPath, JSON.stringify({ generated: new Date().toISOString(), datasets: ordered }, null, 2));
const total = ordered.reduce((s, d) => s + ((d as { bytes: number }).bytes ?? 0), 0);
console.log(`\nmanifest: ${ordered.length} datasets, ${(total / 1e6).toFixed(1)} MB total`);
await pool.end();
