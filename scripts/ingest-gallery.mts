// ESA/Webb Top 100 → Postgres. Usage: pnpm ingest:gallery
import { db } from "../src/lib/db.ts";
import { fetchImage, listTop100, saveGalleryImage } from "../src/lib/ingest/esa.ts";

const prisma = db();
const ids = await listTop100();
console.log(`[esa] top100 lists ${ids.length} images`);
let ok = 0;
for (const [i, id] of ids.entries()) {
  try {
    const img = await fetchImage(id, i + 1);
    await saveGalleryImage(prisma, img);
    ok++;
    console.log(`  ${String(i + 1).padStart(3)} ${id.padEnd(18)} ${img.title.slice(0, 70)}  [${img.filters.length} filters]`);
  } catch (e) {
    console.warn(`  ! ${id}: ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 350)); // be polite
}
console.log(`[esa] ${ok}/${ids.length} images stored`);
await prisma.$disconnect();
