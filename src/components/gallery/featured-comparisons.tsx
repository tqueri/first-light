"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { CompareSlider, type CompareSide } from "./compare-slider";

export type FeaturedPair = {
  key: string;
  title: string;
  note: string;
  aspect: number;
  left: CompareSide & { id: string; credit: string | null };
  right: CompareSide & { id: string; credit: string | null };
};

export function FeaturedComparisons({ pairs }: { pairs: FeaturedPair[] }) {
  const [active, setActive] = useState(0);
  const pair = pairs[active];
  if (!pair) return null;
  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-4">
        <ol className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
          {pairs.map((p, i) => (
            <li key={p.key} className="shrink-0 lg:border-t lg:border-line lg:last:border-b">
              <button
                type="button"
                onClick={() => setActive(i)}
                className={clsx(
                  "group flex w-full items-baseline gap-4 rounded-full border px-4 py-2 text-left transition lg:rounded-none lg:border-0 lg:px-0 lg:py-4",
                  i === active ? "border-fg text-fg" : "border-line text-muted hover:text-fg",
                )}
              >
                <span className={clsx("hidden font-mono text-[10px] lg:inline", i === active ? "text-gold" : "text-dim")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="whitespace-nowrap text-sm lg:text-lg lg:font-light lg:tracking-tight">{p.title}</span>
                <span className="ml-auto hidden font-mono text-[10px] tracking-wider text-dim uppercase lg:inline">
                  {p.left.label} / {p.right.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[15px] leading-relaxed text-fg-2">{pair.note}</p>
        <div className="mt-6 flex gap-4 font-mono text-[11px] tracking-wider uppercase">
          <Link href={`/gallery/${pair.left.id}`} className="link-underline text-fg-2 hover:text-fg">
            {pair.left.label} image →
          </Link>
          <Link href={`/gallery/${pair.right.id}`} className="link-underline text-fg-2 hover:text-fg">
            {pair.right.label} image →
          </Link>
        </div>
      </div>
      <div className="min-w-0 lg:col-span-8">
        <CompareSlider key={pair.key} left={pair.left} right={pair.right} aspect={pair.aspect} alt={pair.title} className="rounded-sm border border-line" />
        <p className="mt-3 text-[11.5px] leading-relaxed text-dim">
          Left: {pair.left.credit ?? "ESA/Webb"}. Right: {pair.right.credit ?? "ESA/Webb"}. Both renditions were published by
          ESA at identical pixel dimensions and framing, so the wipe compares the same patch of sky.
        </p>
      </div>
    </div>
  );
}
