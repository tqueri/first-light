"use client";

import clsx from "clsx";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";

export type CompareSide = { src: string; label: string; sub?: string };

/**
 * Before/after wipe for two *registered* renditions (same pixel grid).
 * Only feed it pairs that ESA published at identical dimensions and framing.
 */
export function CompareSlider({
  left,
  right,
  aspect,
  alt,
  className,
}: {
  left: CompareSide;
  right: CompareSide;
  aspect: number; // width / height
  alt: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0.5);
  const [dragging, setDragging] = useState(false);

  const setFromClient = useCallback((clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  }, []);

  return (
    <div
      ref={box}
      className={clsx(
        "relative w-full touch-pan-y select-none overflow-hidden bg-[radial-gradient(ellipse_at_center,#0c0e15,#000)]",
        className,
      )}
      style={{ aspectRatio: `${Math.min(2.4, Math.max(0.62, aspect))}` }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        setFromClient(e.clientX);
      }}
      onPointerMove={(e) => dragging && setFromClient(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <Image src={left.src} alt={`${alt}: ${left.label}`} fill sizes="(min-width: 1280px) 1200px, 100vw" quality={85} className="object-contain" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos * 100}%)` }}>
        <Image src={right.src} alt={`${alt}: ${right.label}`} fill sizes="(min-width: 1280px) 1200px, 100vw" quality={85} className="object-contain" draggable={false} />
      </div>

      {/* labels */}
      <div className={clsx("pointer-events-none absolute left-4 top-4 transition-opacity", pos < 0.12 ? "opacity-0" : "opacity-100")}>
        <p className="rounded-full border border-line bg-ink/70 px-3 py-1 font-mono text-[10px] tracking-[0.16em] text-fg uppercase backdrop-blur">
          {left.label}
        </p>
        {left.sub && <p className="mt-1.5 pl-3 font-mono text-[10px] text-fg-2">{left.sub}</p>}
      </div>
      <div className={clsx("pointer-events-none absolute right-4 top-4 text-right transition-opacity", pos > 0.88 ? "opacity-0" : "opacity-100")}>
        <p className="rounded-full border border-gold/40 bg-ink/70 px-3 py-1 font-mono text-[10px] tracking-[0.16em] text-gold uppercase backdrop-blur">
          {right.label}
        </p>
        {right.sub && <p className="mt-1.5 pr-3 font-mono text-[10px] text-fg-2">{right.sub}</p>}
      </div>

      {/* handle */}
      <div className="absolute inset-y-0 w-px bg-fg/90 shadow-[0_0_18px_rgba(242,196,109,0.7)]" style={{ left: `${pos * 100}%` }}>
        <button
          type="button"
          role="slider"
          aria-label="Comparison position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos * 100)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 0.05));
            else if (e.key === "ArrowRight") setPos((p) => Math.min(1, p + 0.05));
            else return;
            e.preventDefault();
          }}
          className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border border-fg/80 bg-ink/70 backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-fg" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 6l-5 6 5 6M15 6l5 6-5 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
