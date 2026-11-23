"use client";

import clsx from "clsx";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { esaImage } from "@/lib/images";
import { INSTRUMENT_COLOR, WEBB_INSTRUMENTS } from "./utils";

export type GridItem = {
  id: string;
  rank: number;
  title: string;
  tags: string[];
  instruments: string[];
  categories: string[];
  distance: string | null;
  aspect: number;
  released: string | null;
};

const CATEGORY_ORDER = [
  "First Images",
  "Nebulae",
  "Galaxies",
  "Stars",
  "Solar System",
  "Quasars and Black Holes",
  "Exoplanets",
  "Anniversary",
  "Picture of the Month",
];

const PAGE = 48;

export function GalleryGrid({ items }: { items: GridItem[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [instrument, setInstrument] = useState<string | null>(null);
  const [sort, setSort] = useState<"curated" | "newest">("curated");
  const [limit, setLimit] = useState(PAGE);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) for (const c of it.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return CATEGORY_ORDER.filter((c) => counts.has(c)).map((c) => ({ c, n: counts.get(c)! }));
  }, [items]);

  const instruments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) for (const i of it.instruments) counts.set(i, (counts.get(i) ?? 0) + 1);
    return WEBB_INSTRUMENTS.filter((i) => counts.has(i)).map((i) => ({ i, n: counts.get(i)! }));
  }, [items]);

  const shown = useMemo(() => {
    let list = items.filter(
      (it) => (!category || it.categories.includes(category)) && (!instrument || it.instruments.includes(instrument)),
    );
    if (sort === "newest") list = [...list].sort((a, b) => (b.released ?? "").localeCompare(a.released ?? ""));
    return list;
  }, [items, category, instrument, sort]);

  const chip = (active: boolean) =>
    clsx(
      "shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors",
      active ? "border-fg bg-fg text-ink" : "border-line text-fg-2 hover:border-line-2 hover:text-fg",
    );

  return (
    <div>
      <div className="sticky top-16 z-30 -mx-5 border-b border-line bg-ink/80 px-5 py-4 backdrop-blur-xl md:-mx-8 md:px-8">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] lg:flex-wrap [&::-webkit-scrollbar]:hidden">
            <button type="button" className={chip(category === null)} onClick={() => { setCategory(null); setLimit(PAGE); }}>
              All
            </button>
            {categories.map(({ c, n }) => (
              <button
                type="button"
                key={c}
                className={chip(category === c)}
                onClick={() => { setCategory(category === c ? null : c); setLimit(PAGE); }}
              >
                {c} <span className="ml-1 font-mono text-[10px] opacity-60">{n}</span>
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {instruments.map(({ i }) => (
              <button
                type="button"
                key={i}
                onClick={() => { setInstrument(instrument === i ? null : i); setLimit(PAGE); }}
                className={clsx(
                  "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] tracking-wider transition",
                  instrument === i ? "border-fg/70 text-fg" : "border-line text-muted hover:text-fg",
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: INSTRUMENT_COLOR[i] }} />
                {i}
              </button>
            ))}
            <span className="mx-1 h-5 w-px shrink-0 bg-line" />
            <button
              type="button"
              onClick={() => setSort(sort === "curated" ? "newest" : "curated")}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] tracking-wider text-muted transition hover:text-fg"
            >
              {sort === "curated" ? "Curated order" : "Newest first"}
            </button>
          </div>
        </div>
      </div>

      <p className="mt-6 font-mono text-[10.5px] tracking-[0.2em] text-muted uppercase">
        {shown.length} image{shown.length === 1 ? "" : "s"}
        {category ? ` · ${category}` : ""}
        {instrument ? ` · ${instrument}` : ""}
      </p>

      <div className="mt-6 columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
        {shown.slice(0, limit).map((it, i) => (
          <Link
            key={it.id}
            href={`/gallery/${it.id}`}
            className="group relative mb-4 block break-inside-avoid overflow-hidden rounded-sm border border-line bg-ink-2"
          >
            <div className="relative" style={{ aspectRatio: `${Math.min(2.2, Math.max(0.7, it.aspect))}` }}>
              <Image
                src={esaImage(it.id, "thumb700x")}
                alt={it.title}
                fill
                sizes="(min-width: 1536px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                quality={75}
                priority={i < 4}
                className="object-cover transition duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.045]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/10 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="absolute inset-0 ring-1 ring-inset ring-transparent transition duration-500 group-hover:ring-gold/40" />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <div className="mb-2 flex flex-wrap gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
                {it.instruments.map((ins) => (
                  <span key={ins} className="flex items-center gap-1.5 rounded-full bg-ink/60 px-2 py-0.5 font-mono text-[9.5px] tracking-wider text-fg-2 backdrop-blur">
                    <span className="h-1 w-1 rounded-full" style={{ background: INSTRUMENT_COLOR[ins] ?? "#9aa0a6" }} />
                    {ins}
                  </span>
                ))}
              </div>
              <h3 className="text-[17px] leading-snug font-light tracking-tight text-fg">{it.title}</h3>
              {it.distance && (
                <p className="mt-1 font-mono text-[10.5px] text-muted transition-colors group-hover:text-gold">{it.distance}</p>
              )}
            </div>
          </Link>
        ))}
      </div>

      {shown.length > limit && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="rounded-full border border-line-2 px-6 py-3 text-sm text-fg-2 transition hover:border-fg hover:text-fg"
          >
            Show more · {shown.length - limit} remaining
          </button>
        </div>
      )}
      {shown.length === 0 && <p className="py-24 text-center text-muted">No images match these filters.</p>}
    </div>
  );
}
