// Full, resumable MAST backfill. Usage: pnpm ingest:mast [--incremental]
import { db } from "../src/lib/db.ts";
import { backfill, incremental, rebuildSkyCells } from "../src/lib/ingest/mast.ts";

const prisma = db();
const t0 = Date.now();
const run = await prisma.ingestRun.create({ data: { source: "mast" } });
const mode = process.argv.includes("--incremental") ? "incremental" : "backfill";
console.log(`[mast] ${mode} starting`);
const rows = mode === "incremental" ? await incremental(prisma, 30) : await backfill(prisma);
console.log(`[mast] ${rows} rows upserted; rebuilding sky cells…`);
await rebuildSkyCells(prisma);
const [products, cells] = await Promise.all([prisma.product.count(), prisma.skyCell.count()]);
await prisma.ingestRun.update({ where: { id: run.id }, data: { finished_at: new Date(), rows, note: mode } });
console.log(`[mast] done in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${products} products, ${cells} sky cells`);
await prisma.$disconnect();
