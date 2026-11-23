// ESA/Webb Top 100 → Postgres. Usage: pnpm ingest:gallery
import pg from "pg";
import { fetchImage, listTop100 } from "../src/lib/ingest/esa.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const ids = await listTop100();
console.log(`[esa] top100 lists ${ids.length} images`);
let ok = 0;
for (const [i, id] of ids.entries()) {
  try {
    const img = await fetchImage(id, i + 1);
    await pool.query(
      `insert into gallery_images (id, rank, title, description, credit, release_date, width, height, object_names,
         distance, constellation, categories, ra_hms, dec_dms, ra_deg, dec_deg, fov, orientation, filters)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       on conflict (id) do update set rank=excluded.rank, title=excluded.title, description=excluded.description,
         credit=excluded.credit, release_date=excluded.release_date, width=excluded.width, height=excluded.height,
         object_names=excluded.object_names, distance=excluded.distance, constellation=excluded.constellation,
         categories=excluded.categories, ra_hms=excluded.ra_hms, dec_dms=excluded.dec_dms, ra_deg=excluded.ra_deg,
         dec_deg=excluded.dec_deg, fov=excluded.fov, orientation=excluded.orientation, filters=excluded.filters,
         ingested_at=now()`,
      [img.id, img.rank, img.title, img.description, img.credit, img.releaseDate, img.width, img.height,
       img.objectNames, img.distance, img.constellation, img.categories, img.raHms, img.decDms, img.raDeg,
       img.decDeg, img.fov, img.orientation, JSON.stringify(img.filters)],
    );
    ok++;
    console.log(`  ${String(i + 1).padStart(3)} ${id.padEnd(18)} ${img.title.slice(0, 70)}  [${img.filters.length} filters]`);
  } catch (e) {
    console.warn(`  ! ${id}: ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 350)); // be polite
}
console.log(`[esa] ${ok}/${ids.length} images stored`);
await pool.end();
