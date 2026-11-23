import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CoverageMap } from "@/components/findings/coverage-map";
import { StackedBars } from "@/components/findings/stacked-bars";
import { SunScatter } from "@/components/findings/sun-scatter";
import { Reveal } from "@/components/reveal";
import { getStats } from "@/lib/data";
import {
  getColourFinding,
  getCoverageFinding,
  getGalacticFinding,
  getPressFinding,
  getRevisitedFinding,
  getSecrecyFinding,
  getSunFinding,
  getWorldsCensus,
  PAINT,
  PAINT_HEX,
  PROGRAMME_GROUPS,
} from "@/lib/findings";
import { fmtDate, fmtInt, fmtMjd } from "@/lib/format";
import { decToDms, raToHms } from "@/lib/sky-math";

export const metadata: Metadata = {
  title: "Findings",
  description:
    "Original analyses of the entire public James Webb archive: the Sun's shadow in Webb's schedule, how long data stays secret, how long a press image takes, and more. Recomputed daily.",
};

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

function Finding({
  n,
  id,
  kicker,
  title,
  stat,
  statLabel,
  children,
  method,
}: {
  n: number;
  id: string;
  kicker: string;
  title: ReactNode;
  stat: string;
  statLabel: string;
  children: ReactNode;
  method: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1600px] px-5 py-24 md:px-8 md:py-32">
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <p className="font-mono text-[11px] text-gold">Finding {String(n).padStart(2, "0")}</p>
            <p className="eyebrow mt-4">{kicker}</p>
            <h2 className="display mt-4 text-[clamp(2rem,3.6vw,3.4rem)]">{title}</h2>
            <p className="mt-10 font-mono text-[clamp(2.6rem,5vw,4.4rem)] leading-none tabular-nums text-gradient-gold">{stat}</p>
            <p className="mt-3 max-w-xs text-sm text-muted">{statLabel}</p>
          </Reveal>
          <div className="min-w-0 lg:col-span-8">
            <Reveal delay={0.1}>{children}</Reveal>
            <details className="group mt-10 border-t border-line pt-5">
              <summary className="cursor-pointer list-none font-mono text-[10.5px] tracking-[0.2em] text-muted uppercase hover:text-fg">
                <span className="mr-2 inline-block transition group-open:rotate-90">›</span> How we computed this
              </summary>
              <div className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">{method}</div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function FindingsPage() {
  const [stats, sun, secrecy, press, colours, galactic, coverage, revisited, census] = await Promise.all([
    getStats(),
    getSunFinding(),
    getSecrecyFinding(),
    getPressFinding(),
    getColourFinding(),
    getGalacticFinding(),
    getCoverageFinding(),
    getRevisitedFinding(14),
    getWorldsCensus(),
  ]);

  const sunShare = sun.inside / sun.products;
  const immediate = secrecy.immediate / secrecy.observations;
  const oneYear = secrecy.oneYear / secrecy.observations;
  const highLat = galactic.filter((g) => g.from >= 30);
  const highLatData = highLat.reduce((s, g) => s + g.dataShare, 0);
  const highLatSky = highLat.reduce((s, g) => s + g.skyShare, 0);
  const plane = galactic[0];
  const f444 = colours.rows.find((r) => r.instrument === "NIRCam" && Math.abs(r.wavelengthUm - 4.44) < 0.01);
  const contested = [...colours.rows].sort((a, b) => a.topShare - b.topShare)[0];
  const firstYear = press.byYear[0];
  const lastYears = press.byYear.slice(-2);
  const cliffs = press.items.find((i) => i.id === "weic2205a") ?? [...press.items].sort((a, b) => a.lag - b.lag)[0];
  const slowest = [...press.items].sort((a, b) => b.lag - a.lag)[0];
  const topCal = revisited.filter((r) => r.calShare >= 0.5).length;
  const rocky = census.classes[0]?.n ?? 0;
  const giants = census.classes[3]?.n ?? 0;

  const INDEX = [
    { id: "sun", t: "The Sun's shadow in Webb's schedule", s: pct(sunShare, 2) },
    { id: "secrecy", t: "Instantly public, or exactly one year", s: pct(immediate) },
    { id: "press", t: "From photons to press picture", s: `${lastYears.at(-1)?.median ?? "—"} d` },
    { id: "colour", t: "The same light, painted different colours", s: f444 ? pct(f444.topShare) : "—" },
    { id: "galactic", t: "Webb looks away from the Milky Way", s: pct(highLatData) },
    { id: "coverage", t: "Everywhere, and nowhere deep", s: pct(coverage.cellAreaShare, 2) },
    { id: "revisited", t: "Its most-visited stars are ones you've never heard of", s: `${revisited[0]?.programmes ?? 0}×` },
    { id: "worlds", t: "The census of worlds", s: String(census.planets.length) },
  ];

  return (
    <>
      {/* ───────────── hero ───────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(242,196,109,0.10),transparent_55%)]" />
        <div className="relative mx-auto max-w-[1600px] px-5 pb-20 pt-36 md:px-8 md:pt-44">
          <p className="eyebrow animate-fade-up">Only on First Light · original analysis</p>
          <h1 className="display mt-6 max-w-[16ch] animate-fade-up text-[clamp(3rem,8vw,8.5rem)] [animation-delay:150ms]">
            What the archive says when you read <span className="text-gradient-gold">all of it</span>.
          </h1>
          <p className="mt-8 max-w-2xl animate-fade-up text-[17px] leading-relaxed text-fg-2 [animation-delay:300ms]">
            Press releases show one object at a time. We took every public, calibrated Webb product, {fmtInt(stats.products)}{" "}
            of them from {fmtInt(stats.programs)} programmes, plus {fmtInt(colours.images)} official images and{" "}
            {census.planets.length} exoplanet spectra sets, and asked questions no single observation can answer. These
            numbers are recomputed every day as new data becomes public.
          </p>

          <ol className="mt-16 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {INDEX.map((f, i) => (
              <li key={f.id} className="bg-ink">
                <a href={`#${f.id}`} className="group flex h-full flex-col justify-between gap-6 p-6 transition hover:bg-white/[0.03]">
                  <span className="font-mono text-[10.5px] text-gold">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[15px] leading-snug text-fg-2 group-hover:text-fg">{f.t}</span>
                  <span className="font-mono text-2xl tabular-nums">{f.s}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────────── 01 sun ───────────── */}
      <Finding
        n={1}
        id="sun"
        kicker="Orbital mechanics, read from metadata"
        title={<>The Sun&apos;s shadow is written into Webb&apos;s schedule.</>}
        stat={pct(sunShare, 2)}
        statLabel={`of ${fmtInt(sun.products)} products were taken between 85° and 135° from the Sun.`}
        method={
          <>
            <p>
              For every product with a fixed position we took the start of its first exposure (<code>t_min</code>) and computed
              the Sun&apos;s ecliptic longitude at that moment with a standard low-precision solar formula (accurate to ~0.01°).
              From the target&apos;s ecliptic coordinates we got its angular distance from the Sun. Positions are seen from Earth
              rather than from L2, a difference of well under 0.1° for anything outside the Solar System.
            </p>
            <p className="mt-3">
              The scatter plot shows one point per observation (programme + observation number, {fmtInt(sun.observations)}{" "}
              points), placed at its mean position. The {fmtInt(sun.products - sun.inside)} products outside the band sit between{" "}
              {sun.minElong.toFixed(1)}° and {sun.maxElong.toFixed(1)}°. Almost all are within a fraction of a degree of the
              edge, which fits the gap between the exposure start and the planned schedule. A handful are clear outliers and
              probably carry wrong coordinates in the archive.
            </p>
          </>
        }
      >
        <p className="max-w-3xl text-[16px] leading-relaxed text-fg-2">
          Webb&apos;s sunshield must always sit between the Sun and the mirror, so the telescope can only point between 85°
          and 135° from the Sun. Nobody publishes the schedule in this form, but the archive metadata contains it. Plot
          every observation&apos;s date against the ecliptic longitude it looked at, and the Sun&apos;s yearly march across
          the sky appears. It is flanked by two bands of observations that move with it, one ahead and one behind. Targets
          far from the ecliptic (blue) escape the pattern: near the ecliptic poles Webb can see all year round.
        </p>
        <div className="mt-10">
          <SunScatter points={sun.points} />
        </div>
        <div className="mt-12">
          <p className="eyebrow mb-3">Distance from the Sun at the moment of observation · all products</p>
          <StackedBars
            bars={Array.from({ length: 71 }, (_, i) => {
              const deg = 75 + i;
              const n = sun.hist.find((h) => h.deg === deg)?.n ?? 0;
              return { label: `${deg}°`, values: [n], tip: `${deg}°–${deg + 1}° from the Sun` };
            })}
            series={[{ name: "Products", color: "#bb8809" }]}
            height={200}
            xTicks={[75, 85, 95, 105, 115, 125, 135, 145].map((d) => ({ index: d - 75 + 0.5, label: `${d}°` }))}
            highlight={{ from: 10, to: 60, label: "85°–135°: the only directions Webb can face" }}
            ariaLabel="Histogram of solar elongation for all products, concentrated between 85 and 135 degrees."
          />
        </div>
      </Finding>

      {/* ───────────── 02 secrecy ───────────── */}
      <Finding
        n={2}
        id="secrecy"
        kicker="Exclusive access periods"
        title={<>Webb data is either public at once, or after exactly one year.</>}
        stat={pct(immediate)}
        statLabel={`of ${fmtInt(secrecy.observations)} observations were public within three days of being taken; ${pct(oneYear)} waited almost exactly a year.`}
        method={
          <>
            <p>
              The lag is the public-release date (<code>t_obs_release</code>) minus the end of the last exposure (
              <code>t_max</code>), taken per observation rather than per product, so huge multi-object spectroscopy
              programmes don&apos;t dominate.
            </p>
            <p className="mt-3">
              We only count observations that ended before {fmtMjd(secrecy.cutoffMjd)}. Data still in its exclusive period
              is invisible in a public archive. Including recent observations would make &ldquo;instantly public&rdquo; look
              more common than it is.
            </p>
          </>
        }
      >
        <p className="max-w-3xl text-[16px] leading-relaxed text-fg-2">
          Teams that win Webb time usually get 12 months of exclusive access before everyone else can use their data. The
          distribution of real delays is almost binary: a spike at zero and a spike at 365 days, with very little in between.
          Who you are decides which spike you land in. Calibration, Director&apos;s Discretionary and Early Release Science
          data are nearly always public at once. Guaranteed-time teams, who built the instruments, almost always keep their
          year.
        </p>
        <div className="mt-10">
          <StackedBars
            bars={secrecy.bins.map((b) => ({
              label: String(b.from),
              values: b.values,
              tip: b.from >= 735 ? "735 days or more" : `${b.from}–${b.from + 15} days after observation`,
            }))}
            series={PROGRAMME_GROUPS.map((g) => ({ name: g.label, color: g.color }))}
            height={300}
            xTicks={[0, 180, 365, 545, 730].map((d) => ({ index: d / 15, label: d === 0 ? "0 days" : `${d}` }))}
            ariaLabel="Histogram of days between observation and public release, stacked by programme type, with peaks at zero and at one year."
          />
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {PROGRAMME_GROUPS.map((g) => {
            const s = secrecy.groups.find((x) => x.key === g.key);
            return (
              <div key={g.key} className="bg-ink p-4">
                <span className="mb-3 block h-1 w-8 rounded-full" style={{ background: g.color }} />
                <p className="text-xs leading-snug text-fg-2">{g.label}</p>
                <p className="mt-3 font-mono text-xl tabular-nums">{s ? pct(s.immediate) : "—"}</p>
                <p className="font-mono text-[10px] text-muted">
                  public at once · median {s ? Math.round(s.median) : "—"} d · {s ? fmtInt(s.n) : 0} obs.
                </p>
              </div>
            );
          })}
        </div>
      </Finding>

      {/* ───────────── 03 press ───────────── */}
      <Finding
        n={3}
        id="press"
        kicker="Science communication"
        title={<>The first pictures took weeks. Now a Webb press image arrives about a year after its light.</>}
        stat={`${firstYear?.median ?? "—"} → ${lastYears.at(-1)?.median ?? "—"} days`}
        statLabel={`Median time from the last exposure to the ESA/Webb release, ${firstYear?.year} vs ${lastYears.at(-1)?.year}.`}
        method={
          <>
            <p>
              The archive doesn&apos;t say which exposures went into a press image, so we inferred it. For each ESA/Webb image
              with coordinates (Solar System targets excluded), we took the latest Webb imaging exposure within 3′ of the image
              centre that ended before the release date. The lag is the release date minus that exposure.
            </p>
            <p className="mt-3">
              Several versions of one release (a, b, c…) count once. {press.matched} of {press.considered} releases could be
              matched. Mosaics much wider than 3′, or images built from programmes that are still private, can&apos;t be.
              If another programme happened to observe the same spot shortly before a release, the measured gap comes out
              shorter than the real one, so individual values are lower limits. The year-to-year trend is robust.
            </p>
          </>
        }
      >
        <p className="max-w-3xl text-[16px] leading-relaxed text-fg-2">
          In 2022 Webb&apos;s first images went from telescope to front pages in a month. They were Early Release
          Observations, taken to be shown. Today most press images are of science programmes, and they usually wait for the
          team&apos;s exclusive period and their paper. The Cosmic Cliffs went from telescope to release in {cliffs?.lag} days; the
          longest gap we measured, for {slowest?.title.replace(/\s*\(.*?\)\s*$/, "")}, is {slowest?.lag} days.
        </p>
        <PressStrip items={press.items} byYear={press.byYear} />
      </Finding>

      {/* ───────────── 04 colour ───────────── */}
      <Finding
        n={4}
        id="colour"
        kicker="How the pictures are made"
        title={<>The same infrared light gets painted different colours.</>}
        stat={f444 ? pct(f444.topShare) : "—"}
        statLabel={f444 ? `of the time, NIRCam's 4.44 μm filter is painted ${f444.top.toLowerCase()}. Some wavelengths have no such convention.` : ""}
        method={
          <p>
            Every ESA/Webb image page lists the filters used and the colour assigned to each. We parsed{" "}
            {fmtInt(colours.images)} image pages and counted, for each NIRCam and MIRI wavelength used at least 15 times, how
            often each colour was chosen. Rows are the wavelength as ESA lists it; colour names are ESA&apos;s own.
          </p>
        }
      >
        <p className="max-w-3xl text-[16px] leading-relaxed text-fg-2">
          Webb sees no colour, so imagers assign one to each filter, usually in &ldquo;chromatic order&rdquo;: shortest
          wavelength blue, longest red. That makes colour relative. Across hundreds of official images the longest NIRCam
          filters are almost always red. But {contested ? `${contested.label} (${contested.instrument})` : "MIRI's 7.7 μm band"}{" "}
          has no convention at all: across the images that use it, it has been painted blue, green, orange and red. Its colour
          depends entirely on which other filters share the picture.
        </p>
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-[3px] text-center">
            <thead>
              <tr>
                <th className="eyebrow w-36 pb-2 text-left font-normal">Wavelength</th>
                {PAINT.map((p) => (
                  <th key={p} className="pb-2 font-mono text-[10px] font-normal text-muted">
                    {p}
                  </th>
                ))}
                <th className="pb-2 font-mono text-[10px] font-normal text-muted">Uses</th>
              </tr>
            </thead>
            <tbody>
              {colours.rows.map((r) => (
                <tr key={`${r.instrument}${r.wavelengthUm}`}>
                  <td className="whitespace-nowrap pr-2 text-left font-mono text-[11px] text-fg-2">
                    {r.label} <span className="text-dim">{r.instrument}</span>
                  </td>
                  {r.counts.map((c, i) => {
                    const share = c / r.total;
                    return (
                      <td
                        key={i}
                        className="h-9 rounded-sm font-mono text-[10.5px]"
                        style={{
                          background: c ? PAINT_HEX[PAINT[i]] : "rgba(255,255,255,0.025)",
                          opacity: c ? 0.25 + share * 0.75 : 1,
                          color: share > 0.45 ? "#030407" : "#ecebe7",
                        }}
                        title={`${r.label} ${r.instrument}: ${PAINT[i]} in ${c} of ${r.total} images (${pct(share)})`}
                      >
                        {c ? pct(share) : ""}
                      </td>
                    );
                  })}
                  <td className="font-mono text-[10.5px] text-muted">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Finding>

      {/* ───────────── 05 galactic ───────────── */}
      <Finding
        n={5}
        id="galactic"
        kicker="Where the data comes from"
        title={<>Webb mostly looks away from the Milky Way.</>}
        stat={pct(highLatData)}
        statLabel={`of all products come from more than 30° off the galactic plane, which is ${pct(highLatSky)} of the sky.`}
        method={
          <p>
            Each 0.2° sky cell&apos;s position was converted to galactic latitude <em>b</em> (IAU J2000 rotation). Products were
            summed per 10° band of |b|. The share of sky in each band is sin(b₂) − sin(b₁). Moving Solar System targets are
            excluded.
          </p>
        }
      >
        <p className="max-w-3xl text-[16px] leading-relaxed text-fg-2">
          The Milky Way&apos;s disc is where stars are born, and Webb is famous for its nebulae. Yet the band within 10° of the
          galactic plane, {pct(plane.skyShare)} of the sky, supplies only {pct(plane.dataShare)} of the data. Most of the archive
          comes from looking straight out of our galaxy, through the thinnest possible veil of its dust, at the deep
          extragalactic fields where a single NIRSpec exposure can record spectra of hundreds of galaxies.
        </p>
        <div className="mt-10 space-y-3">
          <div className="flex gap-6 text-xs text-fg-2">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-[#5b5e69]" /> Share of the sky
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-[#2a91be]" /> Share of Webb&apos;s data
            </span>
          </div>
          {galactic.map((g, _i, all) => {
            const top = Math.max(...all.flatMap((x) => [x.skyShare, x.dataShare]));
            return (
            <div key={g.from} className="grid grid-cols-[84px_1fr] items-center gap-4">
              <span className="font-mono text-[11px] text-fg-2">
                |b| {g.from}–{g.to}°
              </span>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-r-full bg-[#5b5e69]" style={{ width: `${(g.skyShare / top) * 85}%` }} />
                  <span className="font-mono text-[10px] text-muted">{pct(g.skyShare)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-r-full bg-[#2a91be]" style={{ width: `${Math.max(0.3, (g.dataShare / top) * 85)}%` }} />
                  <span className="font-mono text-[10px] text-fg-2">
                    {pct(g.dataShare)} · {fmtInt(g.products)}
                  </span>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </Finding>

      {/* ───────────── 06 coverage ───────────── */}
      <Finding
        n={6}
        id="coverage"
        kicker="Coverage"
        title={<>Webb has been everywhere, and almost nowhere.</>}
        stat={pct(coverage.cellAreaShare, 2)}
        statLabel={`of the sky lies inside one of the ${fmtInt(coverage.cells)} 0.2° cells holding public Webb data. Yet ${pct(coverage.within5)} of the sky is within 5° of one.`}
        method={
          <p>
            Cells are the 0.2° × 0.2° bins used by the sky map (about 0.04 square degrees each, roughly a million on the whole
            sky); cell area overstates the true footprint, which is smaller. Distances were measured from {fmtInt(30_000)}{" "}
            evenly spaced points (a Fibonacci sphere) to the nearest cell centre. The loneliest point was then refined by local
            search. Its constellation comes from the IAU boundaries.
          </p>
        }
      >
        <p className="max-w-3xl text-[16px] leading-relaxed text-fg-2">
          Each Webb image covers a patch of sky about the size of a grain of sand held at arm&apos;s length. Its observations are
          scattered evenly enough that almost no part of the sky is far from one. Only {pct(coverage.within1)} of the sky is
          within a single degree of public Webb data, though. The emptiest spot, the point farthest from anything Webb has
          released, is in <span className="text-fg">{coverage.loneliest.constellation}</span>, at{" "}
          <span className="font-mono text-fg">{raToHms(coverage.loneliest.ra)}</span>,{" "}
          <span className="font-mono text-fg">{decToDms(coverage.loneliest.dec)}</span>, a full{" "}
          <span className="text-gold">{coverage.loneliest.distance.toFixed(1)}°</span> from the nearest observation (
          {coverage.loneliest.nearest}): about {Math.round(coverage.loneliest.distance / 0.52)} full Moons side by side.
        </p>
        <div className="mt-10">
          <CoverageMap dots={coverage.dots} lonely={coverage.loneliest} />
          <Link
            href={`/sky?ra=${coverage.loneliest.ra.toFixed(2)}&dec=${coverage.loneliest.dec.toFixed(2)}&fov=40`}
            className="link-underline mt-4 inline-block font-mono text-xs tracking-[0.18em] text-fg-2 uppercase"
          >
            Fly to the loneliest point in the sky map →
          </Link>
        </div>
      </Finding>

      {/* ───────────── 07 revisited ───────────── */}
      <Finding
        n={7}
        id="revisited"
        kicker="Repeat visits"
        title={<>Webb&apos;s most-visited stars are ones you&apos;ve never heard of.</>}
        stat={`${revisited[0]?.programmes ?? 0} programmes`}
        statLabel={`have observed ${revisited[0]?.name ?? "—"}, the most revisited target in the public archive.`}
        method={
          <p>
            Targets were grouped by their MAST name with spaces and punctuation removed (so &ldquo;NGC-3324&rdquo; and
            &ldquo;NGC 3324&rdquo; merge), then ranked by the number of distinct programmes. Generic background pointings were
            excluded. &ldquo;Calibration&rdquo; marks targets where at least half the products come from calibration,
            commissioning or engineering programmes. Different teams sometimes name the same object differently, so famous
            objects may be split and under-counted.
          </p>
        }
      >
        <p className="max-w-3xl text-[16px] leading-relaxed text-fg-2">
          The list of objects Webb returns to most is not a list of celebrities. {topCal} of the top {revisited.length} are
          calibration targets: stable, well-understood stars and empty patches of sky. Webb measures them again and again to
          keep its flux scale honest and to track how its detectors age. Every famous image depends on these unglamorous
          standards. The science targets that do make the list are the ones that change: planets, supernovae and the TRAPPIST-1
          system.
        </p>
        <ol className="mt-10 divide-y divide-line border-y border-line">
          {revisited.map((r, i) => (
            <li key={r.name + i} className="grid grid-cols-[28px_1fr_auto] items-center gap-4 py-3">
              <span className="font-mono text-[11px] text-gold">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[15px]">{r.name}</span>
                  {r.calShare >= 0.5 ? (
                    <span className="rounded-full border border-[#d94726]/60 px-2 py-px font-mono text-[9.5px] text-[#ff8a6e]">calibration</span>
                  ) : (
                    <span className="rounded-full border border-[#2a91be]/60 px-2 py-px font-mono text-[9.5px] text-[#7fd4ff]">
                      {r.moving ? "Solar System" : "science"}
                    </span>
                  )}
                </span>
                <span className="mt-1 block font-mono text-[10px] text-muted">
                  {fmtInt(r.products)} products · {fmtMjd(r.firstMjd, { year: "numeric", month: "short" })} → {fmtMjd(r.lastMjd, { year: "numeric", month: "short" })}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="hidden h-1.5 w-40 rounded-full bg-white/5 sm:block">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(r.programmes / (revisited[0]?.programmes || 1)) * 100}%`, background: r.calShare >= 0.5 ? "#d94726" : "#2a91be" }}
                  />
                </span>
                <span className="w-10 text-right font-mono text-sm tabular-nums">{r.programmes}</span>
              </span>
            </li>
          ))}
        </ol>
      </Finding>

      {/* ───────────── 08 worlds ───────────── */}
      <Finding
        n={8}
        id="worlds"
        kicker="Exoplanet atmospheres"
        title={<>The worlds Webb has smelled are mostly giants, but the rocky ones have arrived.</>}
        stat={`${rocky} rocky`}
        statLabel={`of the ${census.planets.length} planets with published Webb spectra are smaller than 1.6 Earth radii. ${census.temperate} are cooler than 400 K.`}
        method={
          <p>
            Planets with at least one Webb transmission or eclipse spectrum in the NASA Exoplanet Archive&apos;s atmospheric
            spectroscopy table, with radius and equilibrium temperature from its Planetary Systems Composite table. Size classes
            follow common usage: rocky below 1.6 R⊕ (where planets typically stop being dense), sub-Neptunes to 4 R⊕, giants
            above 8 R⊕. Equilibrium temperature assumes zero albedo and full heat redistribution, as in the archive.
          </p>
        }
      >
        <p className="max-w-3xl text-[16px] leading-relaxed text-fg-2">
          Transmission spectroscopy favours big, hot, puffy planets: their atmospheres are thick enough to leave a measurable
          imprint on the starlight. So the census is top-heavy, with {giants} giants. But Webb is the first telescope that can
          test rocky worlds at all, and they are now a real part of the sample. {census.rockyAroundMDwarfs} of the {rocky} rocky
          planets orbit small, cool red dwarfs, where an Earth-sized planet blocks a much larger fraction of the star.
        </p>
        <CensusPlot planets={census.planets} />
        <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-4">
          {census.classes.map((c) => (
            <div key={c.label} className="bg-ink p-4">
              <p className="font-mono text-2xl tabular-nums">{c.n}</p>
              <p className="mt-1 text-xs text-muted">{c.label}</p>
            </div>
          ))}
        </div>
        <Link href="/worlds" className="link-underline mt-6 inline-block font-mono text-xs tracking-[0.18em] text-fg-2 uppercase">
          Explore the spectra →
        </Link>
      </Finding>

      <section className="border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-20 text-sm leading-relaxed text-muted md:px-8">
          <p className="eyebrow mb-4 text-fg-2">About these findings</p>
          <p className="max-w-3xl">
            These are our own analyses of public archive metadata, not peer-reviewed results. Every number on this page is
            computed live from the same database the rest of the site uses, so it will shift as Webb&apos;s archive grows.
            Archive data as of {stats.ingestedAt ? fmtDate(stats.ingestedAt) : "today"}. Spotted something wrong? The method for
            each finding is one click away.
          </p>
        </div>
      </section>
    </>
  );
}

/* ───────────── server-rendered charts ───────────── */

function PressStrip({ items, byYear }: { items: { id: string; title: string; release: string; lag: number; year: number }[]; byYear: { year: number; n: number; median: number }[] }) {
  const W = 1000;
  const rowH = 46;
  const pad = { l: 64, r: 20, t: 18, b: 30 };
  const maxLag = Math.max(800, ...items.map((i) => i.lag));
  const X = (d: number) => Math.round((pad.l + (Math.min(d, maxLag) / maxLag) * (W - pad.l - pad.r)) * 10) / 10;
  const H = pad.t + byYear.length * rowH + pad.b;
  return (
    <div className="mt-10">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Days from last exposure to press release, one dot per release, grouped by release year, with yearly medians.">
        {[0, 100, 200, 365, 500, 730].filter((d) => d <= maxLag).map((d) => (
          <g key={d}>
            <line x1={X(d)} x2={X(d)} y1={pad.t - 6} y2={H - pad.b} stroke={d === 365 ? "rgba(242,196,109,0.3)" : "rgba(255,255,255,0.06)"} strokeDasharray={d === 365 ? "3 3" : undefined} />
            <text x={X(d)} y={H - 10} textAnchor="middle" className="fill-[#8a8d98] font-mono text-[10px]">
              {d === 365 ? "1 year" : `${d} d`}
            </text>
          </g>
        ))}
        {byYear.map((y, row) => {
          const cy = pad.t + row * rowH + rowH / 2;
          const its = items.filter((i) => i.year === y.year);
          return (
            <g key={y.year}>
              <text x={pad.l - 14} y={cy + 4} textAnchor="end" className="fill-[#b9bac2] font-mono text-[11px]">
                {y.year}
              </text>
              {its.map((it, k) => (
                <circle key={it.id} cx={X(it.lag)} cy={cy + ((k % 5) - 2) * 4} r={4} fill="#2a91be" fillOpacity={0.75}>
                  <title>{`${it.title} — ${it.lag} days from last exposure to release`}</title>
                </circle>
              ))}
              <line x1={X(y.median)} x2={X(y.median)} y1={cy - 16} y2={cy + 16} stroke="#f2c46d" strokeWidth={2.5} />
              <text x={X(y.median) + 6} y={cy - 9} className="fill-[#f2c46d] font-mono text-[10px]">
                median {y.median} d · n={y.n}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CensusPlot({ planets }: { planets: { name: string; radius: number; teq: number; spectra: number }[] }) {
  const W = 1000;
  const H = 420;
  const pad = { l: 60, r: 20, t: 16, b: 40 };
  const lx = (t: number) => Math.round((pad.l + ((Math.log10(t) - Math.log10(150)) / (Math.log10(3500) - Math.log10(150))) * (W - pad.l - pad.r)) * 10) / 10;
  const ly = (r: number) => Math.round((H - pad.b - ((Math.log10(r) - Math.log10(0.5)) / (Math.log10(25) - Math.log10(0.5))) * (H - pad.t - pad.b)) * 10) / 10;
  const LABELS = new Set(["WASP-39 b", "K2-18 b", "TRAPPIST-1 b", "TRAPPIST-1 c", "LHS 475 b", "GJ 1214 b", "WASP-107 b", "WASP-96 b", "55 Cnc e", "LHS 1140 b", "WASP-121 b"]);
  return (
    <div className="mt-10">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Planets with Webb spectra: radius against equilibrium temperature, log scales.">
        {[
          [1, "Earth"],
          [3.88, "Neptune"],
          [11.2, "Jupiter"],
        ].map(([r, l]) => (
          <g key={l as string}>
            <line x1={pad.l} x2={W - pad.r} y1={ly(r as number)} y2={ly(r as number)} stroke="rgba(255,255,255,0.07)" strokeDasharray="4 4" />
            <text x={W - pad.r} y={ly(r as number) - 5} textAnchor="end" className="fill-[#8a8d98] font-mono text-[10px]">
              {l} size
            </text>
          </g>
        ))}
        <rect x={pad.l} y={pad.t} width={lx(400) - pad.l} height={H - pad.t - pad.b} fill="rgba(127,212,255,0.04)" />
        <text x={pad.l + 6} y={pad.t + 14} className="fill-[#7fd4ff] font-mono text-[10px]">
          &lt; 400 K
        </text>
        {[200, 300, 500, 1000, 2000, 3000].map((t) => (
          <text key={t} x={lx(t)} y={H - 16} textAnchor="middle" className="fill-[#8a8d98] font-mono text-[10px]">
            {t} K
          </text>
        ))}
        <text x={pad.l} y={H - 2} className="fill-[#5b5e69] font-mono text-[10px]">
          equilibrium temperature →
        </text>
        {[0.5, 1, 2, 4, 10, 20].map((r) => (
          <text key={r} x={pad.l - 10} y={ly(r) + 3} textAnchor="end" className="fill-[#8a8d98] font-mono text-[10px]">
            {r} R⊕
          </text>
        ))}
        {planets.map((p) => {
          const cx = lx(Math.min(3400, Math.max(155, p.teq)));
          const cy = ly(Math.min(24, Math.max(0.52, p.radius)));
          const r = Math.round((3 + Math.sqrt(p.spectra) * 2.2) * 10) / 10;
          return (
            <g key={p.name}>
              <circle cx={cx} cy={cy} r={r} fill={p.radius < 1.6 ? "#bb8809" : "#2a91be"} fillOpacity={0.7} stroke="#030407" strokeWidth={1}>
                <title>{`${p.name}: ${p.radius.toFixed(2)} R⊕, ${Math.round(p.teq)} K, ${p.spectra} Webb spectra`}</title>
              </circle>
              {LABELS.has(p.name) && (
                <text x={cx + r + 4} y={cy + 3} className="fill-[#b9bac2] font-mono text-[10px]">
                  {p.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 font-mono text-[10px] text-muted">
        Dot size: number of Webb spectra. Gold: rocky (&lt; 1.6 R⊕). Hover a dot for its values.
      </p>
    </div>
  );
}
