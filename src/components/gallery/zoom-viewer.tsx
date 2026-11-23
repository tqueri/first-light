"use client";

/* eslint-disable @next/next/no-img-element -- multi-megapixel originals are loaded directly, not via the optimizer */
import clsx from "clsx";
import { Maximize2, Minimize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { esaImage } from "@/lib/images";
import { detailRendition, fmtAngle, niceBelow } from "./utils";

type Props = {
  id: string;
  alt: string;
  width: number | null;
  height: number | null;
  fov: { wArcsec: number; hArcsec: number } | null;
  /** Only for objects close enough that small-angle physical scale is meaningful. */
  distanceLy: number | null;
};

type View = { s: number; x: number; y: number };

const PUB_MAX = 4000; // ESA "publicationjpg" long side
const LARGE_MAX_PIXELS = 1.3e8; // don't ask a browser to decode gigapixel originals

function fmtPhysical(ly: number): string {
  if (ly < 0.02) return `${new Intl.NumberFormat("en-US").format(Math.round(ly * 63_241))} AU`;
  if (ly < 10) return `${ly.toFixed(ly < 1 ? 2 : 1)} light-years`;
  if (ly < 1e6) return `${new Intl.NumberFormat("en-US").format(Math.round(ly))} light-years`;
  return `${(ly / 1e6).toFixed(1)} million light-years`;
}

export function ZoomViewer({ id, alt, width, height, fov, distanceLy }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const miniRect = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLDivElement>(null);
  const zoomLabel = useRef<HTMLSpanElement>(null);
  const barEl = useRef<HTMLDivElement>(null);
  const barLabel = useRef<HTMLSpanElement>(null);
  const barPhys = useRef<HTMLSpanElement>(null);

  const view = useRef<View>({ s: 1, x: 0, y: 0 });
  const base = useRef({ w: 0, h: 0, cw: 0, ch: 0 });
  const natural = useRef<{ w: number; h: number } | null>(width && height ? { w: width, h: height } : null);
  const anim = useRef<number>(0);

  // Render-time copy of the natural size (refs can't be read during render).
  const [dims, setDims] = useState<{ w: number; h: number } | null>(width && height ? { w: width, h: height } : null);
  const [src, setSrc] = useState(esaImage(id, "screen"));
  const [tier, setTier] = useState<"screen" | "pub" | "large">("screen");
  const [loadingLarge, setLoadingLarge] = useState(false);
  const [ready, setReady] = useState(false);
  const [touched, setTouched] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const largeRequested = useRef(false);

  const maxScale = useCallback(() => {
    const n = natural.current;
    if (!n || !base.current.w) return 8;
    // allow up to 2 screen px per original pixel
    return Math.min(64, Math.max(4, (n.w / base.current.w) * 2));
  }, []);

  const clamp = useCallback((v: View): View => {
    const { w, h, cw, ch } = base.current;
    const sw = w * v.s;
    const sh = h * v.s;
    const x = sw <= cw ? (cw - sw) / 2 : Math.min(0, Math.max(cw - sw, v.x));
    const y = sh <= ch ? (ch - sh) / 2 : Math.min(0, Math.max(ch - sh, v.y));
    return { s: v.s, x, y };
  }, []);

  const maybeUpgrade = useCallback(() => {
    const n = natural.current;
    if (!n || largeRequested.current) return;
    const dpr = window.devicePixelRatio || 1;
    const shown = base.current.w * view.current.s * dpr;
    const pubW = n.w >= n.h ? Math.min(n.w, PUB_MAX) : Math.min(n.w, (PUB_MAX * n.w) / n.h);
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    if (shown > pubW * 1.15 && n.w > pubW * 1.25 && n.w * n.h <= LARGE_MAX_PIXELS && mem >= 4) {
      largeRequested.current = true;
      setLoadingLarge(true);
      const pre = new Image();
      pre.src = esaImage(id, "large");
      pre
        .decode()
        .then(() => {
          setSrc(pre.src);
          setTier("large");
        })
        .catch(() => {})
        .finally(() => setLoadingLarge(false));
    }
  }, [id]);

  const apply = useCallback(() => {
    const el = img.current;
    if (!el) return;
    const v = view.current;
    const { w, h, cw, ch } = base.current;
    el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
    if (zoomLabel.current) zoomLabel.current.textContent = `×${v.s.toFixed(v.s < 10 ? 1 : 0)}`;
    // minimap viewport
    if (miniRect.current && mini.current) {
      const show = v.s > 1.04;
      mini.current.style.opacity = show ? "1" : "0";
      const u0 = Math.max(0, -v.x / (w * v.s));
      const v0 = Math.max(0, -v.y / (h * v.s));
      const uw = Math.min(1 - u0, cw / (w * v.s));
      const vh = Math.min(1 - v0, ch / (h * v.s));
      miniRect.current.style.left = `${u0 * 100}%`;
      miniRect.current.style.top = `${v0 * 100}%`;
      miniRect.current.style.width = `${uw * 100}%`;
      miniRect.current.style.height = `${vh * 100}%`;
    }
    // scale bar
    if (fov && barEl.current && barLabel.current && w) {
      const arcsecPerPx = fov.wArcsec / (w * v.s);
      const target = 130 * arcsecPerPx;
      const nice = target >= 60 ? niceBelow(target / 60) * 60 : niceBelow(target);
      barEl.current.style.width = `${nice / arcsecPerPx}px`;
      barLabel.current.textContent = fmtAngle(nice);
      if (barPhys.current) {
        barPhys.current.textContent = distanceLy ? `≈ ${fmtPhysical((distanceLy * nice) / 206_265)}` : "";
      }
    }
  }, [fov, distanceLy]);

  const layout = useCallback(
    (keepCenter: boolean) => {
      const c = box.current;
      const n = natural.current;
      if (!c || !n) return;
      const cw = c.clientWidth;
      const ch = c.clientHeight;
      const prev = { ...base.current };
      const fit = Math.min(cw / n.w, ch / n.h);
      const w = n.w * fit;
      const h = n.h * fit;
      base.current = { w, h, cw, ch };
      if (img.current) {
        img.current.style.width = `${w}px`;
        img.current.style.height = `${h}px`;
      }
      if (keepCenter && prev.w) {
        const v = view.current;
        // image-space fraction currently at the centre
        const fx = (prev.cw / 2 - v.x) / (prev.w * v.s);
        const fy = (prev.ch / 2 - v.y) / (prev.h * v.s);
        view.current = clamp({ s: v.s, x: cw / 2 - fx * w * v.s, y: ch / 2 - fy * h * v.s });
      } else {
        view.current = clamp({ s: 1, x: 0, y: 0 });
      }
      apply();
    },
    [apply, clamp],
  );

  const zoomAt = useCallback(
    (px: number, py: number, k: number) => {
      const v = view.current;
      const s = Math.min(maxScale(), Math.max(1, v.s * k));
      const r = s / v.s;
      view.current = clamp({ s, x: px - (px - v.x) * r, y: py - (py - v.y) * r });
      apply();
      maybeUpgrade();
    },
    [apply, clamp, maxScale, maybeUpgrade],
  );

  const animateTo = useCallback(
    (target: View) => {
      cancelAnimationFrame(anim.current);
      const from = { ...view.current };
      const to = clamp(target);
      const t0 = performance.now();
      const dur = 420;
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - t, 4);
        view.current = {
          s: from.s + (to.s - from.s) * e,
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
        };
        apply();
        if (t < 1) anim.current = requestAnimationFrame(step);
        else maybeUpgrade();
      };
      anim.current = requestAnimationFrame(step);
    },
    [apply, clamp, maybeUpgrade],
  );

  const zoomAnimated = useCallback(
    (px: number, py: number, k: number) => {
      const v = view.current;
      const s = Math.min(maxScale(), Math.max(1, v.s * k));
      const r = s / v.s;
      animateTo({ s, x: px - (px - v.x) * r, y: py - (py - v.y) * r });
    },
    [animateTo, maxScale],
  );

  const reset = useCallback(() => animateTo({ s: 1, x: 0, y: 0 }), [animateTo]);

  /* ── progressive loading: screen → publicationjpg ── */
  useEffect(() => {
    let cancelled = false;
    const pre = new Image();
    const mid = detailRendition(width, height);
    pre.src = esaImage(id, mid);
    pre
      .decode()
      .then(() => {
        if (cancelled || largeRequested.current) return;
        if (!natural.current) {
          natural.current = { w: pre.naturalWidth, h: pre.naturalHeight };
          setDims(natural.current);
        }
        setSrc(pre.src);
        setTier(mid === "large" ? "large" : "pub");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, width, height]);

  /* ── first paint & resize ── */
  useEffect(() => {
    const c = box.current;
    if (!c) return;
    const ro = new ResizeObserver(() => layout(true));
    ro.observe(c);
    return () => ro.disconnect();
  }, [layout]);

  const onImgLoad = () => {
    const el = img.current;
    if (!el) return;
    if (!natural.current) {
      natural.current = { w: el.naturalWidth, h: el.naturalHeight };
      setDims(natural.current);
    }
    if (!ready) {
      layout(false);
      setReady(true);
    }
  };

  /* ── wheel (non-passive so we can stop page scroll) ── */
  useEffect(() => {
    const c = box.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(anim.current);
      setTouched(true);
      const r = c.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * 0.0016));
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ── pointers: drag, pinch, double-tap ── */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const moved = useRef(0);

  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-ui]")) return;
    cancelAnimationFrame(anim.current);
    box.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    moved.current = 0;
    setTouched(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      const v = view.current;
      moved.current += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
      view.current = clamp({ s: v.s, x: v.x + (p.x - prev.x), y: v.y + (p.y - prev.y) });
      apply();
    } else if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const v = view.current;
      view.current = clamp({ s: v.s, x: v.x + (mx - pinch.current.mx), y: v.y + (my - pinch.current.my) });
      zoomAt(mx, my, dist / pinch.current.dist);
      pinch.current = { dist, mx, my };
      moved.current += 10;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const had = pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!had) return;
    // double-tap (touch / pen) → zoom in, or out if already deep
    if (e.pointerType !== "mouse" && moved.current < 8) {
      const p = local(e);
      const now = performance.now();
      if (lastTap.current && now - lastTap.current.t < 320 && Math.hypot(p.x - lastTap.current.x, p.y - lastTap.current.y) < 30) {
        if (view.current.s > maxScale() * 0.6) reset();
        else zoomAnimated(p.x, p.y, 2.5);
        lastTap.current = null;
      } else lastTap.current = { t: now, ...p };
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-ui]")) return;
    const p = local(e);
    if (view.current.s > maxScale() * 0.6) reset();
    else zoomAnimated(p.x, p.y, e.shiftKey ? 0.4 : 2.5);
  };

  const center = () => ({ x: base.current.cw / 2, y: base.current.ch / 2 });

  const onKey = (e: React.KeyboardEvent) => {
    const c = center();
    if (e.key === "+" || e.key === "=") zoomAnimated(c.x, c.y, 1.8);
    else if (e.key === "-" || e.key === "_") zoomAnimated(c.x, c.y, 1 / 1.8);
    else if (e.key === "0") reset();
    else if (e.key.startsWith("Arrow")) {
      const d = 80;
      const v = view.current;
      const dx = e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0;
      const dy = e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0;
      animateTo({ s: v.s, x: v.x + dx, y: v.y + dy });
    } else return;
    e.preventDefault();
  };

  /* ── fullscreen ── */
  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else box.current?.requestFullscreen?.();
  };

  const zoomInBtn = () => {
    const c = center();
    zoomAnimated(c.x, c.y, 1.8);
  };
  const zoomOutBtn = () => {
    const c = center();
    zoomAnimated(c.x, c.y, 1 / 1.8);
  };

  const n = dims;

  return (
    <div
      ref={box}
      tabIndex={0}
      role="application"
      aria-label={`Zoomable image: ${alt}. Use plus and minus to zoom, arrow keys to pan, 0 to reset.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKey}
      className={clsx(
        "group/viewer relative w-full touch-none select-none overflow-hidden bg-black outline-none",
        "cursor-grab active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-gold/60",
        fullscreen ? "h-full" : width && height ? "" : "h-[min(78svh,920px)] min-h-[420px]",
      )}
      style={
        !fullscreen && width && height
          ? // wide images on narrow screens get a shorter stage instead of heavy letterboxing
            { height: `min(78svh, 920px, max(380px, calc(100vw / ${(width / height).toFixed(3)})))` }
          : undefined
      }
    >
      <img
        ref={img}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={onImgLoad}
        decoding="async"
        className={clsx(
          "absolute left-0 top-0 max-w-none origin-top-left will-change-transform transition-opacity duration-700",
          ready ? "opacity-100" : "opacity-0",
        )}
      />

      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-mono text-[10px] tracking-[0.3em] text-muted uppercase animate-pulse-slow">Loading image</span>
        </div>
      )}

      {/* hint */}
      <div
        className={clsx(
          "pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 whitespace-nowrap rounded-full sm:top-5 border border-line bg-ink/60 px-4 py-1.5 font-mono text-[10px] tracking-[0.18em] text-fg-2 uppercase backdrop-blur transition-opacity duration-700",
          touched || !ready ? "opacity-0" : "opacity-100",
        )}
      >
        <span className="hidden sm:inline">Drag · scroll or pinch to zoom · double-click</span>
        <span className="sm:hidden">Drag · pinch · double-tap</span>
      </div>

      {/* top-right status */}
      <div data-ui className="absolute right-4 top-4 flex items-center gap-2">
        {loadingLarge && (
          <span className="rounded-full border border-gold/30 bg-ink/70 px-3 py-1 font-mono text-[10px] tracking-wider text-gold backdrop-blur animate-pulse-slow">
            Loading full resolution{n ? ` · ${n.w.toLocaleString("en-US")} × ${n.h.toLocaleString("en-US")} px` : ""}
          </span>
        )}
        <span className="rounded-full border border-line bg-ink/70 px-3 py-1 font-mono text-[10px] tracking-wider text-fg-2 backdrop-blur">
          <span ref={zoomLabel}>×1.0</span>
          <span className="ml-2 text-dim">{tier === "large" ? "FULL RES" : tier === "pub" ? "4K" : "PREVIEW"}</span>
        </span>
      </div>

      {/* controls */}
      <div data-ui className="absolute bottom-4 right-4 flex flex-col overflow-hidden rounded-sm border border-line bg-ink/70 backdrop-blur">
        <CtrlButton label="Zoom in" onClick={zoomInBtn}>
          <Plus className="h-4 w-4" />
        </CtrlButton>
        <CtrlButton label="Zoom out" onClick={zoomOutBtn}>
          <Minus className="h-4 w-4" />
        </CtrlButton>
        <CtrlButton label="Reset view" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
        </CtrlButton>
        <CtrlButton label={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFs}>
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </CtrlButton>
      </div>

      {/* scale bar */}
      {fov && (
        <div data-ui className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-center md:left-auto md:right-20 md:translate-x-0">
          <div className="flex items-baseline justify-center gap-2 font-mono text-[10px] tracking-wider text-fg">
            <span ref={barLabel} />
            <span ref={barPhys} className="text-gold" />
          </div>
          <div ref={barEl} className="mx-auto mt-1 h-[5px] border-x border-b border-fg/80" />
        </div>
      )}

      {/* minimap */}
      <div
        ref={mini}
        data-ui
        className="pointer-events-none absolute bottom-4 left-4 hidden overflow-hidden rounded-sm border border-line-2 bg-black opacity-0 shadow-2xl transition-opacity duration-300 sm:block"
        style={
          n && n.h > n.w
            ? { height: 144, width: (144 * n.w) / n.h }
            : { width: 144, height: n ? (144 * n.h) / n.w : 90 }
        }
      >
        <img src={esaImage(id, "thumb700x")} alt="" className="h-full w-full object-cover opacity-70" draggable={false} />
        <div ref={miniRect} className="absolute border border-gold shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" />
      </div>
    </div>
  );
}

function CtrlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center border-b border-line text-fg-2 transition last:border-b-0 hover:bg-white/5 hover:text-fg"
    >
      {children}
    </button>
  );
}
