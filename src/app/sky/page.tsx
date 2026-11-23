import type { Metadata } from "next";
import { MonthlyChart } from "@/components/charts/monthly-chart";
import { Reveal } from "@/components/reveal";
import { SkyExplorer } from "@/components/sky/sky-explorer";
import { SkyFocusLink } from "@/components/sky/sky-focus-link";
import { getInstrumentShare, getMonthlyActivity, getStats, getTopCells } from "@/lib/data";
import { fmtInt, fmtMjd } from "@/lib/format";
import { CHART_INSTRUMENT, INSTRUMENTS, TYPE_LABEL } from "@/lib/instruments";
import { decToDms, raToHms } from "@/lib/sky-math";

export const metadata: Metadata = {
  title: "Sky map",
  description:
    "Every public, calibrated James Webb Space Telescope observation plotted on the real sky, with a time-lapse of the mission.",
};

export default async function SkyPage() {
  const [monthly, stats, share, top] = await Promise.all([
    getMonthlyActivity(),
    getStats(),
    getInstrumentShare(),
    getTopCells(10),
  ]);
  const shareMax = Math.max(...share.map((s) => s.n));
  const shareTotal = share.reduce((s, r) => s + r.n, 0);

  return (
    <>
      <section className="relative h-[100svh] pt-16">
        <SkyExplorer monthly={monthly} />
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-24 md:px-8 md:py-32">
          <Reveal>
            <p className="eyebrow">Webb, by the numbers</p>
            <h2 className="display mt-6 max-w-[20ch] text-[clamp(2.2rem,4.4vw,4.2rem)]">
              What the archive says about how Webb spends its time.
            </h2>
          </Reveal>

          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line md:grid-cols-4">
            {(
              [
                ["image", stats.images],
                ["spectrum", stats.spectra],
                ["cube", stats.cubes],
                ["timeseries", stats.timeseries],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="bg-ink p-6">
                <p className="eyebrow">{TYPE_LABEL[k]}</p>
                <p className="mt-3 font-mono text-3xl tabular-nums">{fmtInt(v)}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 grid gap-16 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <h3 className="text-xl font-light">Public data products by month of observation</h3>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                One calibrated product is one mosaic per filter, one spectrum per source, or one cube per pointing. The
                huge spectroscopy months are multi-object deep surveys, where NIRSpec records hundreds of galaxies in a
                single exposure. The recent drop is mostly the 12-month exclusive-access period, not inactivity.
              </p>
              <div className="mt-8">
                <MonthlyChart rows={monthly} />
              </div>
            </div>
            <div className="lg:col-span-4">
              <h3 className="text-xl font-light">Products by instrument</h3>
              <p className="mt-2 text-sm text-muted">Share of all {fmtInt(shareTotal)} public science products.</p>
              <ul className="mt-8 space-y-5">
                {share.map((s) => {
                  const inst = INSTRUMENTS.find((i) => i.key === s.instrument.toUpperCase());
                  return (
                    <li key={s.instrument}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span>{inst?.label ?? s.instrument}</span>
                        <span className="font-mono text-xs tabular-nums text-fg-2">
                          {fmtInt(s.n)} <span className="text-muted">· {((s.n / shareTotal) * 100).toFixed(1)}%</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(s.n / shareMax) * 100}%`,
                            background: CHART_INSTRUMENT[s.instrument.toUpperCase()] ?? "#6b7280",
                          }}
                        />
                      </div>
                      {inst && <p className="mt-1.5 text-xs text-muted">{inst.role} · {inst.range}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="mt-24">
            <h3 className="text-xl font-light">The most-studied patches of sky</h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Ranked by number of public products in a 0.2° cell. Deep extragalactic fields dominate, because every
              galaxy spectrum counts as a product.
            </p>
            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="eyebrow border-b border-line">
                  <tr>
                    <th className="py-3 pr-4 font-normal">#</th>
                    <th className="py-3 pr-4 font-normal">Field (most common target name)</th>
                    <th className="py-3 pr-4 font-normal">RA</th>
                    <th className="py-3 pr-4 font-normal">Dec</th>
                    <th className="py-3 pr-4 text-right font-normal">Products</th>
                    <th className="py-3 pr-4 text-right font-normal">Programmes</th>
                    <th className="py-3 text-right font-normal">First observed</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((c, i) => (
                    <tr key={c.id} className="border-b border-line text-fg-2 transition hover:bg-white/[0.02]">
                      <td className="py-3 pr-4 font-mono text-xs text-gold">{String(i + 1).padStart(2, "0")}</td>
                      <td className="py-3 pr-4 text-fg">
                        <SkyFocusLink ra={c.ra} dec={c.dec} fov={3} className="link-underline">
                          {c.target ?? "Unnamed"}
                        </SkyFocusLink>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">{raToHms(c.ra)}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{decToDms(c.dec)}</td>
                      <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums">{fmtInt(c.n_products)}</td>
                      <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums">{c.n_programs}</td>
                      <td className="py-3 text-right font-mono text-xs">{fmtMjd(c.first_mjd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-24 grid gap-10 border-t border-line pt-12 text-sm leading-relaxed text-muted md:grid-cols-3">
            <div>
              <p className="eyebrow mb-3 text-fg-2">Source</p>
              Every public, calibrated (level-3) science product in MAST&apos;s CAOM catalogue for JWST:{" "}
              {fmtInt(stats.products)} products from {fmtInt(stats.programs)} programmes, refreshed daily. Only
              exposures flagged as science are included. Data still in its exclusive-access period is not shown.
            </div>
            <div>
              <p className="eyebrow mb-3 text-fg-2">Method</p>
              Products are binned into ~0.2° × 0.2° cells (equal-area in RA). A cell&apos;s colour mixes gold (images),
              blue (spectra and IFU cubes) and violet (time series) by product count. The time-lapse reveals each cell
              on the date of its first exposure. {fmtInt(stats.moving)} products of moving Solar System targets have no
              fixed sky position and are left out.
            </div>
            <div>
              <p className="eyebrow mb-3 text-fg-2">Background</p>
              The 5,044 stars brighter than magnitude 6 come from the Hipparcos/Yale catalogues, coloured by their B−V
              index. The Milky Way glow is a model of the galactic disc and bulge, positioned with the IAU galactic
              coordinate system. It is not a photograph.
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
