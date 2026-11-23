import Link from "next/link";
import { NAV } from "@/lib/nav";
import { MirrorLogo } from "./mirror-logo";

export function SiteFooter() {
  return (
    <footer className="relative border-t border-line bg-ink">
      <div className="mx-auto grid max-w-[1600px] gap-12 px-5 py-16 md:grid-cols-12 md:px-8">
        <div className="md:col-span-4">
          <div className="flex items-center gap-3">
            <MirrorLogo className="h-8 w-8" />
            <span className="font-mono text-[12px] tracking-[0.32em]">FIRST&nbsp;LIGHT</span>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
            An independent explorer built on the public data of the James Webb Space Telescope. Not affiliated with
            NASA, ESA, CSA or STScI.
          </p>
        </div>
        <div className="md:col-span-3">
          <p className="eyebrow mb-4">Explore</p>
          <ul className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="link-underline text-fg-2 hover:text-fg">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-5">
          <p className="eyebrow mb-4">Data &amp; credits</p>
          <ul className="space-y-3 text-sm leading-relaxed text-muted">
            <li>
              Observation metadata and raw previews:{" "}
              <a className="text-fg-2 link-underline" href="https://mast.stsci.edu" target="_blank" rel="noreferrer">
                MAST
              </a>{" "}
              (Mikulski Archive for Space Telescopes, STScI).
            </li>
            <li>
              Colour images and captions:{" "}
              <a className="text-fg-2 link-underline" href="https://esawebb.org" target="_blank" rel="noreferrer">
                ESA/Webb
              </a>
              , CC BY 4.0 — each image carries its own credit line.
            </li>
            <li>
              Exoplanet spectra:{" "}
              <a
                className="text-fg-2 link-underline"
                href="https://exoplanetarchive.ipac.caltech.edu"
                target="_blank"
                rel="noreferrer"
              >
                NASA Exoplanet Archive
              </a>{" "}
              (Caltech/IPAC).
            </li>
            <li>
              Star catalogue &amp; constellations:{" "}
              <a
                className="text-fg-2 link-underline"
                href="https://github.com/ofrohn/d3-celestial"
                target="_blank"
                rel="noreferrer"
              >
                d3-celestial
              </a>{" "}
              (BSD-3), derived from the Hipparcos &amp; Yale Bright Star catalogues.
            </li>
            <li>Cosmology: flat ΛCDM, Planck 2018 parameters, computed live in your browser.</li>
          </ul>
        </div>
      </div>
      <div className="hairline" />
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-6 font-mono text-[10px] tracking-[0.2em] text-dim uppercase md:px-8">
        <span>Webb · Sun–Earth L2 · 1.5 million km from Earth</span>
        <span>Data refreshed daily from public archives</span>
      </div>
    </footer>
  );
}
