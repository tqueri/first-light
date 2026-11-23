"use client";

import clsx from "clsx";
import { Download, Eye, EyeOff, Maximize, Minus, Plus, RotateCcw, Scan } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { TRACES } from "@/lib/lab/filters";
import type { GlobalState, LabDataset, LayerState, ToneMode } from "@/lib/lab/types";
import { Compositor, MAX_LAYERS, type View } from "./compositor";
import { WavelengthStrip } from "./wavelength-strip";

/* ───────── colour helpers ───────── */
const SWATCHES = [
  { name: "Violet", hex: "#9b6bff" },
  { name: "Blue", hex: "#3d6dff" },
  { name: "Cyan", hex: "#2fd0ff" },
  { name: "Green", hex: "#3dfa7c" },
  { name: "Yellow", hex: "#ffe04a" },
  { name: "Orange", hex: "#ff9a2e" },
  { name: "Red", hex: "#ff3a2e" },
  { name: "White", hex: "#ffffff" },
];

function hslHex(h: number, s = 1, l = 0.5) {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Shortest wavelength → blue … longest → red (the convention Webb's imagers use). */
function chromatic(n: number, i: number) {
  if (n === 1) return "#ffffff";
  return hslHex(235 - (235 * i) / (n - 1));
}

type Stats = { hist: Float32Array; lo: number; hi: number; small: Uint8Array; sw: number; sh: number };
type Preset = "chromatic" | "esa" | "raw" | "solo";

const DEFAULT_GLOBAL: GlobalState = { exposure: 0, saturation: 1.15, contrast: 0.25, tone: "filmic" };

function initialLayers(ds: LabDataset, stats: (Stats | undefined)[], preset: Preset, solo = 0): LayerState[] {
  const n = ds.filters.length;
  return ds.filters.map((f, i) => {
    const s = stats[i];
    const base: LayerState = {
      on: true,
      color: chromatic(n, i),
      black: s ? s.lo : 0.05,
      white: s ? s.hi : 1,
      mode: "gamma",
      gamma: 1,
      asinh: 20,
      gain: 1,
    };
    if (preset === "esa") return { ...base, on: !!f.esa_color, color: f.esa_color ?? base.color };
    if (preset === "raw") return { ...base, color: "#ffffff" };
    if (preset === "solo") return { ...base, on: i === solo, color: "#ffffff" };
    return base;
  });
}

/* ───────── image loading + stats ───────── */
const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string) {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => res(img);
      img.onerror = () => rej(new Error(`failed to load ${src}`));
      img.src = src;
    }).then(async (img) => {
      await img.decode().catch(() => {});
      return img;
    });
    imageCache.set(src, p);
  }
  return p;
}

const statsCache = new Map<string, Stats>();
function computeStats(src: string, img: HTMLImageElement): Stats {
  const hit = statsCache.get(src);
  if (hit) return hit;
  const sw = Math.min(768, img.naturalWidth);
  const sh = Math.round((img.naturalHeight * sw) / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, sw, sh);
  const d = ctx.getImageData(0, 0, sw, sh).data;
  const small = new Uint8Array(sw * sh);
  const counts = new Uint32Array(256);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    small[j] = d[i];
    counts[d[i]]++;
  }
  const total = small.length;
  const pct = (p: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += counts[v];
      if (acc >= total * p) return v / 255;
    }
    return 1;
  };
  const hist = new Float32Array(64);
  for (let v = 0; v < 256; v++) hist[v >> 2] += counts[v];
  const max = Math.max(...Array.from(hist).slice(1, 63));
  for (let i = 0; i < 64; i++) hist[i] = Math.min(1, Math.sqrt(hist[i] / max));
  const s: Stats = { hist, lo: Math.max(0, pct(0.02) - 0.02), hi: Math.max(pct(0.997), 0.35), small, sw, sh };
  statsCache.set(src, s);
  return s;
}

/* ───────── small UI atoms ───────── */
function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format = (v: number) => v.toFixed(2),
  fill,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  fill?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
        {label}
        <span className="tabular-nums text-fg-2 normal-case tracking-normal">{format(value)}</span>
      </span>
      <input
        type="range"
        className="slider mt-2"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--pct" as string]: `${pct}%`, ["--track-fill" as string]: fill ?? "var(--color-gold)" }}
      />
    </label>
  );
}

