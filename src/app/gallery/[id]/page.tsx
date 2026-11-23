import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { CompareSlider } from "@/components/gallery/compare-slider";
import {
  bandColor,
  cleanTitle,
  detailRendition,
  fmtLy,
  instrumentsOf,
  INSTRUMENT_COLOR,
  lightAnchor,
  parseDistance,
  parseFov,
} from "@/components/gallery/utils";
import { sortedFilters, WavelengthBar } from "@/components/gallery/wavelength-bar";
import { ZoomViewer } from "@/components/gallery/zoom-viewer";
import { Reveal } from "@/components/reveal";
import { snapshot, zForLookback } from "@/lib/cosmology";
import { getGalleryImage, instrumentOf, type GalleryImage } from "@/lib/data";
import { getComparisonPartners, getGalleryIndex, getRawFramesNear } from "@/lib/data-gallery";
import { fmtDate, fmtMjd, prettyTarget } from "@/lib/format";
import { esaImage, esaPage, mastFile, mastSearch } from "@/lib/images";

export async function generateStaticParams() {
  const index = await getGalleryIndex();
  return index.slice(0, 40).map((g) => ({ id: g.id }));
}

export async function generateMetadata({ params }: PageProps<"/gallery/[id]">): Promise<Metadata> {
  const { id } = await params;
  const img = await getGalleryImage(id);
  if (!img) return { title: "Image not found" };
  const { title } = cleanTitle(img.title);
  const desc = img.description.find((p) => !p.startsWith("[") && !p.startsWith("•"));
  return {
    title,
    description: desc?.slice(0, 200),
    openGraph: { images: [{ url: esaImage(id, "screen") }] },
  };
}

export default function GalleryDetailPage(props: PageProps<"/gallery/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={props.params} />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <div className="pt-16">
      <div className="h-[min(78svh,920px)] min-h-[420px] w-full animate-pulse bg-ink-2" />
      <div className="mx-auto max-w-[1600px] px-5 py-16 md:px-8">
        <div className="h-4 w-40 bg-ink-3" />
        <div className="mt-6 h-16 w-2/3 bg-ink-3" />
      </div>
    </div>
  );
}

/* ───────────── helpers ───────────── */

function splitDescription(desc: string[]) {
  let alt: string | null = null;
  const body: string[] = [];
  for (const p of desc) {
    const m = p.match(/^\[?\s*Image Description:\s*(.*?)\]?$/i);
    if (m) alt = m[1];
    else body.push(p);
  }
  return { alt, body };
}

/** "North is 103.0° right of vertical" → degrees clockwise from up. */
function northAngle(orientation: string | null): number | null {
  if (!orientation) return null;
  const m = orientation.match(/([\d.]+)\s*°?\s*(right|left)/i);
  if (!m) return /north is up/i.test(orientation) ? 0 : null;
  return (m[2].toLowerCase() === "right" ? 1 : -1) * Number(m[1]);
}

function Compass({ angle }: { angle: number }) {
  // On the sky (seen from inside the celestial sphere) East is 90° counter-clockwise from North.
  return (
    <svg viewBox="-30 -30 60 60" className="h-14 w-14" aria-label={`North is ${Math.abs(angle)}° ${angle >= 0 ? "right" : "left"} of vertical`}>
      <circle r="27" fill="none" stroke="rgba(255,255,255,0.12)" />
      <g transform={`rotate(${angle})`}>
        <line x1="0" y1="0" x2="0" y2="-20" stroke="#f2c46d" strokeWidth="1.5" />
        <text x="0" y="-22" textAnchor="middle" fontSize="8" fill="#f2c46d" fontFamily="monospace">N</text>
        <line x1="0" y1="0" x2="-14" y2="0" stroke="#b9bac2" strokeWidth="1" />
        <text x="-21" y="3" textAnchor="middle" fontSize="7" fill="#b9bac2" fontFamily="monospace">E</text>
      </g>
    </svg>
  );
}

