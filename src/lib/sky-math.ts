/**
 * Celestial coordinate helpers. Equatorial (J2000) unit vector
 * (cos δ cos α, cos δ sin α, sin δ) is mapped to three.js space (y-up) as
 * X = x, Y = z, Z = −y — a proper rotation, so the inside-out view is not mirrored:
 * with north up, east (increasing RA) is on the left, exactly as on the real sky.
 */
const D2R = Math.PI / 180;

export function raDecToVec(raDeg: number, decDeg: number, out: Float32Array | number[] = [0, 0, 0], offset = 0) {
  const a = raDeg * D2R;
  const d = decDeg * D2R;
  const cd = Math.cos(d);
  out[offset] = cd * Math.cos(a);
  out[offset + 1] = Math.sin(d);
  out[offset + 2] = -cd * Math.sin(a);
  return out;
}

export function vecToRaDec(x: number, y: number, z: number): [number, number] {
  const ra = (Math.atan2(-z, x) / D2R + 360) % 360;
  const dec = Math.asin(Math.max(-1, Math.min(1, y))) / D2R;
  return [ra, dec];
}

// IAU J2000 equatorial → galactic rotation matrix.
const R = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

export function galacticToRaDec(lDeg: number, bDeg: number): [number, number] {
  const l = lDeg * D2R;
  const b = bDeg * D2R;
  const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  // eq = Rᵀ g
  const x = R[0][0] * g[0] + R[1][0] * g[1] + R[2][0] * g[2];
  const y = R[0][1] * g[0] + R[1][1] * g[1] + R[2][1] * g[2];
  const z = R[0][2] * g[0] + R[1][2] * g[1] + R[2][2] * g[2];
  return [(Math.atan2(y, x) / D2R + 360) % 360, Math.asin(z) / D2R];
}

export function raToHms(ra: number) {
  const h = ra / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = ((h - hh) * 60 - mm) * 60;
  return `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m ${ss.toFixed(1).padStart(4, "0")}s`;
}

export function decToDms(dec: number) {
  const s = dec < 0 ? "−" : "+";
  const a = Math.abs(dec);
  const dd = Math.floor(a);
  const mm = Math.floor((a - dd) * 60);
  const ss = ((a - dd) * 60 - mm) * 60;
  return `${s}${String(dd).padStart(2, "0")}° ${String(mm).padStart(2, "0")}′ ${ss.toFixed(0).padStart(2, "0")}″`;
}

/** Approximate RGB for a star from its B−V colour index (Ballesteros 2012 temperature + blackbody fit). */
export function bvToRgb(bv: number): [number, number, number] {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  // Tanner Helland blackbody approximation
  const k = t / 100;
  let r: number, g: number, b: number;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => Math.max(0, Math.min(255, v)) / 255;
  return [c(r), c(g), c(b)];
}

export const SKY_PRESETS = [
  { name: "Cosmic Cliffs", sub: "NGC 3324 · Carina", ra: 159.21, dec: -58.62, fov: 6 },
  { name: "Pillars of Creation", sub: "M16 · Serpens", ra: 274.7, dec: -13.84, fov: 6 },
  { name: "JADES / Hubble Ultra Deep Field", sub: "GOODS-South · Fornax", ra: 53.16, dec: -27.79, fov: 5 },
  { name: "COSMOS-Web", sub: "Sextans", ra: 150.12, dec: 2.21, fov: 8 },
  { name: "Orion Nebula", sub: "M42 · Orion", ra: 83.82, dec: -5.39, fov: 8 },
  { name: "Galactic Centre", sub: "Sgr A* · Sagittarius", ra: 266.42, dec: -29.01, fov: 8 },
  { name: "SMACS 0723", sub: "First Deep Field · Volans", ra: 110.83, dec: -73.45, fov: 6 },
  { name: "Abell 2744", sub: "Pandora's Cluster · Sculptor", ra: 3.59, dec: -30.4, fov: 5 },
  { name: "Large Magellanic Cloud", sub: "30 Doradus · Dorado", ra: 84.68, dec: -69.1, fov: 14 },
  { name: "TRAPPIST-1", sub: "Aquarius", ra: 346.62, dec: -5.04, fov: 6 },
  { name: "Stephan's Quintet", sub: "Pegasus", ra: 339.01, dec: 33.96, fov: 6 },
  { name: "Southern Ring Nebula", sub: "NGC 3132 · Vela", ra: 151.76, dec: -40.44, fov: 6 },
] as const;

/** Well-known survey fields: cells inside them get a human name instead of a catalogue file name. */
export const KNOWN_FIELDS = [
  { name: "GOODS-South · JADES / Hubble Ultra Deep Field", ra: 53.12, dec: -27.8, r: 0.3 },
  { name: "GOODS-North · JADES", ra: 189.23, dec: 62.24, r: 0.3 },
  { name: "Extended Groth Strip · CEERS", ra: 214.9, dec: 52.88, r: 0.45 },
  { name: "COSMOS · COSMOS-Web", ra: 150.12, dec: 2.21, r: 1.0 },
  { name: "UKIDSS Ultra Deep Survey · PRIMER", ra: 34.4, dec: -5.2, r: 0.55 },
  { name: "Abell 2744 · UNCOVER", ra: 3.58, dec: -30.4, r: 0.18 },
  { name: "SMACS 0723 · First Deep Field", ra: 110.83, dec: -73.45, r: 0.12 },
  { name: "North Ecliptic Pole Time-Domain Field", ra: 260.69, dec: 65.82, r: 0.3 },
  { name: "MACS J0416 · lensing cluster", ra: 64.04, dec: -24.07, r: 0.12 },
  { name: "El Gordo · lensing cluster", ra: 15.72, dec: -49.25, r: 0.12 },
  { name: "Orion Nebula · M42", ra: 83.82, dec: -5.39, r: 0.35 },
  { name: "Cosmic Cliffs · NGC 3324", ra: 159.21, dec: -58.62, r: 0.15 },
  { name: "Tarantula Nebula · 30 Doradus", ra: 84.68, dec: -69.1, r: 0.25 },
  { name: "Galactic Centre · Sgr A*", ra: 266.42, dec: -29.01, r: 0.2 },
] as const;

export function knownField(ra: number, dec: number): string | null {
  for (const f of KNOWN_FIELDS) {
    const dra = ((ra - f.ra + 540) % 360) - 180;
    const d = Math.hypot(dra * Math.cos((dec * Math.PI) / 180), dec - f.dec);
    if (d <= f.r) return f.name;
  }
  return null;
}

/** Catalogue-file-ish target names ("1181-MERGED-APT-CLEAN") → something readable. */
export function displayTarget(ra: number, dec: number, target: string | null | undefined): string {
  return knownField(ra, dec) ?? (target ? target.replace(/_/g, " ") : "Unnamed field");
}
