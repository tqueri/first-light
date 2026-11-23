import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { Starfield } from "@/components/starfield";
import { TransitDiagram } from "@/components/worlds/transit-diagram";
import { WorldsExplorer } from "@/components/worlds/worlds-explorer";
import { getExoPlanets, getExoSpectra, getExoStats } from "@/lib/data-exo";
import { INSTRUMENTS } from "@/lib/instruments";
import { fmtInt } from "@/lib/format";

export const metadata: Metadata = {
  title: "Worlds",
  description:
    "Real JWST transmission and emission spectra of exoplanet atmospheres from the NASA Exoplanet Archive: CO₂ on WASP-39 b, rock clouds on WASP-107 b, the K2-18 b debate, and every planet Webb has taken a spectrum of.",
};

const FEATURED = "WASP-39 b";
const R_SUN_KM = 695_700;

export default async function WorldsPage() {
  const [stats, planets, featured] = await Promise.all([getExoStats(), getExoPlanets(), getExoSpectra(FEATURED)]);
  const fp = planets.find((p) => p.name === FEATURED) ?? null;
  const prism =
    featured.find((s) => s.mode === "PRISM" && s.value_kind === "transit_depth") ??
    featured.filter((s) => s.value_kind === "transit_depth").sort((a, b) => b.max_wl - b.min_wl - (a.max_wl - a.min_wl))[0];
  const nircolor = INSTRUMENTS.find((i) => i.key === (prism?.inst_key ?? "NIRSPEC"))?.color ?? "#7fd4ff";

  return (
    <>
      {/* ───────────── HERO ───────────── */}
      <section className="relative overflow-hidden">
        <Starfield className="absolute inset-0 h-full w-full opacity-70" density={0.4} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_30%,rgba(127,212,255,0.08),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-[1600px] grid-cols-1 gap-14 px-5 pb-20 pt-32 md:px-8 lg:grid-cols-12 lg:pt-40">
          <div className="min-w-0 lg:col-span-5">
            <p className="eyebrow animate-fade-up">06 — Worlds · Transmission spectroscopy</p>
            <h1 className="display mt-6 animate-fade-up text-[clamp(2.8rem,6vw,6rem)] [animation-delay:120ms]">
              Reading the air of <span className="text-gradient-gold">alien planets</span>.
            </h1>
            <div className="prose-space mt-8 max-w-xl animate-fade-up [animation-delay:260ms]">
              <p>
                When a planet crosses its star, a thin ring of starlight grazes its atmosphere on the way to us. Molecules
                absorb at their own characteristic wavelengths. At those wavelengths the atmosphere is opaque higher up,
                so the planet blocks a little more light and looks a little larger.
              </p>
              <p>
                Webb measures that difference wavelength by wavelength. It is often only a few hundred parts per million
                of the star&apos;s light, and it adds up to a chemical inventory of a world we will never visit.
              </p>
            </div>

            <div className="mt-10 grid animate-fade-up gap-px overflow-hidden border border-line bg-line [animation-delay:380ms] sm:grid-cols-3">
              {[
                { f: "δ(λ) ≈ (Rp(λ) / R★)²", d: "Transit depth: the fraction of starlight blocked." },
                { f: "H = kT / (μ g)", d: "Scale height: how puffy the atmosphere is." },
                { f: "Δδ ≈ 2 H Rp / R★²", d: "Depth change per scale height. Features span a few H." },
              ].map((e) => (
                <div key={e.f} className="bg-ink/90 px-4 py-4">
                  <p className="font-mono text-[13px] text-fg">{e.f}</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">{e.d}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-dim">
              Hot, low-gravity planets with hydrogen atmospheres have large H and the biggest signals. Small rocky worlds
              with heavy-molecule atmospheres sit near the noise floor.
            </p>
          </div>

          <div className="min-w-0 animate-fade-up [animation-delay:300ms] lg:col-span-7">
            {prism && (
              <TransitDiagram
                planet={FEATURED}
                points={prism.points}
                color={nircolor}
                starRadiusKm={fp?.star_rad_rsun ? fp.star_rad_rsun * R_SUN_KM : null}
                ppmPerH={fp?.ppm_per_h ?? null}
                source={`${prism.reference ?? prism.authors} · NIRSpec ${prism.mode ?? ""}`}
              />
            )}
          </div>
        </div>
      </section>

      {/* ───────────── ARCHIVE STATS ───────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-14 md:px-8">
          <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
            {[
              { k: "JWST spectra", v: fmtInt(stats.spectra), s: `${stats.transmission} transmission · ${stats.eclipse} eclipse` },
              { k: "Planets", v: fmtInt(stats.planets), s: "with at least one Webb spectrum" },
              { k: "Papers", v: fmtInt(stats.papers), s: "distinct publications" },
              { k: "Data points", v: fmtInt(stats.points), s: "wavelength channels in the archive" },
            ].map((x, i) => (
              <Reveal key={x.k} delay={i * 0.06} className="bg-ink px-6 py-6">
                <p className="eyebrow">{x.k}</p>
                <p className="display mt-3 text-4xl tabular-nums">{x.v}</p>
                <p className="mt-2 text-[12px] text-muted">{x.s}</p>
              </Reveal>
            ))}
            <Reveal delay={0.24} className="bg-ink px-6 py-6">
              <p className="eyebrow">By instrument</p>
              <ul className="mt-4 space-y-2">
                {stats.byInstrument.map((b) => {
                  const inst = INSTRUMENTS.find((i) => i.key === b.key)!;
                  return (
                    <li key={b.key} className="flex items-center gap-3 text-[12px]">
                      <span className="w-14 font-mono" style={{ color: inst.color }}>
                        {inst.label}
                      </span>
                      <span className="h-1.5 flex-1 rounded-full bg-white/[0.05]">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${(b.n / stats.spectra) * 100}%`, background: inst.color }}
                        />
                      </span>
                      <span className="w-8 text-right font-mono tabular-nums text-muted">{b.n}</span>
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          </div>
          <p className="mt-3 font-mono text-[10px] tracking-[0.14em] text-dim uppercase">
            Source: NASA Exoplanet Archive · Atmospheric Spectroscopy table (JWST transmission &amp; eclipse spectra) ·
            planet parameters from the Planetary Systems Composite table
          </p>
        </div>
      </section>

      <WorldsExplorer planets={planets} initialPlanet={FEATURED} initialSpectra={featured} />
    </>
  );
}
