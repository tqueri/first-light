// NASA Exoplanet Archive (JWST spectra + planet parameters) → Postgres. Usage: pnpm ingest:exo
import { db } from "../src/lib/db.ts";
import { ingestPlanets, ingestSpectra } from "../src/lib/ingest/exo.ts";

const prisma = db();
const t0 = Date.now();
const run = await prisma.ingestRun.create({ data: { source: "exo" } });
const s = await ingestSpectra(prisma);
const p = await ingestPlanets(prisma);
const [spectra, planets, withParams] = await Promise.all([
  prisma.exoSpectrum.count(),
  prisma.exoSpectrum.findMany({ distinct: ["planet"], select: { planet: true } }).then((r) => r.length),
  prisma.exoPlanet.count(),
]);
await prisma.ingestRun.update({
  where: { id: run.id },
  data: { finished_at: new Date(), rows: spectra, note: `listed ${s.listed}, skipped ${s.skipped}` },
});
console.log(
  `[exo] done in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${spectra} spectra, ${planets} planets (${withParams} with parameters); listed ${s.listed}, skipped ${s.skipped}; ${p.stored} param rows`,
);
await prisma.$disconnect();
