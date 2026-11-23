import type { Metadata } from "next";
import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ARCHIVE_PAGE_SIZE, getStats, searchArchive, type ArchiveQuery } from "@/lib/data";
import { fmtInt, fmtMjd, prettyTarget } from "@/lib/format";
import { mastFile, mastSearch } from "@/lib/images";
import { CHART_TYPE, INSTRUMENTS, instrumentOf, TYPE_LABEL } from "@/lib/instruments";
import { decToDms, raToHms } from "@/lib/sky-math";

export const metadata: Metadata = {
  title: "Archive",
  description: "Search every public, calibrated James Webb Space Telescope science product by target, programme, PI or instrument.",
};

type SP = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const SUGGESTIONS = ["Carina", "TRAPPIST-1", "JADES", "Jupiter", "Orion", "M16", "Sgr A*", "WASP-39", "COSMOS", "2731"];

export default function ArchivePage(props: { searchParams: SP }) {
  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto max-w-[1600px] px-5 pb-14 pt-36 md:px-8">
          <p className="eyebrow">The raw archive</p>
          <h1 className="display mt-6 max-w-[18ch] text-[clamp(2.8rem,6vw,6rem)]">Every public Webb product, searchable.</h1>
          <Suspense fallback={<p className="mt-6 h-6" />}>
            <ArchiveIntro />
          </Suspense>
        </div>
      </section>
      <Suspense fallback={<ArchiveSkeleton />}>
        <ArchiveResults searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function ArchiveIntro() {
  const stats = await getStats();
  return (
    <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-fg-2">
      {fmtInt(stats.products)} calibrated science products from {fmtInt(stats.programs)} programmes, mirrored from
      NASA&apos;s MAST archive and refreshed daily. Search by target, programme ID, principal investigator or observation
      ID. Every row links straight to the original data.
    </p>
  );
}

function ArchiveSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] px-5 py-10 md:px-8">
      <div className="h-14 animate-pulse rounded-full bg-white/5" />
      <div className="mt-10 space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-sm bg-white/[0.03]" />
        ))}
      </div>
    </div>
  );
}

