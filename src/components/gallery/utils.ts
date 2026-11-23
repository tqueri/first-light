import type { GalleryImage } from "@/lib/data";

/* ───────────── titles ───────────── */

const INSTRUMENT_WORDS = /\b(NIRCam|MIRI|NIRSpec|NIRISS|Hubble|HST|ALMA|Webb|WFC3|ACS|Chandra|Spitzer|Euclid)\b/gi;

/**
 * "Cas A (NIRCam image)" → { title: "Cas A", tags: ["NIRCam"] }.
 * Only trailing parentheticals that look like an instrument/format note are stripped.
 */
export function cleanTitle(raw: string): { title: string; tags: string[] } {
  let title = raw.trim();
  const tags: string[] = [];
  // Leading form: "NIRCam Image of the “Cosmic Cliffs” in Carina", "Combined NIRCam and MIRI Image of …"
  const lead = title.match(/^(?:Combined\s+)?((?:NIRCam|MIRI|NIRSpec|NIRISS)(?:\s*(?:and|\+)\s*(?:NIRCam|MIRI|NIRSpec|NIRISS))*)\s+Image\s+of\s+(?:the\s+)?(.+)$/i);
  if (lead) {
    for (const t of lead[1].match(INSTRUMENT_WORDS) ?? []) {
      const norm = normaliseInstrument(t);
      if (!tags.includes(norm)) tags.push(norm);
    }
    INSTRUMENT_WORDS.lastIndex = 0;
    title = lead[2];
  }
  for (let guard = 0; guard < 3; guard++) {
    const m = title.match(/^(.*\S)\s*\(([^()]*)\)\s*$/);
    if (!m) break;
    const inner = m[2];
    const looksTechnical =
      INSTRUMENT_WORDS.test(inner) ||
      /\b(image|imaging|mosaic|view|composite|filters?|closeup|close-up|cropped|scaled|spectr\w*)\b/i.test(inner);
    INSTRUMENT_WORDS.lastIndex = 0;
    if (!looksTechnical) break;
    for (const t of inner.match(INSTRUMENT_WORDS) ?? []) {
      const norm = normaliseInstrument(t);
      if (!tags.includes(norm)) tags.push(norm);
    }
    INSTRUMENT_WORDS.lastIndex = 0;
    if (tags.length === 0) {
      // e.g. "(Full View)": keep as a quiet tag
      tags.push(inner.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
    title = m[1];
  }
  return { title, tags };
}

function normaliseInstrument(t: string) {
  const u = t.toUpperCase();
  if (u === "NIRCAM") return "NIRCam";
  if (u === "NIRSPEC") return "NIRSpec";
  if (u === "HST") return "Hubble";
  if (u === "WEBB") return "Webb";
  if (u === "HUBBLE") return "Hubble";
  if (u === "MIRI" || u === "NIRISS" || u === "ALMA" || u === "WFC3" || u === "ACS") return u;
  return t[0].toUpperCase() + t.slice(1);
}

export const WEBB_INSTRUMENTS = ["NIRCam", "MIRI", "NIRSpec", "NIRISS"] as const;

/** Instruments that contributed to the image, from the filter table (authoritative) and categories. */
export function instrumentsOf(img: Pick<GalleryImage, "filters" | "categories">): string[] {
  const out = new Set<string>();
  for (const f of img.filters) {
    for (const w of f.instrument.split(/[\s,/+]+/)) {
      const n = w.trim();
      if (!n) continue;
      const u = n.toUpperCase();
      if (u === "NIRCAM") out.add("NIRCam");
      else if (u === "MIRI") out.add("MIRI");
      else if (u === "NIRSPEC") out.add("NIRSpec");
      else if (u === "NIRISS") out.add("NIRISS");
      else if (["WFC3", "ACS", "WFPC2", "STIS", "NICMOS"].includes(u)) out.add("Hubble");
      else if (u === "ALMA") out.add("ALMA");
    }
  }
  for (const c of img.categories) if ((WEBB_INSTRUMENTS as readonly string[]).includes(c)) out.add(c);
  return [...out];
}

export const INSTRUMENT_COLOR: Record<string, string> = {
  NIRCam: "#f2c46d",
  NIRSpec: "#7fd4ff",
  MIRI: "#ff6b4a",
  NIRISS: "#b79cff",
  Hubble: "#9aa0a6",
  ALMA: "#9aa0a6",
};

/* ───────────── distances ───────────── */

export type ParsedDistance =
  | { kind: "ly"; ly: number; label: string }
  | { kind: "z"; z: number; label: string }
  | null;

export function parseDistance(raw: string | null): ParsedDistance {
  if (!raw) return null;
  const s = raw.replace(/,/g, "").trim();
  // A quoted redshift is more precise than a rounded distance: prefer it.
  const z = s.match(/\bz\s*=\s*([\d.]+)/i);
  if (z) {
    const n = Number(z[1]);
    if (Number.isFinite(n) && n > 0) return { kind: "z", z: n, label: raw };
  }
  const ly = s.match(/^([\d.]+)\s*(thousand|million|billion)?\s*light[\s-]?years?/i);
  if (ly) {
    const mult = { thousand: 1e3, million: 1e6, billion: 1e9 }[(ly[2] ?? "").toLowerCase() as "million"] ?? 1;
    const n = Number(ly[1]) * mult;
    if (Number.isFinite(n) && n > 0) return { kind: "ly", ly: n, label: raw };
  }
  return null;
}

export function fmtLy(ly: number): string {
  if (ly >= 1e9) return `${+(ly / 1e9).toFixed(ly >= 1e10 ? 1 : 2)} billion`;
  if (ly >= 1e6) return `${+(ly / 1e6).toFixed(ly >= 1e7 ? 0 : 1)} million`;
  return new Intl.NumberFormat("en-US").format(Math.round(ly));
}

/**
 * Well-dated reference points (years before present) used to give a light-travel
 * time a human anchor. Deliberately conservative, rounded, textbook values.
 */
const ANCHORS: { years: number; text: string }[] = [
  { years: 2_000, text: "the height of the Roman Empire (~2,000 years ago)" },
  { years: 5_200, text: "the earliest known writing, in Mesopotamia (~5,200 years ago)" },
  { years: 12_000, text: "the beginnings of agriculture (~12,000 years ago)" },
  { years: 300_000, text: "the oldest known fossils of Homo sapiens (~300,000 years ago)" },
  { years: 3_300_000, text: "the oldest known stone tools (~3.3 million years ago)" },
  { years: 66_000_000, text: "the asteroid impact that ended the age of dinosaurs (~66 million years ago)" },
  { years: 540_000_000, text: "the Cambrian explosion of complex animal life (~540 million years ago)" },
  { years: 4_570_000_000, text: "the formation of the Sun and Earth (~4.57 billion years ago)" },
];

/** "…set out N years ago, earlier than X" or "…, after X but before Y". */
export function lightAnchor(ly: number): string {
  const before = [...ANCHORS].reverse().find((a) => a.years <= ly);
  const after = ANCHORS.find((a) => a.years > ly);
  if (!before && after) return `More recent than ${after.text}.`;
  if (before && !after) return `Earlier than ${before.text}.`;
  return `Earlier than ${before!.text}; more recent than ${after!.text}.`;
}

/* ───────────── wavelengths & colours ───────────── */

/** "1.87 μm" / "900 nm" / "7.7 µm" → micrometres. */
export function parseWavelengthUm(raw: string): number | null {
  const m = raw.replace(",", ".").match(/([\d.]+)\s*(nm|μm|µm|um|micron|mm)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  if (unit === "nm") return n / 1000;
  if (unit === "mm") return n * 1000;
  return n;
}

export const BAND_COLORS: Record<string, string> = {
  Purple: "#a77bff",
  Violet: "#a77bff",
  Blue: "#4f86ff",
  Cyan: "#3fd6e6",
  Green: "#58d68d",
  Yellow: "#f5dc4b",
  Orange: "#ff9a3c",
  Red: "#ff4d4d",
  Pseudocolor: "#9aa0a6",
  Grayscale: "#c9c9c9",
  White: "#e8e8e8",
};

export const bandColor = (c: string) => BAND_COLORS[c] ?? "#9aa0a6";

/* ───────────── renditions ───────────── */

/**
 * ESA only renders a ~4000 px "publicationjpg" for originals larger than that;
 * for smaller originals the "large" rendition *is* the original (≤ 4000 px).
 */
export const detailRendition = (w: number | null, h: number | null): "publicationjpg" | "large" =>
  w && h && Math.max(w, h) <= 4000 ? "large" : "publicationjpg";

/* ───────────── field of view / scale bar ───────────── */

/** "7.29 x 4.22 arcminutes" → width and height in arcseconds. */
export function parseFov(raw: string | null): { wArcsec: number; hArcsec: number } | null {
  if (!raw) return null;
  const m = raw.replace(",", ".").match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*(arcminutes?|arcmin|arcseconds?|arcsec|degrees?|deg)/i);
  if (!m) return null;
  const unit = m[3].toLowerCase();
  const k = unit.startsWith("arcm") ? 60 : unit.startsWith("arcs") ? 1 : 3600;
  return { wArcsec: Number(m[1]) * k, hArcsec: Number(m[2]) * k };
}

export function fmtAngle(arcsec: number): string {
  if (arcsec >= 3600) return `${+(arcsec / 3600).toFixed(2)}°`;
  if (arcsec >= 60) return `${+(arcsec / 60).toFixed(arcsec >= 600 ? 0 : 1)}′`;
  return `${+arcsec.toFixed(arcsec >= 10 ? 0 : 1)}″`;
}

/** Nearest "nice" value (1, 2, 5 × 10^n) at or below x. */
export function niceBelow(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x));
  const r = x / p;
  return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * p;
}
