import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MirrorLogo } from "@/components/mirror-logo";
import { CountUp, Reveal } from "@/components/reveal";
import { Starfield } from "@/components/starfield";
import { AGE_NOW_GYR, OBSERVABLE_RADIUS_GLY, lookbackGyr, RECORD_GALAXIES } from "@/lib/cosmology";
import { getLatestImages, getStats, instrumentOf } from "@/lib/data";
import { getCoverageFinding, getSecrecyFinding, getSunFinding } from "@/lib/findings";
import { esaImage, mastFile } from "@/lib/images";
import { fmtInt, fmtMjd, prettyTarget } from "@/lib/format";
import { NAV } from "@/lib/nav";

const CARD_IMAGES: Record<string, { src: string; position?: string; raw?: boolean }> = {
  "/scale": { src: esaImage("weic2216b", "screen"), position: "50% 30%" },
  "/sky": { src: "/images/sky-card.jpg", position: "50% 45%" },
  "/findings": { src: "/images/findings-card.jpg", position: "50% 50%" },
  "/gallery": { src: esaImage("weic2205a", "screen"), position: "60% 50%" },
  "/lab": { src: mastFile("mast:JWST/product/jw02731-o002_t017_miri_f1800w_i2d.jpg"), position: "55% 40%", raw: true },
  "/deep-time": { src: esaImage("udf-a", "screen"), position: "30% 50%" },
  "/worlds": { src: esaImage("potm2501a", "screen"), position: "50% 50%" },
  "/archive": { src: mastFile("mast:JWST/product/jw02731-o001_t017_nircam_clear-f090w_i2d.jpg"), position: "40% 50%", raw: true },
};