async function ArchiveResults({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const query: ArchiveQuery = {
    q: one(sp.q),
    type: one(sp.type),
    inst: one(sp.inst).toUpperCase(),
    sort: one(sp.sort) === "released" ? "released" : "observed",
    page: Number(one(sp.page)) || 1,
  };
  const { rows, total, programs } = await searchArchive(query);
  const pages = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
  const href = (patch: Partial<Record<keyof ArchiveQuery, string | number>>) => {
    const p = new URLSearchParams();
    const merged = { ...query, ...patch } as Record<string, string | number>;
    for (const k of ["q", "type", "inst", "sort", "page"]) {
      const v = merged[k];
      if (v && !(k === "page" && v === 1) && !(k === "sort" && v === "observed")) p.set(k, k === "inst" ? String(v).toLowerCase() : String(v));
    }
    const s = p.toString();
    return s ? `/archive?${s}` : "/archive";
  };

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-10 md:px-8">
      {/* search */}
      <Form action="/archive" className="glass flex items-center gap-3 rounded-full py-2 pl-6 pr-2">
        <input
          name="q"
          defaultValue={query.q}
          placeholder="Target, programme ID, PI, obs_id…"
          className="w-full bg-transparent py-2 text-[15px] text-fg outline-none placeholder:text-dim"
          aria-label="Search the archive"
        />
        {query.type && <input type="hidden" name="type" value={query.type} />}
        {query.inst && <input type="hidden" name="inst" value={query.inst.toLowerCase()} />}
        {query.sort === "released" && <input type="hidden" name="sort" value="released" />}
        <button className="shrink-0 rounded-full bg-fg px-6 py-2.5 text-sm font-medium text-ink transition hover:bg-gold">Search</button>
      </Form>

      {!query.q && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
          Try:
          {SUGGESTIONS.map((s) => (
            <Link key={s} href={href({ q: s, page: 1 })} className="rounded-full border border-line px-3 py-1 text-fg-2 hover:border-fg hover:text-fg">
              {s}
            </Link>
          ))}
        </div>
      )}

      {/* facets */}
      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-2">Type</span>
          {(["", "image", "spectrum", "cube", "timeseries"] as const).map((t) => (
            <Link
              key={t || "all"}
              href={href({ type: t, page: 1 })}
              className={
                "rounded-full border px-3 py-1 text-xs transition " +
                (query.type === t ? "border-fg bg-fg text-ink" : "border-line text-fg-2 hover:border-line-2")
              }
            >
              {t ? TYPE_LABEL[t] : "All"}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-2">Instrument</span>
          {[{ key: "", label: "All", color: "" }, ...INSTRUMENTS].map((i) => (
            <Link
              key={i.key || "all"}
              href={href({ inst: i.key.toLowerCase(), page: 1 })}
              className={
                "rounded-full border px-3 py-1 font-mono text-[11px] transition " +
                (query.inst === i.key ? "text-ink" : "border-line text-fg-2 hover:border-line-2")
              }
              style={query.inst === i.key ? { background: i.color || "#ecebe7", borderColor: i.color || "#ecebe7" } : undefined}
            >
              {i.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="eyebrow mr-2">Sort</span>
          {(["observed", "released"] as const).map((s) => (
            <Link
              key={s}
              href={href({ sort: s, page: 1 })}
              className={"rounded-full border px-3 py-1 text-xs " + (query.sort === s ? "border-fg text-fg" : "border-line text-muted hover:text-fg")}
            >
              {s === "observed" ? "Observation date" : "Public release"}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-12">
        {/* results */}
        <div className="lg:col-span-9">
          <p className="font-mono text-[11px] text-muted">
            {fmtInt(total)} product{total === 1 ? "" : "s"}
            {query.q && (
              <>
                {" "}
                matching <span className="text-fg">&ldquo;{query.q}&rdquo;</span>
              </>
            )}{" "}
            · page {Math.min(query.page, pages)} of {fmtInt(pages)}
          </p>

          {rows.length === 0 ? (
            <div className="mt-10 rounded-sm border border-line p-10 text-center text-fg-2">
              Nothing public matches that yet. Data may still be in its exclusive-access period.
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {rows.map((r) => {
                const inst = instrumentOf(r.instrument);
                return (
                  <li key={r.obsid} className="group grid grid-cols-[72px_1fr] gap-4 py-4 md:grid-cols-[88px_1fr_auto]">
                    <div className="relative h-[72px] w-[72px] overflow-hidden rounded-sm border border-line bg-ink-2 md:h-[88px] md:w-[88px]">
                      {r.jpeg_url ? (
                        <Image
                          // MAST's own 128 px quick-look thumbnail (~3 KB): served directly, no optimizer pass.
                          src={mastFile(r.jpeg_url.replace(/\.jpg$/, "_thumb.jpg"))}
                          alt=""
                          fill
                          unoptimized
                          className="object-cover grayscale transition duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="grid h-full place-items-center">
                          <span className="h-1 w-8 rounded-full" style={{ background: CHART_TYPE[r.product_type as keyof typeof CHART_TYPE] ?? "#5b5e69" }} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full px-2 py-px font-mono text-[9.5px] text-ink" style={{ background: inst.color }}>
                          {r.instrument}
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {TYPE_LABEL[r.product_type as keyof typeof TYPE_LABEL] ?? r.product_type} · {r.filters}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-[15px]">{prettyTarget(r.target_name)}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        <Link href={href({ q: String(r.proposal_id), page: 1 })} className="text-fg-2 hover:text-gold">
                          PID {r.proposal_id}
                        </Link>{" "}
                        · {r.title} {r.proposal_pi && <>· PI {r.proposal_pi}</>}
                      </p>
                    </div>
                    <div className="col-span-2 flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-1 font-mono text-[10.5px] text-muted md:col-span-1 md:flex-col md:flex-nowrap md:items-end md:justify-center md:text-right">
                      <span>
                        observed <span className="text-fg-2">{fmtMjd(r.t_min)}</span>
                      </span>
                      <span>public {fmtMjd(r.release_mjd)}</span>
                      {r.ra != null && r.dec != null && (
                        <Link href={`/sky?ra=${r.ra.toFixed(3)}&dec=${r.dec.toFixed(3)}&fov=3`} className="hover:text-gold">
                          {raToHms(r.ra)} {decToDms(r.dec)}
                        </Link>
                      )}
                      <a href={mastSearch(r.obs_id)} target="_blank" rel="noreferrer" className="break-all text-fg-2 hover:text-gold">
                        {r.obs_id} ↗
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {pages > 1 && (
            <nav className="mt-8 flex items-center justify-between font-mono text-xs" aria-label="Pagination">
              {query.page > 1 ? (
                <Link href={href({ page: query.page - 1 })} className="rounded-full border border-line px-4 py-2 hover:border-fg">
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted">
                {query.page} / {fmtInt(pages)}
              </span>
              {query.page < pages ? (
                <Link href={href({ page: query.page + 1 })} className="rounded-full border border-line px-4 py-2 hover:border-fg">
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>

        {/* programmes */}
        <aside className="lg:col-span-3">
          <p className="eyebrow mb-4">Top programmes in these results</p>
          <ul className="space-y-3">
            {programs.map((p) => (
              <li key={p.id}>
                <a
                  href={`https://www.stsci.edu/jwst/science-execution/program-information?id=${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-sm border border-line p-3.5 transition hover:border-line-2"
                >
                  <p className="font-mono text-[10px] text-gold">
                    PID {p.id} · {fmtInt(p.n)} products
                  </p>
                  <p className="mt-1 text-sm leading-snug text-fg-2">{p.title}</p>
                  {p.pi && <p className="mt-1 text-xs text-muted">PI {p.pi}</p>}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-xs leading-relaxed text-muted">
            Previews are the pipeline&apos;s own single-filter quick-looks: unprocessed, uncoloured, with detector gaps and
            edges left in. That is what Webb data looks like before an imaging specialist gets to it.
          </p>
        </aside>
      </div>
    </div>
  );
}