function LightCallout({ img, name }: { img: GalleryImage; name: string }) {
  const d = parseDistance(img.distance);
  if (!d) return null;
  let big: string;
  let unit: string;
  let body: string;
  let anchor: string | null = null;

  if (d.kind === "z") {
    const s = snapshot(d.z);
    big = s.lookbackGyr.toFixed(2);
    unit = "billion years in transit";
    body = `At redshift z = ${d.z}, this light set out when the universe was ${s.ageGyr.toFixed(2)} billion years old. Space has been expanding the whole way, so the source is now about ${s.comovingGly.toFixed(1)} billion light-years from us, and its light arrives stretched to ${s.stretch.toFixed(2)}× its original wavelength.`;
    anchor = lightAnchor(s.lookbackGyr * 1e9);
  } else if (d.ly >= 1e8) {
    const gyr = d.ly / 1e9;
    const z = zForLookback(gyr);
    const s = snapshot(z);
    big = fmtLy(d.ly);
    unit = "years in transit";
    body = `Read as a light-travel distance (the usual convention for press images), that is a redshift of about z ≈ ${z.toFixed(z < 0.1 ? 3 : 2)}. Space has expanded while the light was on its way, so ${name} is now roughly ${s.comovingGly.toFixed(s.comovingGly < 1 ? 2 : 1)} billion light-years away.`;
    anchor = lightAnchor(d.ly);
  } else {
    big = fmtLy(d.ly);
    unit = "years ago";
    body =
      d.ly < 100
        ? `The light in this image left ${name} within a human lifetime.`
        : `The light in this image left ${name} about ${fmtLy(d.ly)} years ago and has been crossing space ever since. You are seeing the object as it was then, not as it is now.`;
    anchor = d.ly >= 100 ? lightAnchor(d.ly) : null;
  }

  return (
    <div className="brackets mt-10 border border-line bg-ink-2/60 p-6 md:p-8">
      <p className="eyebrow">The light in this image</p>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-3">
        <span className="display text-[clamp(2.4rem,5vw,4rem)] tabular-nums text-gradient-gold">{big}</span>
        <span className="text-sm text-muted">{unit}</span>
      </p>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-2">{body}</p>
      {anchor && <p className="mt-3 max-w-2xl font-mono text-[11.5px] leading-relaxed text-muted">{anchor}</p>}
    </div>
  );
}

