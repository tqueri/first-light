/**
 * ESA/Webb image archive scraper (esawebb.org — images are CC BY 4.0).
 * Pulls ESA's own curated "Top 100" list and each image's metadata page.
 */
import { parse, type HTMLElement } from "node-html-parser";
import type { PrismaClient } from "@/generated/prisma/client";

const BASE = "https://esawebb.org";
const UA = "FirstLight-WebbExplorer/1.0 (educational, non-commercial)";

export type EsaFilter = { color: string; band: string; label: string | null; wavelength: string; instrument: string };
export type EsaImage = {
  id: string;
  rank: number;
  title: string;
  description: string[];
  credit: string | null;
  releaseDate: string | null;
  width: number | null;
  height: number | null;
  objectNames: string[];
  distance: string | null;
  constellation: string | null;
  categories: string[];
  raHms: string | null;
  decDms: string | null;
  raDeg: number | null;
  decDeg: number | null;
  fov: string | null;
  orientation: string | null;
  filters: EsaFilter[];
};

async function get(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      // esawebb serves UTF-8 but some legacy text contains U+FFFD where curly quotes/dashes were.
      return new TextDecoder("utf-8").decode(await res.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

/** Repair U+FFFD replacement characters that stand in for typographic punctuation. */
export function repairPunctuation(s: string): string {
  return s
    .replace(/(\p{L})�(\p{L})/gu, "$1’$2")
    .replace(/\s�\s/g, " — ")
    .replace(/(^|[\s(\[])�/g, "$1“")
    .replace(/�/g, "”");
}

const clean = (s: string) =>
  repairPunctuation(
    s
      .replace(/&mu;/g, "μ")
      .replace(/&deg;?/g, "°")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim(),
  );

const text = (el: HTMLElement | null | undefined) => (el ? clean(el.textContent) : "");

/** Webb's first images (July 2022) first, then ESA's ranked "Top 100" pages. */
export async function listTop100(): Promise<string[]> {
  const ids: string[] = [];
  const collect = (html: string) => {
    let added = 0;
    for (const m of html.matchAll(/href="\/images\/([a-z0-9-]+)\/"/g)) {
      const id = m[1];
      if (["potm", "search", "archive"].includes(id)) continue;
      if (!ids.includes(id)) {
        ids.push(id);
        added++;
      }
    }
    return added;
  };
  collect(await get(`${BASE}/images/archive/category/firstimages/`));
  collect(await get(`${BASE}/images/archive/top100/`));
  for (let page = 2; page <= 6; page++) {
    try {
      if (collect(await get(`${BASE}/images/archive/top100/page/${page}/`)) === 0) break;
    } catch {
      break;
    }
  }
  return ids;
}

function hmsToDeg(hms: string): number | null {
  const m = hms.match(/(-?\d+)\s+(\d+)\s+([\d.]+)/);
  if (!m) return null;
  return (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * 15;
}
function dmsToDeg(dms: string): number | null {
  const m = dms.replace(/[°'"″′]/g, " ").match(/([+-−]?)\s*(\d+)\s+(\d+)\s+([\d.]+)/);
  if (!m) return null;
  const sign = m[1] === "-" || m[1] === "−" || dms.trim().startsWith("-") ? -1 : 1;
  return sign * (Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600);
}

export async function fetchImage(id: string, rank: number): Promise<EsaImage> {
  const html = await get(`${BASE}/images/${id}/`);
  const root = parse(html);

  const title = text(root.querySelector("h1"));

  // Description: block elements between the hero image and "Credit:".
  const startIdx = html.indexOf("<h1");
  const creditIdx = html.indexOf("<strong>Credit:</strong>", startIdx);
  const descHtml = creditIdx > 0 ? html.slice(startIdx, creditIdx) : "";
  const descRoot = parse(descHtml);
  const description: string[] = [];
  for (const el of descRoot.querySelectorAll("p, li")) {
    if (el.tagName === "P" && el.querySelector("p")) continue; // wrapper paragraph
    const t = text(el);
    if (!t || /^For a full array of Webb/i.test(t)) continue;
    description.push(el.tagName === "LI" ? `• ${t}` : t);
  }

  const credit = text(root.querySelector("div.credit")) || null;

  // Every "<th scope=row>Label:</th><td>value</td>" row on the page.
  const rows = new Map<string, HTMLElement>();
  for (const tr of root.querySelectorAll("tr")) {
    const th = tr.querySelector("th");
    const td = tr.querySelector("td");
    if (th && td) rows.set(text(th).replace(/:$/, ""), td);
  }
  const row = (k: string) => (rows.get(k) ? text(rows.get(k)) : null);

  const size = row("Size")?.match(/(\d+)\s*x\s*(\d+)/);
  const releaseRaw = row("Release date");
  const releaseDate = releaseRaw ? new Date(releaseRaw.replace(",", "") + " UTC") : null;
  const nameTd = rows.get("Name");
  const objectNames = nameTd
    ? nameTd.querySelectorAll("a").map((a) => text(a)).filter(Boolean)
    : [];
  if (nameTd && objectNames.length === 0) objectNames.push(...text(nameTd).split(",").map((s) => s.trim()).filter(Boolean));
  const catTd = rows.get("Category");
  const categories = catTd ? catTd.querySelectorAll("a").map((a) => text(a)) : [];
  const raHms = row("Position (RA)");
  const decDms = row("Position (Dec)");

  const filters: EsaFilter[] = [];
  const ftable = root.querySelector("#object_observation_div table");
  if (ftable) {
    for (const tr of ftable.querySelectorAll("tr").slice(1)) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 3) continue;
      const span = tds[0].querySelector("span[class^=band_]");
      const color = span?.getAttribute("class")?.replace("band_", "") ?? "";
      const label = text(tds[0].querySelector(".band_instrument")) || null;
      const band = text(tds[0]).replace(/\(.*?\)/g, "").replace(label ?? "\u0000", "").trim();
      const links = tds[2].querySelectorAll("a").map((a) => text(a));
      filters.push({
        color,
        band,
        label,
        wavelength: text(tds[1]),
        instrument: links.filter((l) => !/Telescope/i.test(l)).join(" ") || links.join(" "),
      });
    }
  }

  return {
    id,
    rank,
    title,
    description,
    credit,
    releaseDate: releaseDate && !Number.isNaN(releaseDate.getTime()) ? releaseDate.toISOString() : null,
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    objectNames,
    distance: row("Distance"),
    constellation: row("Constellation"),
    categories,
    raHms,
    decDms,
    raDeg: raHms ? hmsToDeg(raHms) : null,
    decDeg: decDms ? dmsToDeg(decDms) : null,
    fov: row("Field of view"),
    orientation: row("Orientation"),
    filters,
  };
}

/** Store one scraped image. `overwrite: false` keeps an existing row untouched (the cron only adds new images). */
export async function saveGalleryImage(db: PrismaClient, img: EsaImage, { overwrite = true } = {}) {
  const data = {
    rank: img.rank,
    title: img.title,
    description: img.description,
    credit: img.credit,
    release_date: img.releaseDate ? new Date(img.releaseDate) : null,
    width: img.width,
    height: img.height,
    object_names: img.objectNames,
    distance: img.distance,
    constellation: img.constellation,
    categories: img.categories,
    ra_hms: img.raHms,
    dec_dms: img.decDms,
    ra_deg: img.raDeg,
    dec_deg: img.decDeg,
    fov: img.fov,
    orientation: img.orientation,
    filters: img.filters,
  };
  await db.galleryImage.upsert({
    where: { id: img.id },
    create: { id: img.id, ...data },
    update: overwrite ? { ...data, ingested_at: new Date() } : {},
  });
}