export default async function Home() {
  const [stats, latest, sun, secrecy, coverage] = await Promise.all([
    getStats(),
    getLatestImages(10),
    getSunFinding(),
    getSecrecyFinding(),
    getCoverageFinding(),
  ]);
  const record = RECORD_GALAXIES[0];
  const lookback = lookbackGyr(record.z);

  return (
    <>
      {/* ───────────── HERO ───────────── */}
      <section className="relative flex min-h-[100svh] flex-col overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src={esaImage("weic2209a", "publicationjpg")}
            alt="Webb's First Deep Field: thousands of galaxies behind the galaxy cluster SMACS 0723, some stretched into arcs by gravitational lensing."
            fill
            priority
            quality={85}
            sizes="100vw"
            className="animate-drift object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_60%,transparent_0%,rgba(3,4,7,0.55)_55%,rgba(3,4,7,0.95)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink via-ink/70 to-transparent" />
          <Starfield className="absolute inset-0 h-full w-full mix-blend-screen" density={0.35} />
        </div>

        <div className="relative mx-auto flex w-full max-w-[1600px] flex-1 flex-col justify-end px-5 pb-14 pt-32 md:px-8 md:pb-20">
          <p className="eyebrow animate-fade-up">James Webb Space Telescope · Public data explorer</p>
          <h1 className="display mt-6 max-w-[15ch] animate-fade-up text-[clamp(3rem,8.4vw,9.5rem)] [animation-delay:150ms]">
            Every point of light is a <span className="text-gradient-gold">galaxy</span>.
          </h1>
          <div className="mt-10 grid gap-10 md:grid-cols-12">
            <p className="max-w-xl animate-fade-up text-[17px] leading-relaxed text-fg-2 [animation-delay:350ms] md:col-span-6">
              This is Webb&apos;s First Deep Field: a patch of sky the size of a grain of sand held at arm&apos;s length.
              Light from some of its galaxies has travelled for more than 13 billion years. The few objects with
              six-pointed spikes are foreground stars in our own Milky Way. The spikes are a signature of Webb&apos;s
              hexagonal mirror.
            </p>
            <div className="flex animate-fade-up flex-wrap items-end gap-3 [animation-delay:500ms] md:col-span-6 md:justify-end">
              <Link
                href="/scale"
                className="group inline-flex items-center gap-3 rounded-full bg-fg px-6 py-3.5 text-sm font-medium text-ink transition hover:bg-gold"
              >
                Begin the journey outward
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/sky"
                className="inline-flex items-center gap-3 rounded-full border border-line-2 px-6 py-3.5 text-sm text-fg backdrop-blur transition hover:border-fg"
              >
                Open the sky map
              </Link>
            </div>
          </div>

          {/* live archive HUD */}
          <div className="mt-14 grid animate-fade-up grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line [animation-delay:700ms] md:grid-cols-4">
            {[
              { k: "Public science products", v: fmtInt(stats.products) },
              { k: "Observing programmes", v: fmtInt(stats.programs) },
              { k: "Sky cells observed", v: fmtInt(stats.cells) },
              { k: "Latest public release", v: fmtMjd(stats.lastReleaseMjd) },
            ].map((s) => (
              <div key={s.k} className="bg-ink/80 px-5 py-4 backdrop-blur-md">
                <p className="eyebrow !text-[9.5px]">{s.k}</p>
                <p className="mt-1.5 font-mono text-lg tabular-nums text-fg md:text-xl">{s.v}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono text-[10px] tracking-[0.16em] text-dim uppercase">
            <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse-slow rounded-full bg-gold align-middle" />
            Live from MAST · calibrated (level-3) public data · refreshed daily
          </p>
        </div>
      </section>

      {/* ───────────── PROLOGUE: the numbers that break intuition ───────────── */}
      <section className="relative border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-28 md:px-8 md:py-40">
          <Reveal>
            <p className="eyebrow">Prologue</p>
            <h2 className="display mt-6 max-w-[22ch] text-[clamp(2.2rem,5vw,5rem)]">
              The universe is <span className="text-muted">{AGE_NOW_GYR.toFixed(2)}</span> billion years old. Webb
              can see light from <span className="text-gradient-gold">{(AGE_NOW_GYR - lookback).toFixed(2)}</span>{" "}
              billion years after it began.
            </h2>
          </Reveal>
          <div className="mt-20 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
            {[
              {
                n: lookback,
                d: 2,
                unit: "billion years",
                label: "Light-travel time from MoM-z14",
                body: `The most distant galaxy confirmed so far, at redshift ${record.z}. Its light left when the cosmos was ${((AGE_NOW_GYR - lookback) * 1000).toFixed(0)} million years old: about 2% of its current age.`,
              },
              {
                n: OBSERVABLE_RADIUS_GLY,
                d: 1,
                unit: "billion light-years",
                label: "Radius of the observable universe",
                body: "Larger than 13.8 billion light-years because space kept expanding while the light was in transit. The sources of the oldest light are now far beyond where they were.",
              },
              {
                n: 6.5,
                d: 1,
                unit: "metres",
                label: "Webb's primary mirror",
                body: "18 gold-coated beryllium segments, 25.4 m² of collecting area: about 6× Hubble's. It unfolded in space and was aligned to a fraction of a light-wave.",
              },
            ].map((f, i) => (
              <Reveal key={f.label} delay={i * 0.12} className="bg-ink p-8 md:p-10">
                <p className="eyebrow">{f.label}</p>
                <p className="mt-8 flex items-baseline gap-3">
                  <CountUp value={f.n} decimals={f.d} className="display text-[clamp(3rem,6vw,5.5rem)] tabular-nums" />
                  <span className="text-sm text-muted">{f.unit}</span>
                </p>
                <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-fg-2">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── WAYS IN ───────────── */}
      <section className="relative border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-28 md:px-8 md:py-36">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <Reveal>
              <p className="eyebrow">{NAV.length} ways in</p>
              <h2 className="display mt-6 max-w-[18ch] text-[clamp(2.2rem,4.6vw,4.5rem)]">
                Built on the raw archive, not on press releases.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-md text-[15px] leading-relaxed text-muted">
                Each experience below reads real data: observation metadata from NASA&apos;s MAST archive, the
                official colour composites from ESA/Webb, atmospheric spectra from the NASA Exoplanet Archive, and
                cosmology computed live from Planck 2018 parameters.
              </p>
            </Reveal>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-6">
            {NAV.map((item, i) => {
              const img = CARD_IMAGES[item.href];
              const span =
                i === 0
                  ? "md:col-span-4 md:row-span-2 min-h-[420px] md:min-h-[560px]"
                  : i < 3
                    ? "md:col-span-2 min-h-[272px]"
                    : i < 5
                      ? "md:col-span-3 min-h-[300px]"
                      : "md:col-span-2 min-h-[280px]";
              return (
                <Reveal key={item.href} delay={(i % 3) * 0.08} className={span}>
                  <Link
                    href={item.href}
                    className="group relative flex h-full flex-col justify-end overflow-hidden rounded-sm border border-line bg-ink-2 p-7"
                  >
                    <Image
                      src={img.src}
                      alt=""
                      fill
                      sizes="(min-width: 768px) 60vw, 100vw"
                      quality={75}
                      className={
                        "object-cover opacity-60 transition duration-[1.6s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06] group-hover:opacity-90 " +
                        (img.raw ? "contrast-125 grayscale" : "")
                      }
                      style={{ objectPosition: img.position }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
                    {img.raw && (
                      <span className="absolute left-7 top-7 rounded-full border border-line-2 bg-ink/60 px-2.5 py-1 font-mono text-[9.5px] tracking-[0.2em] text-fg-2 uppercase backdrop-blur">
                        Raw single-filter frame · MAST
                      </span>
                    )}
                    <div className="relative">
                      <p className="font-mono text-[11px] text-gold">{String(i + 1).padStart(2, "0")}</p>
                      <h3 className={"mt-2 font-light tracking-tight " + (i === 0 ? "text-5xl md:text-6xl" : "text-3xl")}>
                        {item.label}
                      </h3>
                      <p className="mt-2 max-w-sm text-sm text-fg-2">{item.blurb}</p>
                    </div>
                    <ArrowUpRight className="absolute right-6 top-6 h-5 w-5 text-fg-2 opacity-0 transition group-hover:opacity-100" />
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────────── FINDINGS TEASER ───────────── */}
      <section className="relative border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-28 md:px-8 md:py-36">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <Reveal>
              <p className="eyebrow">Only on First Light</p>
              <h2 className="display mt-6 max-w-[20ch] text-[clamp(2.2rem,4.6vw,4.5rem)]">
                What you only see when you read the whole archive at once.
              </h2>
            </Reveal>
            <Link href="/findings" className="link-underline font-mono text-xs tracking-[0.2em] text-fg-2 uppercase">
              All findings →
            </Link>
          </div>
          <div className="mt-16 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
            {[
              {
                href: "/findings#sun",
                stat: `${((sun.inside / sun.products) * 100).toFixed(2)}%`,
                title: "The Sun's shadow is written into Webb's schedule",
                body: `of ${fmtInt(sun.products)} products were taken 85°–135° from the Sun. Plot them over time and the Sun's yearly path appears.`,
              },
              {
                href: "/findings#secrecy",
                stat: `${Math.round((secrecy.immediate / secrecy.observations) * 100)}% / ${Math.round((secrecy.oneYear / secrecy.observations) * 100)}%`,
                title: "Instantly public, or exactly one year",
                body: "Webb data almost never sits in between. Who you are decides which side you land on.",
              },
              {
                href: "/findings#coverage",
                stat: `${coverage.loneliest.distance.toFixed(1)}°`,
                title: `The loneliest point in Webb's sky is in ${coverage.loneliest.constellation}`,
                body: "The patch of sky farthest from any public Webb observation, measured on the whole celestial sphere.",
              },
            ].map((f, i) => (
              <Reveal key={f.href} delay={i * 0.1} className="bg-ink">
                <Link href={f.href} className="group flex h-full flex-col p-8 transition hover:bg-white/[0.02] md:p-10">
                  <span className="font-mono text-[clamp(2.4rem,4vw,3.6rem)] leading-none tabular-nums text-gradient-gold">{f.stat}</span>
                  <span className="mt-8 text-xl font-light tracking-tight group-hover:text-gold">{f.title}</span>
                  <span className="mt-3 text-[15px] leading-relaxed text-muted">{f.body}</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── WHY INFRARED ───────────── */}
      <section className="relative overflow-hidden border-t border-line">
        <div className="mx-auto grid max-w-[1600px] gap-16 px-5 py-28 md:grid-cols-12 md:px-8 md:py-36">
          <Reveal className="md:col-span-5">
            <p className="eyebrow">Why infrared</p>
            <h2 className="display mt-6 text-[clamp(2.2rem,4.2vw,4rem)]">Three reasons Webb doesn&apos;t see in visible light.</h2>
            <div className="mt-12 flex justify-center md:justify-start">
              <MirrorLogo glow className="h-56 w-56 opacity-90" />
            </div>
          </Reveal>
          <div className="space-y-px md:col-span-7">
            {[
              {
                t: "The universe stretched the light",
                b: `As space expands, light in transit is stretched to longer wavelengths. Ultraviolet light emitted by hydrogen at 121.6 nm leaves MoM-z14 and arrives ${(121.6 * (1 + record.z) / 1000).toFixed(2)} μm long: ${(1 + record.z).toFixed(2)}× stretched, deep in the infrared. The first galaxies are invisible to optical telescopes.`,
              },
              {
                t: "Dust is transparent at long wavelengths",
                b: "Stars are born inside dense clouds of gas and dust that block visible light. Infrared light passes through, revealing protostars, jets and planet-forming discs that Hubble could only see as dark silhouettes.",
              },
              {
                t: "Cool things glow in the infrared",
                b: "Planets, brown dwarfs and warm dust emit most of their light at infrared wavelengths. To detect that faint glow, Webb has to be colder than its targets. A five-layer sunshield the size of a tennis court passively cools the optics to below −220 °C. A cryocooler takes MIRI further, to below 7 K.",
              },
            ].map((r, i) => (
              <Reveal key={r.t} delay={i * 0.1} className="group border-t border-line py-10 first:border-t-0 md:first:border-t">
                <div className="flex gap-8">
                  <span className="font-mono text-xs text-gold">0{i + 1}</span>
                  <div>
                    <h3 className="text-2xl font-light tracking-tight md:text-3xl">{r.t}</h3>
                    <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-fg-2">{r.b}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── LATEST FROM THE ARCHIVE ───────────── */}
      {latest.length > 0 && (
        <section className="relative border-t border-line">
          <div className="mx-auto max-w-[1600px] px-5 py-28 md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <Reveal>
                <p className="eyebrow">Just released</p>
                <h2 className="display mt-5 text-[clamp(2rem,3.6vw,3.4rem)]">Fresh off the telescope.</h2>
                <p className="mt-4 max-w-xl text-[15px] text-muted">
                  The newest public image products in MAST: unprocessed single-filter frames, exactly as the pipeline
                  produced them. Most of them have never appeared in a press release.
                </p>
              </Reveal>
              <Link href="/archive" className="link-underline font-mono text-xs tracking-[0.2em] text-fg-2 uppercase">
                Search the archive →
              </Link>
            </div>
            <div className="-mx-5 mt-12 flex snap-x gap-4 overflow-x-auto px-5 pb-4 md:-mx-8 md:px-8">
              {latest.map((p) => {
                const inst = instrumentOf(p.instrument);
                return (
                  <figure key={p.obsid} className="group w-[280px] shrink-0 snap-start">
                    <div className="relative aspect-square overflow-hidden rounded-sm border border-line bg-ink-2">
                      <Image
                        src={mastFile(p.jpeg_url!)}
                        alt={`Raw ${inst.label} ${p.filters ?? ""} frame of ${prettyTarget(p.target_name)}`}
                        fill
                        sizes="280px"
                        quality={60}
                        className="object-cover grayscale transition duration-700 group-hover:scale-105"
                      />
                      <span
                        className="absolute left-3 top-3 rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-wider text-ink"
                        style={{ background: inst.color }}
                      >
                        {inst.label} · {p.filters}
                      </span>
                    </div>
                    <figcaption className="mt-3">
                      <p className="truncate text-sm">{prettyTarget(p.target_name)}</p>
                      <p className="mt-1 truncate font-mono text-[10.5px] text-muted">
                        PID {p.proposal_id} · public {fmtMjd(p.release_mjd)}
                      </p>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ───────────── CLOSER ───────────── */}
      <section className="relative overflow-hidden border-t border-line">
        <Starfield className="absolute inset-0 h-full w-full" density={0.6} />
        <div className="relative mx-auto max-w-[1600px] px-5 py-40 text-center md:px-8">
          <Reveal>
            <p className="eyebrow">Sun–Earth L2 · 1.5 million km away</p>
            <h2 className="display mx-auto mt-8 max-w-[20ch] text-[clamp(2.4rem,5.5vw,5.5rem)]">
              Start small. <span className="text-muted">Then keep going.</span>
            </h2>
            <Link
              href="/scale"
              className="mt-12 inline-flex items-center gap-3 rounded-full bg-fg px-7 py-4 text-sm font-medium text-ink transition hover:bg-gold"
            >
              The Scale of Everything <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
