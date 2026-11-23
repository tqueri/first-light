"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight 2D-canvas starfield: three parallax depth layers that drift with
 * the pointer and twinkle. Colours follow real stellar temperatures (blue-white
 * to orange) — not decorative neon.
 */
export function Starfield({ density = 1, className }: { density?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const palette = ["#9bb0ff", "#aabfff", "#cad7ff", "#f8f7ff", "#fff4ea", "#ffd2a1", "#ffcc6f"];
    type Star = { x: number; y: number; r: number; d: number; c: string; t: number; s: number };
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };

    const seed = () => {
      const n = Math.floor(((w * h) / 2600) * density);
      stars = Array.from({ length: n }, () => {
        const d = Math.random() ** 2.2; // most stars far away
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.25 + d * 1.25,
          d,
          c: palette[Math.floor(Math.random() ** 1.6 * palette.length)],
          t: Math.random() * Math.PI * 2,
          s: 0.4 + Math.random() * 1.6,
        };
      });
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      cur.x += (target.x - cur.x) * 0.04;
      cur.y += (target.y - cur.y) * 0.04;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.t += dt * s.s;
        const tw = reduce ? 1 : 0.65 + 0.35 * Math.sin(s.t);
        const px = s.x - cur.x * s.d * 22;
        const py = s.y - cur.y * s.d * 22;
        ctx.globalAlpha = (0.35 + s.d * 0.65) * tw;
        ctx.fillStyle = s.c;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.r > 1.2) {
          ctx.globalAlpha *= 0.18;
          ctx.beginPath();
          ctx.arc(px, py, s.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, [density]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
