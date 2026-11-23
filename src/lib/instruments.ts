// Shared by server and client code (no database imports here).
export const INSTRUMENTS = [
  { bit: 1, key: "NIRCAM", label: "NIRCam", color: "#f2c46d", range: "0.6–5.0 μm", role: "Near-infrared camera — Webb's primary imager" },
  { bit: 2, key: "NIRSPEC", label: "NIRSpec", color: "#7fd4ff", range: "0.6–5.3 μm", role: "Near-infrared spectrograph — up to ~200 targets at once" },
  { bit: 4, key: "MIRI", label: "MIRI", color: "#ff6b4a", range: "4.9–27.9 μm", role: "Mid-infrared camera & spectrograph, cooled below 7 K" },
  { bit: 8, key: "NIRISS", label: "NIRISS", color: "#b79cff", range: "0.6–5.0 μm", role: "Slitless spectroscopy & exoplanet transits" },
  { bit: 16, key: "FGS", label: "FGS", color: "#9aa0a6", range: "0.6–5.0 μm", role: "Fine guidance sensor" },
] as const;

export type Instrument = (typeof INSTRUMENTS)[number];

export function instrumentOf(name: string | null | undefined): Instrument {
  const n = (name ?? "").toUpperCase();
  return INSTRUMENTS.find((i) => n.startsWith(i.key)) ?? INSTRUMENTS[4];
}

/**
 * Chart-mark variants of the brand hues, validated (dataviz validate_palette.js,
 * dark mode, surface #030407): lightness band, chroma, CVD and contrast all pass.
 * Use these for SVG chart fills; the brighter brand hues are for glows/chips.
 */
export const CHART_INSTRUMENT: Record<string, string> = {
  NIRCAM: "#bb8809",
  NIRSPEC: "#2a91be",
  MIRI: "#d94726",
  NIRISS: "#7c60bd",
};
export const CHART_TYPE = {
  image: "#bb8809",
  spectrum: "#2a91be",
  cube: "#0aa14e",
  timeseries: "#7c60bd",
} as const;
export const TYPE_LABEL = {
  image: "Images",
  spectrum: "Spectra",
  cube: "IFU cubes",
  timeseries: "Time series",
} as const;
