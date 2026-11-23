/**
 * Flat ΛCDM cosmology with Planck 2018 parameters (TT,TE,EE+lowE+lensing+BAO):
 * H0 = 67.66 km/s/Mpc, Ωm = 0.3111, T_cmb = 2.7255 K, N_eff = 3.046.
 * Radiation (photons + relativistic neutrinos) is included so early-universe
 * ages are right. All integrals are done in the scale factor a = 1/(1+z),
 * where the integrands are smooth, with composite Simpson's rule.
 */

export const H0 = 67.66; // km/s/Mpc
export const OMEGA_M = 0.3111;
export const T_CMB = 2.7255; // K
const h = H0 / 100;
const OMEGA_GAMMA = 2.4728e-5 / (h * h);
export const OMEGA_R = OMEGA_GAMMA * (1 + 0.2271 * 3.046);
export const OMEGA_L = 1 - OMEGA_M - OMEGA_R;

const C_KM_S = 299_792.458;
const MPC_KM = 3.085_677_581e19;
const GYR_S = 3.155_76e16; // Julian gigayear
export const LY_PER_MPC = 3.261_563_777e6;
export const KM_PER_LY = 9.460_730_472_580_8e12;

/** Hubble time 1/H0 in Gyr. */
export const HUBBLE_TIME_GYR = MPC_KM / H0 / GYR_S;
/** Hubble distance c/H0 in Mpc. */
export const HUBBLE_DIST_MPC = C_KM_S / H0;

function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  if (a === b) return 0;
  if (n % 2) n++;
  const hStep = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * hStep);
  return (s * hStep) / 3;
}

const zToA = (z: number) => 1 / (1 + z);

/** Dimensionless Hubble parameter E(z) = H(z)/H0. */
export function E(z: number): number {
  const zp = 1 + z;
  return Math.sqrt(OMEGA_R * zp ** 4 + OMEGA_M * zp ** 3 + OMEGA_L);
}

/** Age of the universe at redshift z, in Gyr. */
export function ageAt(z: number): number {
  const a = zToA(z);
  // t = (1/H0) ∫0^a a' da' / sqrt(Ωr + Ωm a' + ΩΛ a'^4)
  return HUBBLE_TIME_GYR * simpson((x) => x / Math.sqrt(OMEGA_R + OMEGA_M * x + OMEGA_L * x ** 4), 0, a, 4000);
}

export const AGE_NOW_GYR = ageAt(0);

/** Lookback time to redshift z, in Gyr (= light-travel time). */
export function lookbackGyr(z: number): number {
  return AGE_NOW_GYR - ageAt(z);
}

/** Comoving (proper, today) distance to z, in Mpc. */
export function comovingMpc(z: number): number {
  const a = zToA(z);
  // D_C = (c/H0) ∫a^1 da' / sqrt(Ωr + Ωm a' + ΩΛ a'^4)
  return HUBBLE_DIST_MPC * simpson((x) => 1 / Math.sqrt(OMEGA_R + OMEGA_M * x + OMEGA_L * x ** 4), a, 1, 4000);
}

/** Radius of the observable universe today (particle horizon), in Gly. */
export const OBSERVABLE_RADIUS_GLY = (comovingMpc(1e9) * LY_PER_MPC) / 1e9;

export type CosmoSnapshot = {
  z: number;
  ageGyr: number; // age of the universe when the light left
  lookbackGyr: number; // how long the light travelled
  comovingGly: number; // where the source is *now*
  emitDistanceGly: number; // how far it was when the light left
  lightTravelGly: number; // c × lookback
  angularDiameterMpc: number;
  luminosityDistanceGly: number;
  kpcPerArcsec: number;
  cmbK: number;
  stretch: number; // 1 + z
  recessionC: number; // recession velocity today, in units of c (Hubble law, comoving)
};

export function snapshot(z: number): CosmoSnapshot {
  const dcMpc = comovingMpc(z);
  const dcGly = (dcMpc * LY_PER_MPC) / 1e9;
  const daMpc = dcMpc / (1 + z);
  const lb = lookbackGyr(z);
  return {
    z,
    ageGyr: AGE_NOW_GYR - lb,
    lookbackGyr: lb,
    comovingGly: dcGly,
    emitDistanceGly: dcGly / (1 + z),
    lightTravelGly: lb, // 1 Gyr of light travel = 1 Gly
    angularDiameterMpc: daMpc,
    luminosityDistanceGly: dcGly * (1 + z),
    kpcPerArcsec: (daMpc * 1000 * Math.PI) / (180 * 3600),
    cmbK: T_CMB * (1 + z),
    stretch: 1 + z,
    recessionC: dcMpc / HUBBLE_DIST_MPC,
  };
}

/** Invert lookback time → redshift (bisection). */
export function zForLookback(gyr: number): number {
  let lo = 0;
  let hi = 2000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (lookbackGyr(mid) < gyr) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** A selection of record-holding galaxies, spectroscopically confirmed with JWST (z, reference). */
export const RECORD_GALAXIES = [
  { name: "MoM-z14", z: 14.44, ref: "Naidu et al. 2025", note: "Current record. NIRSpec prism, Mirage or Miracle survey." },
  { name: "JADES-GS-z14-0", z: 14.18, ref: "Carniani et al. 2024; Schouws et al. 2025", note: "Oxygen detected with ALMA — already chemically enriched." },
  { name: "JADES-GS-z14-1", z: 13.9, ref: "Carniani et al. 2024", note: "" },
  { name: "JADES-GS-z13-0", z: 13.2, ref: "Curtis-Lake et al. 2023", note: "" },
  { name: "UNCOVER-z13", z: 13.08, ref: "Wang et al. 2023", note: "Behind the lensing cluster Abell 2744." },
  { name: "JADES-GS-z13-1-LA", z: 13.0, ref: "Witstok et al. 2025", note: "Lyman-α emission — a bubble of ionised gas, far earlier than expected." },
  { name: "JADES-GS-z12-0", z: 12.63, ref: "Curtis-Lake et al. 2023", note: "" },
  { name: "GHZ2 / GLASS-z12", z: 12.34, ref: "Castellano et al. 2024", note: "" },
  { name: "GN-z11", z: 10.6, ref: "Bunker et al. 2023", note: "Hubble's former record; Webb found signs of an active black hole." },
  { name: "MACS0647-JD", z: 10.17, ref: "Hsiao et al. 2023", note: "Gravitationally lensed into three images." },
] as const;
