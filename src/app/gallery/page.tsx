import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { FeaturedComparisons, type FeaturedPair } from "@/components/gallery/featured-comparisons";
import { GalleryGrid, type GridItem } from "@/components/gallery/gallery-grid";
import { cleanTitle, detailRendition, instrumentsOf } from "@/components/gallery/utils";
import { getGallery } from "@/lib/data";
import { getImagesByIds } from "@/lib/data-gallery";
import { esaImage } from "@/lib/images";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "The flagship James Webb Space Telescope images at full resolution, with the real filter-to-colour mapping behind each composite and the raw archive frames they were built from.",
};

/** Pairs ESA published at identical dimensions and framing (alignment verified). */
const PAIRS: {
  key: string;
  title: string;
  left: [string, string, string];
  right: [string, string, string];
  note: string;
}[] = [
  {
    key: "crab",
    title: "Crab Nebula",
    left: ["weic2326d", "Hubble", "2005 · visible light"],
    right: ["weic2326e", "Webb", "2023 · NIRCam + MIRI"],
    note: "The wreck of a star whose explosion was recorded by astronomers in 1054 CE. Hubble sees the hot, ionised filaments in visible light. Webb's infrared view adds the warm dust threaded through them and the smoky synchrotron glow of electrons spiralling in the pulsar's magnetic field.",
  },
  {
    key: "ngc346",
    title: "NGC 346",
    left: ["weic2301c", "Hubble", "visible light"],
    right: ["weic2301d", "Webb", "NIRCam"],
    note: "A young star cluster in the Small Magellanic Cloud, a galaxy poor in heavy elements, much like galaxies in the early universe. Webb's near-infrared view picks out dusty filaments and embedded young stars that are faint or invisible in visible light.",
  },
  {
    key: "orion-bar",
    title: "Orion Bar",
    left: ["weic2315d", "Hubble", "visible light"],
    right: ["weic2315b", "Webb", "NIRCam"],
    note: "A wall of gas and dust in the Orion Nebula, 1,400 light-years away, sculpted by ultraviolet light from the massive Trapezium stars. In the infrared, the layered structure of the illuminated edge becomes visible.",
  },
  {
    key: "cas-a",
    title: "Cassiopeia A",
    left: ["weic2330e", "NIRCam", "near-infrared"],
    right: ["weic2330f", "MIRI", "mid-infrared"],
    note: "The debris of a star that exploded about 11,000 light-years away; its light reached Earth roughly 340 years ago. Near- and mid-infrared trace different material: compact knots of stellar ejecta on one side, warm dust and gas on the other.",
  },
  {
    key: "wr140",
    title: "WR 140 · 14 months apart",
    left: ["weic2501e", "July 2022", "MIRI"],
    right: ["weic2501d", "Sept 2023", "MIRI"],
    note: "Two massive stars on an eight-year orbit. Each time they swing close, their colliding winds forge a shell of carbon-rich dust. Slide across: in fourteen months, the shells have measurably moved outward. This is astronomy you can watch happen.",
  },
  {
    key: "ngc5068",
    title: "NGC 5068",
    left: ["potm2305d", "NIRCam", "stars"],
    right: ["potm2305e", "MIRI", "dust & gas"],
    note: "A barred spiral galaxy 17 million light-years away, from the PHANGS survey. NIRCam is dominated by starlight. MIRI shows the glowing dust and gas lanes where the next generations of stars will form.",
  },
  {
    key: "cen-a",
    title: "Centaurus A",
    left: ["weic2615e", "NIRCam", "near-infrared"],
    right: ["weic2615d", "MIRI + NIRCam", "adds mid-infrared"],
    note: "A giant elliptical galaxy with an active supermassive black hole, about 11 million light-years away. Its warped lane of dust is widely interpreted as debris from a past merger. Adding mid-infrared light brings that dust to the fore.",
  },
];

export default async function GalleryPage() {
  const [gallery, pairImages] = await Promise.all([
    getGallery(),
    getImagesByIds(PAIRS.flatMap((p) => [p.left[0], p.right[0]])),
  ]);

  // ESA sometimes lists the same rendition under two ids (e.g. the First Deep Field):
  // identical pixel size + identical filter table ⇒ keep the better-ranked one.
  const seen = new Set<string>();
  const unique = gallery.filter((g) => {
    const k = `${g.width}x${g.height}|${JSON.stringify(g.filters)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const items: GridItem[] = unique.map((g) => {
    const { title, tags } = cleanTitle(g.title);
    const inst = instrumentsOf(g);
    for (const t of tags) if (!inst.includes(t) && ["NIRCam", "MIRI", "NIRSpec", "NIRISS", "Hubble", "ALMA"].includes(t)) inst.push(t);
    return {
      id: g.id,
      rank: g.rank,
      title,
      tags,
      instruments: inst,
      categories: g.categories,
      distance: g.distance,
      aspect: g.width && g.height ? g.width / g.height : 1.4,
      released: g.release_date,
    };
  });

  const byId = new Map(pairImages.map((p) => [p.id, p]));
  const pairs: FeaturedPair[] = PAIRS.flatMap((p) => {
    const l = byId.get(p.left[0]);
    const r = byId.get(p.right[0]);
    if (!l || !r || !l.width || !l.height) return [];
    return [
      {
        key: p.key,
        title: p.title,
        note: p.note,
        aspect: l.width / l.height,
        left: { id: l.id, src: esaImage(l.id, detailRendition(l.width, l.height)), label: p.left[1], sub: p.left[2], credit: l.credit },
        right: { id: r.id, src: esaImage(r.id, detailRendition(r.width, r.height)), label: p.right[1], sub: p.right[2], credit: r.credit },
      },
    ];
  });

  return (
    <div className="mx-auto max-w-[1600px] px-5 pb-32 pt-32 md:px-8 md:pt-40">
      <header className="grid gap-10 md:grid-cols-12">
        <Reveal className="min-w-0 md:col-span-7">
          <p className="eyebrow">Gallery · {items.length} images · ESA/Webb</p>
          <h1 className="display mt-6 text-[clamp(2.8rem,7vw,7rem)]">
            The flagship <span className="text-gradient-gold">images</span>.
          </h1>
        </Reveal>
        <Reveal delay={0.15} className="min-w-0 md:col-span-5 md:self-end">
          <p className="text-[16px] leading-relaxed text-fg-2">
            Webb&apos;s detectors don&apos;t see colour. Every image here is a composite of grayscale exposures taken
            through different filters, all at infrared wavelengths beyond human vision. Each filter is assigned a visible
            colour, shortest wavelength to blue and longest to red. Open any image to see exactly which filters were used,
            zoom into the full-resolution original, and find the raw frames in the public archive.
          </p>
          <Link href="/lab" className="link-underline mt-5 inline-block font-mono text-[11px] tracking-[0.2em] text-gold uppercase">
            Build one yourself in the Lab →
          </Link>
        </Reveal>
      </header>

      {pairs.length > 0 && (
        <section className="mt-24 border-t border-line pt-12">
          <Reveal>
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Same sky, different light</p>
                <h2 className="display mt-4 text-[clamp(1.8rem,3.4vw,3rem)]">Drag to compare.</h2>
              </div>
              <p className="max-w-md text-sm text-muted">
                Hubble against Webb, near- against mid-infrared, and one object photographed fourteen months apart. Each
                pair is the same field of view at the same scale.
              </p>
            </div>
          </Reveal>
          <FeaturedComparisons pairs={pairs} />
        </section>
      )}

      <section className="mt-28">
        <GalleryGrid items={items} />
      </section>
    </div>
  );
}
