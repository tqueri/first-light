import type { Metadata } from "next";
import Image from "next/image";
import { TimeMachine } from "@/components/deep-time/time-machine";
import { Reveal } from "@/components/reveal";
import { AGE_NOW_GYR, H0, OMEGA_L, OMEGA_M, OBSERVABLE_RADIUS_GLY } from "@/lib/cosmology";
import { getGalleryRefs } from "@/lib/data";
import { esaImage, esaPage } from "@/lib/images";

export const metadata: Metadata = {
  title: "Deep Time",
  description:
    "An interactive redshift time machine: lookback time, distances, the Lyman break and the race to the first galaxies, computed live from Planck 2018 cosmology.",
};

export default async function DeepTimePage() {
  const refs = await getGalleryRefs(["udf-a"]);
  const udf = refs["udf-a"];

  return (
    <>
      <section className="relative flex min-h-[92svh] items-end overflow-hidden">
        <Image
          src={esaImage("udf-a", "publicationjpg")}
          alt={udf?.title ?? "Webb observes the Hubble Ultra Deep Field"}
          fill
          priority
          sizes="100vw"
          quality={85}
          className="animate-drift object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/20" />
        <div className="relative mx-auto w-full max-w-[1600px] px-5 pb-20 md:px-8">
          <p className="eyebrow animate-fade-up">Deep time</p>
          <h1 className="display mt-6 max-w-[16ch] animate-fade-up text-[clamp(3rem,8vw,8.5rem)] [animation-delay:150ms]">
            Looking out is looking back.
          </h1>
          <p className="mt-8 max-w-xl animate-fade-up text-[17px] leading-relaxed text-fg-2 [animation-delay:300ms]">
            Light is fast but not infinitely fast, so every image is a record of the past. The farther the source, the
            older the light, and the more the expanding universe has stretched it. Astronomers measure that stretch as
            redshift, <em>z</em>. Choose a redshift below and see what it means.
          </p>
          {udf && (
            <p className="mt-10 font-mono text-[10px] text-muted">
              <a href={esaPage(udf.id)} className="link-underline" target="_blank" rel="noreferrer">
                {udf.title}
              </a>{" "}
              · {udf.credit}
            </p>
          )}
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-24 md:px-8 md:py-32">
          <TimeMachine />
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto grid max-w-[1600px] gap-12 px-5 py-24 md:grid-cols-3 md:px-8">
          <Reveal>
            <p className="eyebrow mb-4">The model</p>
            <p className="text-sm leading-relaxed text-muted">
              Flat ΛCDM with Planck 2018 parameters: H₀ = {H0} km/s/Mpc, Ωm = {OMEGA_M}, ΩΛ = {OMEGA_L.toFixed(4)},
              plus radiation (photons and three neutrino species). Integrals are evaluated in your browser with
              Simpson&apos;s rule. The universe&apos;s age comes out at {AGE_NOW_GYR.toFixed(3)} billion years, and the
              observable radius at {OBSERVABLE_RADIUS_GLY.toFixed(1)} billion light-years.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="eyebrow mb-4">Which distance?</p>
            <p className="text-sm leading-relaxed text-muted">
              Beyond a few billion light-years, &ldquo;distance&rdquo; needs a definition. <em>Light-travel</em>{" "}
              distance is the lookback time × c. <em>Comoving</em> distance is where the source is today.
              <em> Angular-diameter</em> distance sets apparent size, and <em>luminosity</em> distance sets apparent
              brightness. Press releases usually quote light-travel time.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="eyebrow mb-4">Faster than light?</p>
            <p className="text-sm leading-relaxed text-muted">
              Galaxies beyond z ≈ 1.5 recede faster than light today. Nothing breaks relativity: no object outruns light
              through space; space itself expands between them. Their light still reaches us because the Hubble sphere
              has grown while it travelled.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
