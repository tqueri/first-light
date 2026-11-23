import { snapshot, KM_PER_LY } from "./cosmology";

const AU = 149_597_870.7; // km
const LY = KM_PER_LY;

export type Stop = {
  key: string;
  name: string;
  where: string;
  /** light-travel distance in km (what the odometer shows) */
  km: number;
  z?: number;
  image?: { id: string; position?: string; contain?: boolean };
  /** big typographic visual when there is no image */
  glyph?: string;
  body: string[];
  facts?: [string, string][];
};

const cosmo = (z: number) => {
  const s = snapshot(z);
  return {
    km: s.lookbackGyr * 1e9 * LY,
    facts: [
      ["Redshift", `z = ${z}`],
      ["Light left", `${s.lookbackGyr.toFixed(2)} billion years ago`],
      ["Universe was", s.ageGyr < 1 ? `${(s.ageGyr * 1000).toFixed(0)} million years old` : `${s.ageGyr.toFixed(2)} billion years old`],
      ["Where it is now", `${s.comovingGly.toFixed(1)} billion light-years away`],
      ["Light stretched", `${s.stretch.toFixed(2)}×`],
      ["Receding today at", `${s.recessionC.toFixed(2)}× the speed of light`],
    ] as [string, string][],
  };
};

const smacs = cosmo(0.388);
const z14 = cosmo(14.44);
const cmb = cosmo(1089.9);

