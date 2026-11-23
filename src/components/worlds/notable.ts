/** Careful, sourced notes on headline worlds. Numbers shown alongside are computed from archive parameters. */
export const NOTABLE: { planet: string; also?: string[]; tag: string; title: string; body: string; refs: string }[] = [
  {
    planet: "WASP-39 b",
    tag: "Hot Saturn",
    title: "The first unambiguous CO₂ on an exoplanet",
    body: "The Early Release Science programme pointed four instrument modes at this one planet. Carbon dioxide appeared at 4.3 μm, followed by sulphur dioxide at 4.05 μm. Equilibrium chemistry does not predict SO₂ at the observed abundance. It forms when the star's ultraviolet light breaks molecules apart high in the atmosphere: the first evidence of photochemistry on an exoplanet.",
    refs: "ERS Team 2023; Rustamkulov et al. 2023; Tsai et al. 2023",
  },
  {
    planet: "WASP-107 b",
    tag: "Super-puff",
    title: "Clouds made of rock",
    body: "This planet is close to Jupiter's size with a small fraction of its mass, so its atmosphere is unusually extended and easy to probe. MIRI found sulphur dioxide and a silicate absorption feature near 10 μm: clouds of mineral particles. Methane is far less abundant than expected, which points to a hot interior, probably heated by tides.",
    refs: "Dyrek et al. 2024; Sing et al. 2024; Welbanks et al. 2024",
  },
  {
    planet: "K2-18 b",
    tag: "Temperate sub-Neptune",
    title: "Methane, CO₂ and an open question",
    body: "The NIRISS and NIRSpec spectra show methane and carbon dioxide, with no detectable ammonia. A claimed detection of dimethyl sulphide (DMS), produced on Earth by marine life, is tentative and disputed: independent reanalyses of the same data find no significant evidence for it. Whether the interior is a water ocean under hydrogen, a magma ocean or a gas-rich mini-Neptune is unresolved.",
    refs: "Madhusudhan et al. 2023; Schmidt et al. 2025; Luque et al. 2025",
  },
  {
    planet: "TRAPPIST-1 b",
    also: ["TRAPPIST-1 c"],
    tag: "Rocky, M-dwarf host",
    title: "Measuring the heat of Earth-sized rocks",
    body: "MIRI measured the infrared glow of these planets' daysides at 15 μm, during secondary eclipse. Planet b's dayside is about as hot as a bare rock with no atmosphere to carry heat around. For planet c, the measurement rules out a thick, CO₂-rich atmosphere like Venus's. Neither result rules out a thin atmosphere.",
    refs: "Greene et al. 2023; Zieba et al. 2023",
  },
  {
    planet: "LHS 475 b",
    tag: "Earth-sized",
    title: "Webb's first confirmed planet",
    body: "NIRSpec transits confirmed this rocky, Earth-sized planet in 2023. Its transmission spectrum is flat at current precision. That excludes a thick hydrogen-dominated atmosphere and a pure-methane one, but a thin or CO₂-rich atmosphere remains possible.",
    refs: "Lustig-Yaeger et al. 2023",
  },
  {
    planet: "GJ 1214 b",
    tag: "Sub-Neptune",
    title: "The haze world",
    body: "For a decade its transmission spectrum looked featureless, the signature of high-altitude haze. MIRI followed the planet around its whole orbit (a phase curve) and measured its day- and night-side temperatures. They point to a highly reflective, metal-rich atmosphere dominated by heavy molecules such as water or CO₂, not hydrogen.",
    refs: "Kempton et al. 2023",
  },
  {
    planet: "WASP-96 b",
    tag: "Hot Saturn",
    title: "First light for exoplanet spectroscopy",
    body: "Part of Webb's first-images release in July 2022. One transit observed with NIRISS produced an unambiguous water signature, with evidence for clouds and haze. It was the most detailed exoplanet transmission spectrum at the time.",
    refs: "Radica et al. 2023; Taylor et al. 2023",
  },
];
