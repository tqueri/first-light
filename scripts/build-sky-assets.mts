/**
 * Builds compact sky assets for the /sky map from d3-celestial (BSD-3):
 *   public/sky/stars.json          [[ra, dec, mag, bv], …]   (Hipparcos, mag ≤ 6)
 *   public/sky/constellations.json { lines: [[ra,dec,ra,dec,…], …], labels: [[ra, dec, name], …] }
 * Usage: tsx scripts/build-sky-assets.mts
 */
import fs from "node:fs";
import path from "node:path";

const SRC = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data";
const OUT = path.join(process.cwd(), "public", "sky");
fs.mkdirSync(OUT, { recursive: true });

type Feature<G> = { id: string | number; properties: Record<string, string | number>; geometry: G };
const getJson = async <T,>(f: string): Promise<T> => (await fetch(`${SRC}/${f}`)).json() as Promise<T>;
const ra = (lon: number) => +(lon < 0 ? lon + 360 : lon).toFixed(3);
const r2 = (n: number) => +n.toFixed(3);

const stars = await getJson<{ features: Feature<{ coordinates: [number, number] }>[] }>("stars.6.json");
const starRows = stars.features
  .map((f) => [ra(f.geometry.coordinates[0]), r2(f.geometry.coordinates[1]), +Number(f.properties.mag).toFixed(2), +Number(f.properties.bv || 0.6).toFixed(2)])
  .sort((a, b) => a[2] - b[2]);
fs.writeFileSync(path.join(OUT, "stars.json"), JSON.stringify(starRows));

const lines = await getJson<{ features: Feature<{ coordinates: [number, number][][] }>[] }>("constellations.lines.json");
const polylines = lines.features.flatMap((f) => f.geometry.coordinates.map((line) => line.flatMap(([lo, la]) => [ra(lo), r2(la)])));

const names = await getJson<{ features: Feature<{ coordinates: [number, number] }>[] }>("constellations.json");
const labels = names.features.map((f) => [ra(f.geometry.coordinates[0]), r2(f.geometry.coordinates[1]), String(f.properties.name), Number(f.properties.rank)]);

fs.writeFileSync(path.join(OUT, "constellations.json"), JSON.stringify({ lines: polylines, labels }));
console.log(`stars: ${starRows.length}, constellation polylines: ${polylines.length}, labels: ${labels.length}`);
