import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Odometer } from "@/components/scale/odometer";
import { Starfield } from "@/components/starfield";
import { OBSERVABLE_RADIUS_GLY } from "@/lib/cosmology";
import { getGalleryRefs } from "@/lib/data";
import { esaDetailSize, esaImage, esaPage } from "@/lib/images";
import { STOPS } from "@/lib/scale-stops";

export const metadata: Metadata = {
  title: "The Scale of Everything",
  description:
    "A scroll-driven journey from Earth's surface to the most distant galaxy ever confirmed and the edge of the observable universe, through James Webb's images.",
};

export default async function ScalePage() {
  const refs = await getGalleryRefs(STOPS.flatMap((s) => (s.image ? [s.image.id] : [])));

  return (
    <>
      <section className="relative flex min-h-[100svh] items-end overflow-hidden">
        <Starfield className="absolute inset-0 h-full w-full" density={0.9} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(242,196,109,0.12),transparent_60%)]" />
        <div className="relative mx-auto w-full max-w-[1600px] px-5 pb-24 md:px-8">
          <p className="eyebrow animate-fade-up">A journey in {STOPS.length} stops</p>
          <h1 className="display mt-6 max-w-[14ch] animate-fade-up text-[clamp(3rem,9vw,10rem)] [animation-delay:150ms]">
            The Scale of Everything
          </h1>
          <p className="mt-8 max-w-xl animate-fade-up text-[17px] leading-relaxed text-fg-2 [animation-delay:300ms]">
            Scroll outward from Earth&apos;s surface. The counter tracks how far the light has travelled, from
            thousands of kilometres to billions of light-years. Every astronomical image along the way was taken by Webb.
          </p>
          <p className="mt-16 animate-fade-up font-mono text-[10px] tracking-[0.3em] text-dim uppercase [animation-delay:500ms]">
            ↓ Scroll
          </p>
        </div>
      </section>

      <div data-journey className="relative">
        <div className="pointer-events-none absolute bottom-0 left-5 top-0 w-px bg-gradient-to-b from-transparent via-line-2 to-transparent md:left-8" />
        {STOPS.map((s, i) => {
          const ref = s.image ? refs[s.image.id] : undefined;
          const flip = i % 2 === 1;
          return (
            <section
              key={s.key}
              data-stop
              data-logkm={Math.log10(s.km)}
              className="relative flex min-h-[88svh] items-center border-t border-line/60 py-20 md:py-28"
            >
              <div className="mx-auto grid w-full max-w-[1600px] items-center gap-12 px-5 md:grid-cols-12 md:px-8">
                <div className={"md:col-span-5 " + (flip ? "md:order-2 md:col-start-8" : "")}>
                  <Reveal>
                    <p className="font-mono text-[11px] text-gold">
                      {String(i + 1).padStart(2, "0")} / {String(STOPS.length).padStart(2, "0")}
                    </p>
                    <p className="eyebrow mt-6">{s.where}</p>
                    <h2 className="display mt-3 text-[clamp(2.6rem,5.5vw,5.4rem)]">{s.name}</h2>
                    <div className="prose-space mt-8 max-w-lg">
                      {s.body.map((p) => (
                        <p key={p.slice(0, 24)}>{p}</p>
                      ))}
                    </div>
                    {s.facts && (
                      <dl className="mt-10 grid max-w-lg grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line">
                        {s.facts.map(([k, v]) => (
                          <div key={k} className="bg-ink px-4 py-3">
                            <dt className="eyebrow !text-[9px]">{k}</dt>
                            <dd className="mt-1 font-mono text-[13px] text-fg">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </Reveal>
                </div>

                <div className={"md:col-span-7 " + (flip ? "md:order-1 md:col-start-1" : "md:col-start-6")}>
                  <Reveal delay={0.15}>
                    {s.image ? (
                      <figure>
                        <div className="brackets relative aspect-[4/3] overflow-hidden bg-ink-2">
                          <Image
                            src={esaImage(s.image.id, esaDetailSize(ref?.width, ref?.height))}
                            alt={ref?.title ?? s.name}
                            fill
                            sizes="(min-width: 768px) 58vw, 100vw"
                            quality={85}
                            className="object-cover transition duration-[2s] ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.04]"
                            style={{ objectPosition: s.image.position ?? "50% 50%" }}
                          />
                        </div>
                        {ref && (
                          <figcaption className="mt-3 flex flex-wrap justify-between gap-2 font-mono text-[10px] text-muted">
                            <a href={esaPage(ref.id)} target="_blank" rel="noreferrer" className="link-underline">
                              {ref.title}
                            </a>
                            <span>{ref.credit}</span>
                          </figcaption>
                        )}
                      </figure>
                    ) : (
                      <div className="relative grid aspect-[4/3] place-items-center overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(242,196,109,0.08),transparent_60%)]" />
                        <p className="display relative text-center text-[clamp(3.5rem,9vw,9rem)] text-gradient-gold">{s.glyph}</p>
                      </div>
                    )}
                  </Reveal>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="relative overflow-hidden border-t border-line">
        <Starfield className="absolute inset-0 h-full w-full" density={1.2} />
        <div className="relative mx-auto max-w-[1600px] px-5 py-40 text-center md:px-8">
          <Reveal>
            <p className="eyebrow">Epilogue</p>
            <p className="display mx-auto mt-8 text-[clamp(4rem,14vw,14rem)] text-gradient-gold">
              {OBSERVABLE_RADIUS_GLY.toFixed(1)}
            </p>
            <p className="mt-2 text-lg text-fg-2">billion light-years: the radius of everything we could ever see.</p>
            <p className="mx-auto mt-10 max-w-2xl text-[16px] leading-relaxed text-muted">
              The universe may well be far larger, possibly infinite. But light from beyond this horizon hasn&apos;t had
              time to reach us, and because expansion is accelerating, much of it never will. Everything Webb will
              ever photograph lies inside this sphere.
            </p>
            <div className="mt-14 flex flex-wrap justify-center gap-3">
              <Link
                href="/deep-time"
                className="inline-flex items-center gap-3 rounded-full bg-fg px-6 py-3.5 text-sm font-medium text-ink transition hover:bg-gold"
              >
                Explore deep time <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link href="/sky" className="inline-flex items-center gap-3 rounded-full border border-line-2 px-6 py-3.5 text-sm hover:border-fg">
                See where Webb looked
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
      <Odometer />
    </>
  );
}