export const STOPS: Stop[] = [
  {
    key: "earth",
    name: "Earth",
    where: "Origin",
    km: 6_371,
    glyph: "0",
    body: [
      "Every image on this site was downlinked to the antennas of NASA's Deep Space Network, at about 57 gigabytes of science data a day. We begin at the surface, 6,371 km from Earth's centre.",
    ],
  },
  {
    key: "moon",
    name: "The Moon",
    where: "384,400 km",
    km: 384_400,
    glyph: "1.28 s",
    body: [
      "Light, the fastest thing in the universe, crosses the Earth–Moon gap in 1.28 seconds. No human has ever travelled much farther than this.",
    ],
  },
  {
    key: "l2",
    name: "Webb, at L2",
    where: "1.5 million km",
    km: 1_500_000,
    image: { id: "ann2205a", position: "50% 50%" },
    body: [
      "Webb doesn't orbit Earth. It circles the second Sun–Earth Lagrange point, where it keeps pace with Earth around the Sun. From there the Sun, Earth and Moon always stay on one side, behind a five-layer sunshield the size of a tennis court.",
      "It launched on 25 December 2021 on an Ariane 5 and reached L2 a month later. Radio signals take about five seconds to get there.",
    ],
  },
  {
    key: "sun",
    name: "The Sun",
    where: "1 astronomical unit",
    km: AU,
    glyph: "8 min 19 s",
    body: [
      "The one place in the sky Webb may never look. The sunshield must always face the Sun, so at any moment Webb can only point between 85° and 135° from it. Over a year that band sweeps the whole sky.",
      "The sunlight on your skin left the Sun's surface 8 minutes and 19 seconds ago.",
    ],
  },
  {
    key: "jupiter",
    name: "Jupiter",
    where: "5.2 AU from the Sun",
    km: 5.2 * AU,
    image: { id: "jupiter-auroras1" },
    body: [
      "The same telescope that sees the first galaxies can track the planets. In the infrared, auroras glow at Jupiter's poles, and hazes high above the clouds catch the sunlight.",
    ],
  },
  {
    key: "saturn",
    name: "Saturn",
    where: "9.5 AU",
    km: 9.54 * AU,
    image: { id: "saturn1" },
    body: [
      "At 3.23 μm, methane in Saturn's atmosphere absorbs nearly all the sunlight, so the planet turns almost black. Its water-ice rings stay bright.",
    ],
  },
  {
    key: "neptune",
    name: "Neptune",
    where: "30 AU · 4.2 light-hours",
    km: 30.07 * AU,
    image: { id: "weic2214c" },
    body: [
      "Webb's first portrait of Neptune gave the clearest view of its faint rings since Voyager 2 flew past in 1989. Sunlight here is 900 times dimmer than on Earth.",
    ],
  },
  {
    key: "voyager",
    name: "Voyager 1",
    where: "≈ 170 AU",
    km: 25.5e9,
    glyph: "≈ 1 light-day",
    body: [
      "Launched in 1977, it is the most distant object humans have ever built. A radio command takes nearly a day to reach it.",
      "Even so, it has covered less than 0.1% of the way to the nearest star. At its 17 km/s it would need about 75,000 years to get there.",
    ],
  },
  {
    key: "proxima",
    name: "Proxima Centauri",
    where: "4.24 light-years",
    km: 4.2465 * LY,
    glyph: "40 trillion km",
    body: [
      "The nearest star, a small red dwarf. Scale the Solar System down until Earth is a 2 mm peppercorn: the Sun becomes a 22 cm ball 23.5 m away, and Neptune a 7.7 mm bead 700 m away.",
      "At that scale, Proxima Centauri is about 6,300 km away, roughly the distance from London to Chicago. Everything past this point is mostly empty space.",
    ],
  },
  {
    key: "trappist",
    name: "TRAPPIST-1",
    where: "40.7 light-years",
    km: 40.66 * LY,
    glyph: "7 worlds",
    body: [
      "Seven Earth-sized planets orbit this ultracool dwarf, three of them in its temperate zone. Webb measured the heat glow of the two innermost, TRAPPIST-1 b and c, and ruled out thick carbon-dioxide atmospheres on both. These are the first hard constraints on atmospheres of rocky planets around such stars.",
    ],
  },
  {
    key: "orion",
    name: "The Orion Bar",
    where: "1,400 light-years",
    km: 1_400 * LY,
    image: { id: "weic2315b" },
    body: [
      "The nearest large stellar nursery. In the planet-forming disc d203-506, Webb detected the methyl cation (CH₃⁺), a molecule thought to be a cornerstone of interstellar carbon chemistry, for the first time in space.",
    ],
  },
  {
    key: "ring",
    name: "Southern Ring Nebula",
    where: "2,500 light-years",
    km: 2_500 * LY,
    image: { id: "weic2207b" },
    body: [
      "A dying star shedding its outer layers. Webb showed that the dimmer of the two central stars, cloaked in dust, is the one that made the nebula. Our Sun will end like this in about 5 billion years.",
    ],
  },
  {
    key: "pillars",
    name: "Pillars of Creation",
    where: "6,500 light-years",
    km: 6_500 * LY,
    image: { id: "weic2216b", position: "50% 35%" },
    body: [
      "Columns of cold gas and dust several light-years tall, inside the Eagle Nebula (M16). The wavy red edges are supersonic jets from stars still forming inside them. The light you see left them 6,500 years ago, before writing was invented.",
    ],
  },
  {
    key: "cliffs",
    name: "Cosmic Cliffs",
    where: "7,600 light-years",
    km: 7_600 * LY,
    image: { id: "weic2205a", position: "50% 50%" },
    body: [
      "The rim of a giant cavity in NGC 3324, carved by ultraviolet radiation and winds from massive young stars just above the frame. The tallest “peaks” rise about 7 light-years.",
    ],
  },
  {
    key: "galcen",
    name: "Near the Galactic Centre",
    where: "≈ 26,000 light-years",
    km: 26_000 * LY,
    image: { id: "weic2328a" },
    body: [
      "Sagittarius C, a star-forming cloud about 300 light-years from the four-million-solar-mass black hole at the heart of the Milky Way. Webb resolved roughly 500,000 stars in this one frame. Visible light from this region is almost completely blocked by dust. Infrared gets through.",
    ],
  },
  {
    key: "tarantula",
    name: "The Tarantula Nebula",
    where: "161,000 light-years · Large Magellanic Cloud",
    km: 161_000 * LY,
    image: { id: "weic2212a" },
    body: [
      "We have left the Milky Way. In a satellite galaxy, the brightest star-forming region in the Local Group holds thousands of young stars that had never been seen before Webb.",
    ],
  },
  {
    key: "phantom",
    name: "The Phantom Galaxy",
    where: "32 million light-years",
    km: 32e6 * LY,
    image: { id: "potm2410b" },
    body: [
      "M74, a “grand design” spiral seen face-on. Its light set off 32 million years ago, around the time Antarctica's ice sheet first formed.",
    ],
  },
  {
    key: "quintet",
    name: "Stephan's Quintet",
    where: "290 million light-years",
    km: 290e6 * LY,
    image: { id: "weic2208a" },
    body: [
      "Four galaxies locked in a gravitational dance. The fifth, NGC 7320, is a foreground galaxy only 40 million light-years away. Webb mapped the shock waves raised as one galaxy smashes through the group.",
    ],
  },
  {
    key: "smacs",
    name: "SMACS 0723",
    where: "Webb's First Deep Field",
    km: smacs.km,
    z: 0.388,
    image: { id: "weic2209a" },
    body: [
      "At these distances expansion takes over. The cluster's mass bends space and magnifies the galaxies behind it, a gravitational lens that works as a natural telescope. The arcs are background galaxies, stretched and brightened.",
    ],
    facts: smacs.facts,
  },
  {
    key: "firstgal",
    name: "The first galaxies",
    where: "MoM-z14 · JADES-GS-z14-0",
    km: z14.km,
    z: 14.44,
    image: { id: "jades5" },
    body: [
      "The current record holder, MoM-z14, shines from when the universe was about 2% of its present age. Its neighbour in the record books, JADES-GS-z14-0 (shown), already contained oxygen, so earlier generations of stars had lived and died. Galaxies this bright and this early were not expected.",
    ],
    facts: z14.facts,
  },
  {
    key: "cmb",
    name: "The wall of light",
    where: "Cosmic microwave background",
    km: cmb.km,
    z: 1089.9,
    glyph: "380,000 years",
    body: [
      "Before this moment the universe was an opaque plasma. Light couldn't travel freely until about 380,000 years after the Big Bang. This is the hard edge of anything any telescope can ever see with light. Webb can't see it either: the glow has been stretched into microwaves.",
      "The gas that emitted that light is now about 46 billion light-years away. That is the radius of the observable universe.",
    ],
    facts: cmb.facts,
  },
];
