export type EsaSize = "thumb700x" | "screen" | "publicationjpg" | "large";

/** ESA/Webb CDN rendition of an archive image (CC BY 4.0). */
export const esaImage = (id: string, size: EsaSize = "screen") =>
  `https://cdn.esawebb.org/archives/images/${size}/${id}.jpg`;

export const esaPage = (id: string) => `https://esawebb.org/images/${id}/`;

/** MAST download URL for a `mast:` product URI (preview JPEGs are public). */
export const mastFile = (uri: string) => `https://mast.stsci.edu/portal/Download/file?uri=${uri}`;

export const mastSearch = (obsId: string) =>
  `https://mast.stsci.edu/search/ui/#/jwst/results?obs_id=${encodeURIComponent(obsId)}`;

/** ESA only publishes `publicationjpg` (4000 px) for originals larger than that; smaller ones are served as `large`. */
export const esaDetailSize = (w: number | null | undefined, h: number | null | undefined): EsaSize =>
  w && h && Math.max(w, h) <= 4000 ? "large" : "publicationjpg";
