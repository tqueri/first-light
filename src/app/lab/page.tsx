import type { Metadata } from "next";
import { LabStudio } from "@/components/lab/lab-studio";
import { TRACES } from "@/lib/lab/filters";
import type { LabManifest } from "@/lib/lab/types";
import manifestJson from "../../../public/lab/manifest.json";

export const metadata: Metadata = {
  title: "Lab — build a colour image from raw Webb frames",
  description:
    "A WebGL darkroom for James Webb Space Telescope data: combine the raw single-filter frames of the Cosmic Cliffs, the Pillars of Creation, the Southern Ring and more into your own colour composite.",
};

const manifest = manifestJson as LabManifest;
const mastFile = (obsId: string) => `https://mast.stsci.edu/portal/Download/file?uri=mast:JWST/product/${obsId}_i2d.jpg`;

const STEPS = [
  {
    t: "Webb counts photons, not colours",
    b: "NIRCam's mercury-cadmium-telluride detectors and MIRI's arsenic-doped silicon detectors record how many photons reach each pixel, not what colour they were. Colour comes from filters: each exposure passes one band of wavelengths. What the telescope delivers is a stack of grayscale frames, exactly like the ones loaded above.",
  },
  {
    t: "Colour is a translation",
    b: "All of Webb's light is infrared, beyond the ~0.7 μm limit of human vision. To show it, image processors map each filter to a visible hue. The usual convention is chromatic ordering: shortest wavelength → blue, longest → red, so the order of the spectrum is preserved. A region that looks redder really is brighter at longer wavelengths. The colours are representative, not invented.",
  },
  {
    t: "Black, white and stretch",
    b: "A star can be millions of times brighter than the faint nebulosity beside it, so no screen can show both linearly. The black point removes the sky's background pedestal and the white point sets where a frame saturates. The stretch compresses everything in between: a power law (γ), or the inverse hyperbolic sine (asinh), which stays linear for faint signal and turns logarithmic for bright signal.",
  },
  {
    t: "Balance is a judgement call",
    b: "Narrow-band filters such as F187N (Paschen-α) collect far fewer photons than wide ones, so imagers boost them to bring out the gas they trace. ESA's palettes do this too, and they don't always follow strict chromatic order: in the Cosmic Cliffs, molecular hydrogen at 4.7 μm is yellow while 4.44 μm is red. Every published Webb image involves choices like these.",
  },
];

export default function LabPage() {
  const datasets = manifest.datasets;
  return (
    <>
      <section className="pt-16">
        <LabStudio datasets={datasets} />
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-[1600px] px-5 py-24 md:px-8 md:py-32">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-5">
              <p className="eyebrow">How a Webb image is made</p>
              <h2 className="display mt-6 text-[clamp(2.2rem,4.4vw,4.2rem)]">There is no colour in a Webb image. Until someone puts it there.</h2>
            </div>
            <div className="md:col-span-7 md:pt-3">
              <p className="text-[17px] leading-[1.75] text-fg-2">
                Every frame in this lab is a real, public data product from MAST, the archive where all Webb data
                ends up. Nothing has been retouched. Each frame shows one filter, one band of infrared light, one
                number per pixel. You decide which colour each band gets and how bright, which is the same job the
                imaging teams at STScI and ESA do for the press images.
              </p>
            </div>
          </div>

          <ol className="mt-20 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.t} className="bg-ink p-8">
                <span className="font-mono text-xs text-gold">0{i + 1}</span>
                <h3 className="mt-6 text-xl font-light tracking-tight">{s.t}</h3>
                <p className="mt-4 text-[14.5px] leading-relaxed text-fg-2">{s.b}</p>
              </li>
            ))}
          </ol>

          <div className="mt-20 grid gap-12 md:grid-cols-12">
            <div className="md:col-span-4">
              <p className="eyebrow">Read the bands</p>
              <h3 className="mt-5 text-3xl font-light tracking-tight">What each filter is tuned to</h3>
              <p className="mt-5 text-[15px] leading-relaxed text-muted">
                The filter name gives its central wavelength in hundredths of a micron, then its width: <span className="font-mono text-fg-2">W</span>{" "}
                for wide, <span className="font-mono text-fg-2">M</span> for medium, <span className="font-mono text-fg-2">N</span> for narrow.
                F187N is a narrow filter at 1.87 μm. Narrow filters isolate a single emission line, so they work like a
                chemical map.
              </p>
            </div>
            <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2 md:col-span-8">
              {["F187N", "F212N", "F335M", "F405N", "F470N", "F770W", "F1130W", "F1280W"].map((n) => (
                <div key={n} className="border-t border-line pt-4">
                  <dt className="flex items-baseline gap-3">
                    <span className="font-mono text-[15px] text-gold">{n}</span>
                    <span className="text-[13px] text-fg-2">{TRACES[n].short}</span>
                  </dt>
                  <dd className="mt-2 text-[13.5px] leading-relaxed text-muted">{TRACES[n].long}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-24">
            <p className="eyebrow">Provenance</p>
            <h3 className="mt-5 text-3xl font-light tracking-tight">The raw frames, and how they were aligned</h3>
            <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-muted">
              These are MAST&apos;s quick-look previews of the calibrated level-3 mosaics: 8-bit JPEGs that the pipeline
              has already stretched. Professional processing starts from the 32-bit FITS files, which keep the full
              dynamic range. NIRCam&apos;s long-wavelength channel (0.063″ pixels) is mapped onto a slightly rotated grid
              relative to the short-wavelength channel (0.031″ pixels), so we registered every frame to a reference
              by matching the stars they have in common, typically hundreds of them, to a fraction of a pixel.
              Diffraction spikes, detector seams and faint striping are real features of the data.
            </p>
            <div className="mt-10 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">
                  <tr className="border-b border-line">
                    <th className="py-3 pr-4 font-normal">Dataset</th>
                    <th className="py-3 pr-4 font-normal">Programme</th>
                    <th className="py-3 pr-4 font-normal">Observed</th>
                    <th className="py-3 font-normal">Raw frames (MAST)</th>
                  </tr>
                </thead>
                <tbody>
                  {datasets.map((d) => (
                    <tr key={d.slug} className="border-b border-line align-top">
                      <td className="py-4 pr-4">
                        <span className="text-fg">{d.title}</span>
                        <span className="block text-muted">
                          {d.instrument} · {d.target}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-fg-2">
                        <span className="font-mono">{d.programme}</span>
                        <span className="block text-muted">PI {d.pi}</span>
                      </td>
                      <td className="py-4 pr-4 font-mono text-fg-2">{d.observed}</td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {d.filters.map((f) => (
                            <a
                              key={f.name}
                              href={mastFile(f.obs_id)}
                              target="_blank"
                              rel="noreferrer"
                              title={
                                f.registration.method === "matched" || f.registration.method === "seeded"
                                  ? `${f.obs_id} · aligned on ${f.registration.patches} stars, residual ${f.registration.rms_px} px`
                                  : `${f.obs_id} · ${f.registration.method}`
                              }
                              className="rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] text-fg-2 transition hover:border-gold hover:text-gold"
                            >
                              {f.name}
                            </a>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 font-mono text-[10.5px] text-dim">
              Data: NASA, ESA, CSA, STScI via the Mikulski Archive for Space Telescopes. ESA palettes from esawebb.org
              (CC BY 4.0).
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
