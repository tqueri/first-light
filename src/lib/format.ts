export const mjdToDate = (mjd: number) => new Date((mjd - 40_587) * 86_400_000);

export const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

export const fmtDate = (d: Date | string | number, opts: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC", ...opts }).format(
    new Date(d),
  );

export const fmtMjd = (mjd: number | null | undefined, opts?: Intl.DateTimeFormatOptions) =>
  mjd == null ? "—" : fmtDate(mjdToDate(mjd), opts);

/** "3.2 billion", "870 million", "12,400" — for human-scale captions. */
export function fmtLarge(n: number, digits = 1): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(digits)} trillion`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)} billion`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)} million`;
  return fmtInt(n);
}

/** Wavelength string from nanometres. */
export const fmtWavelength = (nm: number) => (nm >= 1000 ? `${(nm / 1000).toFixed(2)} μm` : `${nm.toFixed(0)} nm`);

export function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** MAST target names are like "NGC-3324" or "JADES-GS-Z14-0"; make them readable. */
export function prettyTarget(name: string | null | undefined) {
  if (!name) return "Unnamed field";
  return name.replace(/_/g, " ").replace(/(?<=[A-Z])-(?=\d)/g, " ");
}