/* ───────────── page ───────────── */

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const img = await getGalleryImage(id);
  if (!img) notFound();

  const fovParsed = parseFov(img.fov);
  const radiusDeg = fovParsed
    ? Math.min(0.15, Math.max(0.02, Math.hypot(fovParsed.wArcsec, fovParsed.hArcsec) / 2 / 3600))
    : 0.06;

  const [index, partners, raw] = await Promise.all([
    getGalleryIndex(),
    getComparisonPartners(id),
    img.ra_deg != null && img.dec_deg != null ? getRawFramesNear(img.ra_deg, img.dec_deg, radiusDeg, 12) : Promise.resolve([]),
  ]);

  const { title, tags } = cleanTitle(img.title);
  const instruments = instrumentsOf(img);
  for (const t of tags) if (!instruments.includes(t) && INSTRUMENT_COLOR[t]) instruments.push(t);
  const otherTags = tags.filter((t) => !INSTRUMENT_COLOR[t]);
  const { alt, body } = splitDescription(img.description);
  const name = img.object_names[0] ?? title;
  const dist = parseDistance(img.distance);
  const physDistance = dist?.kind === "ly" && dist.ly < 1e8 ? dist.ly : null;
  const north = northAngle(img.orientation);
  const filters = sortedFilters(img.filters);

  const pos = index.findIndex((g) => g.id === id);
  const prev = pos > 0 ? index[pos - 1] : null;
  const next = pos >= 0 && pos < index.length - 1 ? index[pos + 1] : null;

  const rawFrames = raw;

  const partner = partners[0];

  const rows: [string, React.ReactNode][] = [];
  if (img.object_names.length) rows.push(["Object", img.object_names.join(", ")]);
  if (img.distance) rows.push(["Distance", img.distance]);
  if (img.constellation) rows.push(["Constellation", img.constellation]);
  if (img.ra_hms) rows.push(["Right ascension", img.ra_hms]);
  if (img.dec_dms) rows.push(["Declination", img.dec_dms]);
  if (img.fov) rows.push(["Field of view", img.fov]);
  if (img.release_date) rows.push(["Released", fmtDate(img.release_date, { day: "numeric", month: "long", year: "numeric" })]);
  if (img.width && img.height) rows.push(["Original size", `${img.width.toLocaleString("en-US")} × ${img.height.toLocaleString("en-US")} px`]);

  return (
    <article className="pt-16">
      {/* ── viewer ── */}
      <section className="relative border-b border-line">
        <ZoomViewer
          id={img.id}
          alt={alt ?? title}
          width={img.width}
          height={img.height}
          fov={fovParsed}
          distanceLy={physDistance}
        />
      </section>

      {/* ── title + text / metadata ── */}
      <section className="mx-auto grid max-w-[1600px] gap-14 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7 xl:col-span-8">
          <Link href="/gallery" className="eyebrow link-underline inline-flex items-center gap-2 hover:text-fg">
            <ArrowLeft className="h-3 w-3" /> Gallery
          </Link>
          <div className="mt-6 flex flex-wrap gap-2">
            {instruments.map((ins) => (
              <span key={ins} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-[10.5px] tracking-wider text-fg-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: INSTRUMENT_COLOR[ins] ?? "#9aa0a6" }} />
                {ins}
              </span>
            ))}
            {img.categories
              .filter((c) => !["NIRCam", "MIRI", "NIRSpec", "NIRISS"].includes(c))
              .map((c) => (
                <span key={c} className="rounded-full border border-line px-3 py-1 font-mono text-[10.5px] tracking-wider text-muted">
                  {c}
                </span>
              ))}
            {otherTags.map((t) => (
              <span key={t} className="rounded-full border border-line px-3 py-1 font-mono text-[10.5px] tracking-wider text-muted">
                {t}
              </span>
            ))}
          </div>
          <h1 className="display mt-6 text-[clamp(2.4rem,5.6vw,5.6rem)]">{title}</h1>

          <LightCallout img={img} name={name} />

          <div className="prose-space mt-12 max-w-3xl">
            {body.map((p, i) =>
              p.startsWith("• ") ? (
                <p key={i} className="relative !mt-3 pl-6">
                  <span className="absolute left-0 top-[0.7em] h-px w-3 bg-gold" />
                  {p.slice(2)}
                </p>
              ) : (
                <p key={i}>{p}</p>
              ),
            )}
          </div>
        </div>

        <aside className="min-w-0 lg:col-span-5 xl:col-span-4">
          <div className="glass sticky top-24 rounded-sm p-6 md:p-7">
            <div className="flex items-start justify-between gap-4">
              <p className="eyebrow">About the image</p>
              {north !== null && <Compass angle={north} />}
            </div>
            <dl className="mt-4 divide-y divide-line">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2.5 text-[13.5px]">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-fg">{v}</dd>
                </div>
              ))}
              {img.orientation && (
                <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2.5 text-[13.5px]">
                  <dt className="text-muted">Orientation</dt>
                  <dd className="text-fg">{img.orientation}</dd>
                </div>
              )}
            </dl>
            <div className="mt-6 border-t border-line pt-5">
              <p className="eyebrow !text-[9.5px]">Credit · CC BY 4.0</p>
              <p className="mt-2 text-[13px] leading-relaxed text-fg">{img.credit ?? "ESA/Webb"}</p>
            </div>
            <div className="mt-6 flex flex-col gap-2.5 text-[13px]">
              <a href={esaPage(img.id)} target="_blank" rel="noreferrer" className="group flex items-center justify-between rounded-sm border border-line px-4 py-3 transition hover:border-line-2">
                Original &amp; downloads on ESA/Webb
                <ArrowUpRight className="h-4 w-4 text-muted transition group-hover:text-fg" />
              </a>
              {img.ra_deg != null && img.dec_deg != null && (
                <Link
                  href={`/sky?ra=${img.ra_deg.toFixed(4)}&dec=${img.dec_deg.toFixed(4)}`}
                  className="group flex items-center justify-between rounded-sm border border-line px-4 py-3 transition hover:border-line-2"
                >
                  Locate on the sky map
                  <ArrowUpRight className="h-4 w-4 text-muted transition group-hover:text-fg" />
                </Link>
              )}
            </div>
          </div>
        </aside>
      </section>

      {/* ── colours & filters ── */}
      {filters.length > 0 && (
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-[1600px] gap-12 px-5 py-20 md:px-8 md:py-28 lg:grid-cols-12">
            <Reveal className="min-w-0 lg:col-span-4">
              <p className="eyebrow">Colours &amp; filters</p>
              <h2 className="display mt-5 text-[clamp(1.9rem,3.2vw,3rem)]">How invisible light became this picture.</h2>
              <p className="mt-6 text-[15px] leading-relaxed text-fg-2">
                Each filter isolates one slice of the spectrum and produces a grayscale exposure. The image processors
                then map wavelength onto hue in <em>chromatic order</em>, shortest to blue and longest to red, the
                same ordering your eye uses for visible light. Colours are therefore a faithful ranking of
                wavelength, compressed from the infrared into the visible band.
              </p>
              <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
                Narrow-band filters isolate one emission line: hydrogen (Paschen-α at 1.87 μm), molecular hydrogen
                (4.7 μm), or carbon-rich molecules called PAHs (3.3 and 7.7 μm). The composite maps where that chemistry
                happens.
              </p>
            </Reveal>
            <div className="min-w-0 lg:col-span-8">
              <WavelengthBar filters={img.filters} />
              <div className="mt-8 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[13.5px]">
                  <thead>
                    <tr className="border-b border-line font-mono text-[10px] tracking-[0.18em] text-muted uppercase">
                      <th className="py-3 pr-4 font-normal">Assigned colour</th>
                      <th className="py-3 pr-4 font-normal">Wavelength</th>
                      <th className="py-3 pr-4 font-normal">Band</th>
                      <th className="py-3 font-normal">Instrument</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filters.map((f, i) => (
                      <tr key={i} className="border-b border-line/60">
                        <td className="py-3 pr-4">
                          <span className="flex items-center gap-3">
                            <span className="h-3 w-3 rounded-full" style={{ background: bandColor(f.color), boxShadow: `0 0 10px ${bandColor(f.color)}` }} />
                            {f.color}
                          </span>
                        </td>
                        <td className="py-3 pr-4 font-mono tabular-nums">{f.wavelength}</td>
                        <td className="py-3 pr-4 text-fg-2">
                          {f.band}
                          {f.label && <span className="text-muted"> · {f.label}</span>}
                        </td>
                        <td className="py-3">
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: INSTRUMENT_COLOR[f.instrument] ?? "#9aa0a6" }} />
                            {f.instrument || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── comparison with a registered partner rendition ── */}
      {partner && partner.width && partner.height && (
        <section className="border-t border-line">
          <div className="mx-auto max-w-[1600px] px-5 py-20 md:px-8 md:py-28">
            <Reveal>
              <p className="eyebrow">Compare</p>
              <h2 className="display mt-5 text-[clamp(1.9rem,3.2vw,3rem)]">Same field, another view.</h2>
              <p className="mt-4 max-w-2xl text-[15px] text-fg-2">
                ESA published{" "}
                <Link href={`/gallery/${partner.id}`} className="link-underline text-fg">
                  {cleanTitle(partner.title).title}
                </Link>{" "}
                at exactly the same dimensions and framing. Drag the divider to compare.
              </p>
            </Reveal>
            <div className="mx-auto mt-10 max-w-5xl">
              <CompareSlider
                left={{ src: esaImage(img.id, detailRendition(img.width, img.height)), label: compareLabel(img, partner), sub: undefined }}
                right={{ src: esaImage(partner.id, detailRendition(partner.width, partner.height)), label: compareLabel(partner, img), sub: undefined }}
                aspect={partner.width / partner.height}
                alt={title}
                className="rounded-sm border border-line"
              />
              <p className="mt-3 text-[11.5px] text-dim">
                Left: {img.credit}. Right: {partner.credit}.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── raw data ── */}
      {rawFrames.length > 0 && (
        <section className="border-t border-line">
          <div className="mx-auto max-w-[1600px] px-5 py-20 md:px-8 md:py-28">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <Reveal>
                <p className="eyebrow">The raw data behind this image</p>
                <h2 className="display mt-5 text-[clamp(1.9rem,3.2vw,3rem)]">Straight from the archive.</h2>
                <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-2">
                  Public, pipeline-calibrated Webb mosaics within {(radiusDeg * 60).toFixed(1)}′ of this position in
                  NASA&apos;s MAST archive: one frame per instrument and filter, shown as the pipeline produced them, in
                  grayscale with detector seams and edge artefacts left in. Composites like the one above start here.
                </p>
              </Reveal>
              <Link href="/lab" className="link-underline font-mono text-[11px] tracking-[0.2em] text-gold uppercase">
                Combine raw frames in the Lab →
              </Link>
            </div>
            <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {rawFrames.map((p) => {
                const inst = instrumentOf(p.instrument);
                return (
                  <a
                    key={p.obsid}
                    href={mastSearch(p.obs_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="group block"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-sm border border-line bg-black">
                      <Image
                        src={mastFile(p.jpeg_url!)}
                        alt={`Raw ${inst.label} ${p.filters ?? ""} frame of ${prettyTarget(p.target_name)}`}
                        fill
                        sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
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
                    <p className="mt-3 truncate text-sm">{prettyTarget(p.target_name)}</p>
                    <p className="mt-1 truncate font-mono text-[10.5px] text-muted">
                      PID {p.proposal_id} · {fmtMjd(p.t_min)} <span className="text-dim group-hover:text-gold">· MAST ↗</span>
                    </p>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── prev / next ── */}
      <nav className="border-t border-line">
        <div className="mx-auto grid max-w-[1600px] md:grid-cols-2">
          {prev ? (
            <Link href={`/gallery/${prev.id}`} className="group relative flex min-h-48 items-end overflow-hidden border-line p-8 md:border-r md:p-10">
              <Image src={esaImage(prev.id, "thumb700x")} alt="" fill sizes="50vw" className="object-cover opacity-25 transition duration-700 group-hover:scale-105 group-hover:opacity-45" />
              <div className="relative">
                <p className="eyebrow flex items-center gap-2"><ArrowLeft className="h-3 w-3" /> Previous</p>
                <p className="mt-3 text-2xl font-light tracking-tight">{cleanTitle(prev.title).title}</p>
              </div>
            </Link>
          ) : (
            <div />
          )}
          {next && (
            <Link href={`/gallery/${next.id}`} className="group relative flex min-h-48 items-end justify-end overflow-hidden border-t border-line p-8 text-right md:border-t-0 md:p-10">
              <Image src={esaImage(next.id, "thumb700x")} alt="" fill sizes="50vw" className="object-cover opacity-25 transition duration-700 group-hover:scale-105 group-hover:opacity-45" />
              <div className="relative">
                <p className="eyebrow flex items-center justify-end gap-2">Next <ArrowRight className="h-3 w-3" /></p>
                <p className="mt-3 text-2xl font-light tracking-tight">{cleanTitle(next.title).title}</p>
              </div>
            </Link>
          )}
        </div>
      </nav>
    </article>
  );
}

/** Short side label for a comparison: what distinguishes this rendition from the other. */
function compareLabel(a: GalleryImage, b: GalleryImage): string {
  const ta = cleanTitle(a.title);
  const tb = cleanTitle(b.title);
  const ia = instrumentsOf(a).concat(ta.tags);
  const ib = instrumentsOf(b).concat(tb.tags);
  const diff = [...new Set(ia.filter((x) => !ib.includes(x)))];
  if (diff.length) return diff.join(" + ");
  if (/hubble/i.test(a.title) && !/hubble/i.test(b.title)) return "Hubble";
  if (/webb/i.test(a.title) && !/webb/i.test(b.title)) return "Webb";
  const date = a.title.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\b(19|20)\d{2}\b/);
  if (date) return date[0];
  return ta.title.length > 28 ? ta.title.slice(0, 26) + "…" : ta.title;
}
