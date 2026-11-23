/**
 * Webb filter reference data used by the Lab.
 * Pivot wavelengths from JDox (NIRCam / MIRI filter tables), in microns.
 */
export const PIVOT_UM: Record<string, number> = {
  F070W: 0.704,
  F090W: 0.901,
  F115W: 1.154,
  F140M: 1.404,
  F150W: 1.501,
  F162M: 1.626,
  F182M: 1.845,
  F187N: 1.874,
  F200W: 1.99,
  F210M: 2.093,
  F212N: 2.12,
  F250M: 2.503,
  F277W: 2.786,
  F300M: 2.996,
  F335M: 3.365,
  F356W: 3.563,
  F360M: 3.621,
  F405N: 4.052,
  F410M: 4.092,
  F430M: 4.28,
  F444W: 4.421,
  F460M: 4.63,
  F470N: 4.708,
  F480M: 4.817,
  F560W: 5.635,
  F770W: 7.639,
  F1000W: 9.953,
  F1130W: 11.309,
  F1280W: 12.81,
  F1500W: 15.064,
  F1800W: 17.984,
  F2100W: 20.795,
  F2550W: 25.365,
};

/** What each filter mostly records. Conservative: only well-established attributions. */
export const TRACES: Record<string, { short: string; long: string }> = {
  F090W: { short: "Starlight", long: "Starlight at 0.9 μm, just beyond the reddest light the eye can see." },
  F115W: { short: "Starlight", long: "Starlight at 1.15 μm, near-infrared." },
  F150W: { short: "Starlight", long: "Starlight at 1.5 μm, where dust starts to become transparent." },
  F187N: {
    short: "Paschen-α · ionised H",
    long: "A narrow filter on the Paschen-α line of hydrogen (1.875 μm), which glows where ultraviolet light from hot young stars has ionised the gas.",
  },
  F200W: { short: "Starlight, through dust", long: "Starlight at 2 μm, which passes through far more dust than visible light." },
  F212N: {
    short: "Molecular hydrogen",
    long: "A narrow filter on the 2.12 μm line of molecular hydrogen (H₂), excited by shocks from jets and outflows or by ultraviolet light.",
  },
  F277W: { short: "Stars & galaxies", long: "Broad 2.8 μm band: stars, and the stretched light of distant galaxies." },
  F335M: {
    short: "PAH · 3.3 μm",
    long: "Covers the 3.3 μm emission band of polycyclic aromatic hydrocarbons (PAHs): carbon-rich molecules on dust grains that glow when hit by starlight.",
  },
  F356W: { short: "Cool stars & hot dust", long: "Broad 3.6 μm band: cool stars and hot dust." },
  F405N: {
    short: "Brackett-α · ionised H",
    long: "A narrow filter on hydrogen's Brackett-α line (4.05 μm): ionised gas, seen through dust that would hide Hα.",
  },
  F444W: { short: "Hot dust, cool stars", long: "NIRCam's longest wide filter (4.4 μm): hot dust, cool stars and heavily reddened sources." },
  F470N: {
    short: "Molecular hydrogen",
    long: "A narrow filter on a 4.69 μm line of molecular hydrogen (H₂). It traces warm molecular gas in jets and on the surfaces of clouds.",
  },
  F770W: {
    short: "PAH · 7.7 μm",
    long: "The 7.7 μm PAH band: glowing carbon-rich dust on the skins of molecular clouds.",
  },
  F1000W: { short: "Silicate dust", long: "10 μm, around the silicate dust band near 9.7 μm." },
  F1130W: { short: "PAH · 11.3 μm", long: "The 11.3 μm PAH band." },
  F1280W: { short: "Warm dust · [Ne II]", long: "Warm dust at 12.8 μm. The band also contains the [Ne II] 12.8 μm line of ionised neon." },
  F1500W: { short: "Warm dust", long: "Warm dust continuum at 15 μm." },
  F1800W: { short: "Cooler dust", long: "18 μm: cooler dust, roughly 100–200 K (around −120 °C)." },
  F2100W: { short: "Cool dust", long: "21 μm: cool dust." },
};

export const ESA_COLORS: Record<string, string> = {
  Purple: "#9b6bff",
  Blue: "#3d6dff",
  Cyan: "#2fd0ff",
  Green: "#3dfa7c",
  Yellow: "#ffe04a",
  Orange: "#ff9a2e",
  Red: "#ff3a2e",
};