function Histogram({ stats, black, white, color }: { stats?: Stats; black: number; white: number; color: string }) {
  if (!stats) return <div className="h-10 rounded-sm bg-white/[0.03]" />;
  const pts = Array.from(stats.hist)
    .map((v, i) => `${(i / 63) * 100},${40 - v * 38}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-full rounded-sm bg-white/[0.03]">
      <rect x={0} y={0} width={black * 100} height={40} fill="rgba(0,0,0,0.55)" />
      <rect x={white * 100} y={0} width={100 - white * 100} height={40} fill="rgba(0,0,0,0.55)" />
      <polyline points={`0,40 ${pts} 100,40`} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      <line x1={black * 100} x2={black * 100} y1={0} y2={40} stroke="#fff" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <line x1={white * 100} x2={white * 100} y1={0} y2={40} stroke="#fff" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-full text-fg-2 transition hover:bg-white/10 hover:text-fg"
    >
      {children}
    </button>
  );
}

/* ───────── WebGL2 support (client-only, cached) ───────── */
let supportCache: boolean | null = null;
const getSupport = () => (supportCache ??= Compositor.supported());
const noopSubscribe = () => () => {};

/* ───────── main studio ───────── */
export function LabStudio({ datasets }: { datasets: LabDataset[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<Compositor | null>(null);
  const viewRef = useRef<View>({ cx: 0, cy: 0, zoom: 1 });
  const targetRef = useRef<View>({ cx: 0, cy: 0, zoom: 1 });
  const rafRef = useRef(0);
  const fittedRef = useRef(true); // stays "fit to screen" across resizes until the user pans/zooms
  const stateRef = useRef<{ layers: LayerState[]; global: GlobalState }>({ layers: [], global: DEFAULT_GLOBAL });
  const savedRef = useRef(new Map<string, { layers: LayerState[]; global: GlobalState; preset: Preset }>());

  const support = useSyncExternalStore(noopSubscribe, getSupport, () => null);
  const [glError, setGlError] = useState<string | null>(null);
  const supported = support === null ? null : support && !glError;
  const [dsIndex, setDsIndex] = useState(0);
  const ds = datasets[dsIndex];
  const [layers, setLayers] = useState<LayerState[]>([]);
  const [global, setGlobal] = useState<GlobalState>(DEFAULT_GLOBAL);
  const [stats, setStats] = useState<(Stats | undefined)[]>([]);
  const [progress, setProgress] = useState<{ slug: string; done: number; label: string } | null>(null);
  const [loadError, setLoadError] = useState<{ slug: string; message: string } | null>(null);
  const [preset, setPreset] = useState<Preset>("chromatic");
  const [open, setOpen] = useState<number | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const [cursor, setCursor] = useState<{ x: number; y: number; values: number[] } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [readyKey, setReadyKey] = useState<string | null>(null);


  /* render loop: eases the view toward its target and draws */
  const requestRender = useCallback(() => {
    if (rafRef.current) return;
    const tick = () => {
      rafRef.current = 0;
      const comp = compRef.current;
      if (!comp) return;
      const v = viewRef.current, t = targetRef.current;
      const k = 0.22;
      v.cx += (t.cx - v.cx) * k;
      v.cy += (t.cy - v.cy) * k;
      v.zoom *= Math.pow(t.zoom / v.zoom, k);
      const settling = Math.abs(t.cx - v.cx) > 0.05 || Math.abs(t.cy - v.cy) > 0.05 || Math.abs(t.zoom / v.zoom - 1) > 1e-4;
      if (!settling) Object.assign(v, t);
      comp.render(stateRef.current.layers, stateRef.current.global, v);
      if (settling) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const fit = useCallback(
    (instant = false) => {
      const c = canvasRef.current, comp = compRef.current;
      if (!c || !comp) return;
      fittedRef.current = true;
      const z = Math.min(c.width / comp.imgW, c.height / comp.imgH) * 0.96;
      targetRef.current = { cx: comp.imgW / 2, cy: comp.imgH / 2, zoom: z };
      if (instant) viewRef.current = { ...targetRef.current };
      setZoomPct(Math.round((z / (window.devicePixelRatio || 1)) * 100));
      requestRender();
    },
    [requestRender],
  );

  /* init GL once */
  useEffect(() => {
    if (!support || !canvasRef.current) return;
    try {
      compRef.current = new Compositor(canvasRef.current);
    } catch (e) {
      // context creation can still fail (blocklisted GPU, lost context) after feature detection
      const message = (e as Error).message;
      queueMicrotask(() => setGlError(message));
    }
    return () => {
      cancelAnimationFrame(rafRef.current);
      compRef.current?.dispose();
      compRef.current = null;
    };
  }, [support]);

  /* canvas size tracks its container */
  useEffect(() => {
    const wrap = wrapRef.current, c = canvasRef.current;
    if (!wrap || !c) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = wrap.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      if (fittedRef.current) fit(true);
      requestRender();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fit, requestRender]);

  /* load dataset (loading / error state is derived per slug, so nothing is reset synchronously here) */
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const d = datasets[dsIndex];
    (async () => {
      try {
        let done = 0;
        const imgs = await Promise.all(
          d.filters.map((f) =>
            loadImage(f.file).then((img) => {
              done++;
              if (!cancelled) setProgress({ slug: d.slug, done, label: f.name });
              return img;
            }),
          ),
        );
        if (cancelled) return;
        const st = imgs.map((img, i) => computeStats(d.filters[i].file, img));
        const comp = compRef.current;
        if (!comp) return;
        if (Math.max(d.width, d.height) > comp.maxTexture) throw new Error("This dataset is larger than your GPU's texture limit.");
        comp.setLayers(imgs.slice(0, MAX_LAYERS), d.width, d.height);
        const saved = savedRef.current.get(d.slug);
        const p: Preset = saved?.preset ?? (d.filters.some((f) => f.esa_color) ? "esa" : "chromatic");
        setStats(st);
        setLayers(saved?.layers ?? initialLayers(d, st, p));
        setGlobal(saved?.global ?? DEFAULT_GLOBAL);
        setPreset(p);
        setOpen(null);
        setReadyKey(d.slug);
        requestAnimationFrame(() => fit(true));
      } catch (e) {
        if (!cancelled) setLoadError({ slug: d.slug, message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dsIndex, datasets, supported, fit]);

  /* remember edits per dataset */
  useEffect(() => {
    if (readyKey) savedRef.current.set(readyKey, { layers, global, preset });
  }, [layers, global, preset, readyKey]);

  /* redraw on any state change */
  useEffect(() => {
    stateRef.current = { layers, global };
    requestRender();
  }, [layers, global, requestRender]);

  /* warm the next datasets in the background once this one is ready */
  useEffect(() => {
    if (!readyKey) return;
    const id = setTimeout(() => {
      const next = datasets[(dsIndex + 1) % datasets.length];
      next.filters.forEach((f) => loadImage(f.file).catch(() => {}));
    }, 1500);
    return () => clearTimeout(id);
  }, [readyKey, dsIndex, datasets]);

  /* ───── interaction ───── */
  const toImage = (clientX: number, clientY: number) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const dpr = c.width / r.width;
    const v = viewRef.current;
    return {
      x: ((clientX - r.left) * dpr - c.width / 2) / v.zoom + v.cx,
      y: ((clientY - r.top) * dpr - c.height / 2) / v.zoom + v.cy,
      dpr,
    };
  };

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const c = canvasRef.current, comp = compRef.current;
      if (!c || !comp) return;
      const r = c.getBoundingClientRect();
      const dpr = c.width / r.width;
      const t = targetRef.current;
      fittedRef.current = false;
      const fitZ = Math.min(c.width / comp.imgW, c.height / comp.imgH) * 0.5;
      const nz = Math.min(Math.max(t.zoom * factor, fitZ), 16 * dpr);
      const sx = (clientX - r.left) * dpr - c.width / 2;
      const sy = (clientY - r.top) * dpr - c.height / 2;
      // keep the image point under the cursor fixed
      const ix = sx / t.zoom + t.cx, iy = sy / t.zoom + t.cy;
      targetRef.current = { zoom: nz, cx: ix - sx / nz, cy: iy - sy / nz };
      setZoomPct(Math.round((nz / dpr) * 100));
      requestRender();
    },
    [requestRender],
  );

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current;
    // a mouse with no button held is hovering, whatever we think we tracked (a lost pointerup, a dblclick…)
    if (e.pointerType === "mouse" && e.buttons === 0 && p.size) {
      p.clear();
      pinch.current = null;
    }
    const prev = p.get(e.pointerId);
    if (prev) {
      if (p.size === 1) {
        const c = canvasRef.current!;
        const dpr = c.width / c.getBoundingClientRect().width;
        const t = targetRef.current;
        const dx = ((e.clientX - prev.x) * dpr) / t.zoom, dy = ((e.clientY - prev.y) * dpr) / t.zoom;
        if (dx || dy) fittedRef.current = false;
        t.cx -= dx;
        t.cy -= dy;
        viewRef.current.cx -= dx;
        viewRef.current.cy -= dy;
        requestRender();
      }
      p.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (p.size === 2) {
        const [a, b] = [...p.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.current);
        pinch.current = d;
      }
    }
    // cursor readout
    const comp = compRef.current;
    if (!comp || !stats.length) return;
    const { x, y } = toImage(e.clientX, e.clientY);
    if (x < 0 || y < 0 || x >= comp.imgW || y >= comp.imgH) return setCursor(null);
    setCursor({
      x,
      y,
      values: stats.map((s) => (s ? s.small[Math.floor((y / comp.imgH) * s.sh) * s.sw + Math.floor((x / comp.imgW) * s.sw)] : 0)),
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const zoomCentre = useCallback(
    (factor: number | "1:1") => {
      const c = canvasRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const f = factor === "1:1" ? c.width / r.width / targetRef.current.zoom : factor;
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
    },
    [zoomAt],
  );

  /* ───── edits ───── */
  const update = (i: number, patch: Partial<LayerState>) => setLayers((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const applyPreset = (p: Preset, solo = 0) => {
    setPreset(p);
    setLayers((ls) => {
      const fresh = initialLayers(ds, stats, p, solo);
      // keep the user's levels; presets only change colour and visibility
      return fresh.map((f, i) => (ls[i] ? { ...ls[i], on: f.on, color: f.color } : f));
    });
    if (p === "solo") setOpen(solo);
  };
  const resetAll = () => {
    setLayers(initialLayers(ds, stats, preset));
    setGlobal(DEFAULT_GLOBAL);
  };

  const exportImage = async () => {
    const comp = compRef.current;
    if (!comp) return;
    setExporting(true);
    try {
      const blob = await comp.exportPNG(layers, global, `Raw data: NASA/ESA/CSA/STScI via MAST · ${ds.target} · composited with First Light`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `first-light-${ds.slug}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally {
      setExporting(false);
      requestRender();
    }
  };

  const hasEsa = ds.filters.some((f) => f.esa_color);
  const ready = readyKey === ds.slug;
  const error = glError ?? (loadError?.slug === ds.slug ? loadError.message : null);
  const loading =
    !ready && !error
      ? {
          done: progress?.slug === ds.slug ? progress.done : 0,
          total: ds.filters.length,
          label: progress?.slug === ds.slug ? progress.label : ds.filters[0].name,
        }
      : null;
  const groups = useMemo(() => {
    const m = new Map<string, number[]>();
    datasets.forEach((d, i) => {
      const k = d.title.split(" · ")[0];
      m.set(k, [...(m.get(k) ?? []), i]);
    });
    return [...m.entries()];
  }, [datasets]);

  /* ───── render ───── */
  if (supported === false) {
    return (
      <div className="mx-auto flex min-h-[70svh] max-w-xl flex-col items-center justify-center px-6 pt-24 text-center">
        <p className="eyebrow">WebGL2 unavailable</p>
        <h1 className="display mt-6 text-4xl">The Lab needs a GPU.</h1>
        <p className="mt-6 text-fg-2">
          Your browser didn&apos;t give us a WebGL2 context{error ? ` (${error})` : ""}. Enable hardware acceleration, or try a
          recent Chrome, Edge, Firefox or Safari. The explanation below still works without it.
        </p>
      </div>
    );
  }

  return (
    <div className="grid lg:h-[calc(100svh-4rem)] lg:min-h-[620px] lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ── viewport ── */}
      <div className="relative flex h-[72svh] min-h-[420px] flex-col border-line bg-[#030407] lg:h-auto lg:min-h-0 lg:border-r">
        <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onLostPointerCapture={onPointerUp}
            onPointerLeave={() => setCursor(null)}
            onDoubleClick={(e) => zoomAt(e.clientX, e.clientY, 2)}
            aria-label={`Colour composite of ${ds.title}. Drag to pan, scroll to zoom.`}
          />

          {/* title HUD */}
          <div className="pointer-events-none absolute left-4 top-4 max-w-[70%] md:left-6 md:top-6">
            <p className="eyebrow !text-[9.5px]">
              {ds.instrument} · PID {ds.programme} · observed {ds.observed}
            </p>
            <h1 className="mt-2 text-2xl font-light tracking-tight md:text-3xl">{ds.title}</h1>
            <p className="mt-1 text-xs text-muted">{ds.target}</p>
          </div>

          {/* toolbar */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full border border-line bg-ink/70 p-1 backdrop-blur-md md:bottom-auto md:right-6 md:top-6">
            <ToolButton label="Zoom out" onClick={() => zoomCentre(1 / 1.6)}>
              <Minus className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton label="Zoom in" onClick={() => zoomCentre(1.6)}>
              <Plus className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton label="Fit to screen" onClick={() => fit()}>
              <Maximize className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton label="Actual pixels (1:1)" onClick={() => zoomCentre("1:1")}>
              <Scan className="h-3.5 w-3.5" />
            </ToolButton>
            <span className="px-2 font-mono text-[10px] tabular-nums text-muted">{zoomPct}%</span>
            <button
              type="button"
              onClick={exportImage}
              disabled={!!loading || exporting}
              className="ml-1 inline-flex h-8 items-center gap-2 rounded-full bg-fg px-3 text-[12px] font-medium text-ink transition hover:bg-gold disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Rendering…" : "Export PNG"}
            </button>
          </div>

          {/* readout HUD */}
          <div className="pointer-events-none absolute bottom-4 left-4 font-mono text-[10px] text-muted md:bottom-6 md:left-6">
            {cursor ? (
              <div className="glass rounded-sm px-3 py-2">
                <p className="tabular-nums text-fg-2">
                  x {cursor.x.toFixed(0).padStart(4, " ")} · y {cursor.y.toFixed(0).padStart(4, " ")}
                </p>
                <div className="mt-1.5 flex items-end gap-1.5">
                  {ds.filters.map((f, i) => (
                    <div key={f.name} className={clsx("flex flex-col items-center", !layers[i]?.on && "opacity-30")}>
                      <div className="flex h-8 w-3 items-end bg-white/5">
                        <div className="w-full" style={{ height: `${(cursor.values[i] / 255) * 100}%`, background: layers[i]?.color }} />
                      </div>
                      <span className="mt-1 text-[8px]">{f.name.replace(/^F/, "")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <span className="hidden md:inline">drag to pan · scroll or pinch to zoom · double-click to dive in</span>
            )}
          </div>

          {/* loading */}
          {loading && (
            <div className="absolute inset-0 grid place-items-center bg-ink/80 backdrop-blur-sm">
              <div className="w-64 text-center">
                <p className="eyebrow">Loading raw frames</p>
                <div className="mt-5 h-px w-full bg-line">
                  <div className="h-px bg-gold transition-all duration-500" style={{ width: `${(loading.done / loading.total) * 100}%` }} />
                </div>
                <p className="mt-3 font-mono text-[11px] text-muted tabular-nums">
                  {loading.done}/{loading.total} · {loading.label}
                </p>
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 grid place-items-center">
              <p className="max-w-sm text-center text-sm text-ember">{error}</p>
            </div>
          )}
        </div>
        <WavelengthStrip filters={ds.filters} layers={ready ? layers : []} />
      </div>

      {/* ── control panel ── */}
      <aside className="border-t border-line bg-ink-2 lg:min-h-0 lg:overflow-y-auto lg:border-t-0">
        {/* datasets */}
        <section className="border-b border-line p-5">
          <p className="eyebrow">Dataset</p>
          <div className="mt-3 space-y-1">
            {groups.map(([title, idxs]) => (
              <div key={title} className="flex items-center gap-1">
                <span className="mr-auto truncate text-[13px] text-fg-2">{title}</span>
                {idxs.map((i) => (
                  <button
                    key={datasets[i].slug}
                    type="button"
                    onClick={() => setDsIndex(i)}
                    className={clsx(
                      "rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-wider transition",
                      i === dsIndex ? "border-gold bg-gold/10 text-gold" : "border-line text-muted hover:border-line-2 hover:text-fg",
                    )}
                  >
                    {datasets[i].instrument}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">{ds.blurb}</p>
        </section>

        {/* presets */}
        <section className="border-b border-line p-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Palette</p>
            <button type="button" onClick={resetAll} className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted hover:text-fg">
              <RotateCcw className="h-3 w-3" /> reset
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {(
              [
                { k: "chromatic", label: "Chromatic order", hint: "short λ → blue, long λ → red" },
                { k: "esa", label: "ESA official", hint: hasEsa ? (ds.esa_note ?? `as published (${ds.esa_id})`) : "not available" },
                { k: "raw", label: "Raw", hint: "every filter, no colour" },
                { k: "solo", label: "Single filter", hint: "one frame at a time" },
              ] as { k: Preset; label: string; hint: string }[]
            ).map((p) => (
              <button
                key={p.k}
                type="button"
                disabled={p.k === "esa" && !hasEsa}
                onClick={() => applyPreset(p.k, open ?? 0)}
                className={clsx(
                  "rounded-sm border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-35",
                  preset === p.k ? "border-gold/70 bg-gold/[0.07]" : "border-line hover:border-line-2",
                )}
              >
                <span className="block text-[13px]">{p.label}</span>
                <span className="mt-0.5 block truncate font-mono text-[9.5px] text-muted">{p.hint}</span>
              </button>
            ))}
          </div>
        </section>

        {/* layers */}
        <section className="border-b border-line">
          <p className="eyebrow px-5 pt-5">Filters · {ds.filters.length} raw frames</p>
          <ul className="mt-3">
            {!ready &&
              ds.filters.map((f) => (
                <li key={f.name} className="flex items-center gap-3 border-t border-line px-5 py-3 opacity-40">
                  <span className="h-4 w-4 rounded-full bg-white/10" />
                  <span className="font-mono text-[13px]">{f.name}</span>
                  <span className="h-2 flex-1 rounded-full bg-white/5" />
                </li>
              ))}
            {ready && ds.filters.map((f, i) => {
              const L = layers[i];
              if (!L) return null;
              const t = TRACES[f.name];
              const expanded = open === i;
              return (
                <li key={f.name} className={clsx("border-t border-line", expanded && "bg-white/[0.02]")}>
                  <div className="flex items-center gap-3 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => update(i, { on: !L.on })}
                      aria-label={L.on ? `Hide ${f.name}` : `Show ${f.name}`}
                      className="text-muted transition hover:text-fg"
                    >
                      {L.on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <span
                      className="h-4 w-4 shrink-0 rounded-full ring-1 ring-white/20"
                      style={{ background: L.color, opacity: L.on ? 1 : 0.3, boxShadow: L.on ? `0 0 14px ${L.color}88` : undefined }}
                    />
                    <button type="button" onClick={() => setOpen(expanded ? null : i)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-baseline gap-2">
                        <span className="font-mono text-[13px]">{f.name}</span>
                        <span className="font-mono text-[10px] text-dim">{f.pivot_um.toFixed(2)} μm</span>
                      </span>
                      <span className="block truncate text-[11.5px] text-muted">{t?.short ?? "Broad-band continuum"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("solo", i)}
                      className="rounded-full border border-line px-2 py-0.5 font-mono text-[9px] tracking-wider text-muted uppercase hover:border-line-2 hover:text-fg"
                    >
                      solo
                    </button>
                  </div>
                  {expanded && (
                    <div className="space-y-4 px-5 pb-5">
                      {t && <p className="text-[12.5px] leading-relaxed text-fg-2">{t.long}</p>}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {SWATCHES.map((s) => (
                          <button
                            key={s.hex}
                            type="button"
                            title={s.name}
                            aria-label={`Colour ${s.name}`}
                            onClick={() => update(i, { color: s.hex })}
                            className={clsx("h-6 w-6 rounded-full ring-1 transition hover:scale-110", L.color === s.hex ? "ring-2 ring-white" : "ring-white/15")}
                            style={{ background: s.hex }}
                          />
                        ))}
                        <label className="relative ml-1 h-6 w-6 cursor-pointer overflow-hidden rounded-full ring-1 ring-white/15" title="Custom colour">
                          <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
                          <input type="color" value={L.color} onChange={(e) => update(i, { color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                        </label>
                      </div>
                      <Histogram stats={stats[i]} black={L.black} white={L.white} color={L.color} />
                      <div className="grid grid-cols-2 gap-4">
                        <Slider label="Black point" value={L.black} min={0} max={0.9} step={0.002} onChange={(v) => update(i, { black: Math.min(v, L.white - 0.02) })} fill={L.color} />
                        <Slider label="White point" value={L.white} min={0.1} max={1} step={0.002} onChange={(v) => update(i, { white: Math.max(v, L.black + 0.02) })} fill={L.color} />
                      </div>
                      <div>
                        <div className="mb-2 flex gap-1">
                          {(["gamma", "asinh"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => update(i, { mode: m })}
                              className={clsx(
                                "rounded-full border px-2.5 py-0.5 font-mono text-[10px]",
                                L.mode === m ? "border-gold/70 text-gold" : "border-line text-muted hover:text-fg",
                              )}
                            >
                              {m === "gamma" ? "Power (γ)" : "asinh"}
                            </button>
                          ))}
                        </div>
                        {L.mode === "gamma" ? (
                          <Slider label="Gamma" value={L.gamma} min={0.3} max={3} onChange={(v) => update(i, { gamma: v })} fill={L.color} />
                        ) : (
                          <Slider label="asinh softening" value={L.asinh} min={1} max={200} step={1} onChange={(v) => update(i, { asinh: v })} format={(v) => v.toFixed(0)} fill={L.color} />
                        )}
                      </div>
                      <Slider label="Intensity" value={L.gain} min={0} max={3} onChange={(v) => update(i, { gain: v })} fill={L.color} />
                      <p className="font-mono text-[9.5px] leading-relaxed text-dim">
                        {f.obs_id}
                        <br />
                        {f.registration.method === "reference"
                          ? "reference frame for alignment"
                          : f.registration.method === "native-grid"
                            ? "on the reference's native pixel grid"
                            : `aligned on ${f.registration.patches} stars · residual ${f.registration.rms_px} px · rot ${f.registration.rotation_deg}°`}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* global */}
        <section className="space-y-4 p-5">
          <p className="eyebrow">Develop</p>
          <Slider label="Exposure" value={global.exposure} min={-3} max={3} onChange={(v) => setGlobal((g) => ({ ...g, exposure: v }))} format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} EV`} />
          <Slider label="Saturation" value={global.saturation} min={0} max={2} onChange={(v) => setGlobal((g) => ({ ...g, saturation: v }))} />
          <Slider label="Contrast" value={global.contrast} min={0} max={1} onChange={(v) => setGlobal((g) => ({ ...g, contrast: v }))} />
          <div>
            <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Tone curve</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {(
                [
                  ["clip", "Linear"],
                  ["filmic", "Filmic"],
                  ["soft", "asinh"],
                ] as [ToneMode, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setGlobal((g) => ({ ...g, tone: k }))}
                  className={clsx(
                    "rounded-sm border py-1.5 text-[12px] transition",
                    global.tone === k ? "border-gold/70 bg-gold/[0.07]" : "border-line text-fg-2 hover:border-line-2",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
