"use client";

import type { ReactNode } from "react";

/** Link that re-targets the sky explorer on the same page (falls back to a deep link). */
export function SkyFocusLink({ ra, dec, fov = 4, className, children }: { ra: number; dec: number; fov?: number; className?: string; children: ReactNode }) {
  const href = `/sky?ra=${ra.toFixed(3)}&dec=${dec.toFixed(3)}&fov=${fov}`;
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (window.location.pathname !== "/sky") return;
        e.preventDefault();
        window.history.replaceState(null, "", href);
        window.scrollTo({ top: 0, behavior: "smooth" });
        window.dispatchEvent(new CustomEvent("sky:focus", { detail: { ra, dec, fov } }));
      }}
    >
      {children}
    </a>
  );
}
