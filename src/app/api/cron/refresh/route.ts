/**
 * Daily refresh (Vercel Cron → GET /api/cron/refresh, see vercel.ts).
 *  - MAST: upserts every public product released in the last 10 days, rebuilds the sky cells.
 *  - ESA/Webb: picks up newly published images (only IDs not already stored).
 *  - Mondays: NASA Exoplanet Archive spectra (the ingest skips what it already has).
 * Protected by CRON_SECRET (Vercel sends it as a Bearer token).
 */
import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { fetchImage, listTop100 } from "@/lib/ingest/esa";
import { ingestPlanets, ingestSpectra } from "@/lib/ingest/exo";
import { incremental, rebuildSkyCells } from "@/lib/ingest/mast";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = pool();
  const log: string[] = [];
  const t0 = Date.now();
  const report: Record<string, unknown> = {};

  try {
    const rows = await incremental(db, 10, (s) => log.push(s));
    await rebuildSkyCells(db);
    report.mast = { rows };
    revalidateTag("mast", "max");
  } catch (e) {
    report.mastError = (e as Error).message;
  }

  try {
    const ids = await listTop100();
    const known = new Set(
      (await db.query<{ id: string }>("select id from gallery_images")).rows.map((r) => r.id),
    );
    const fresh = ids.filter((id) => !known.has(id)).slice(0, 25);
    let added = 0;
    for (const id of fresh) {
      if (Date.now() - t0 > 200_000) break;
      const img = await fetchImage(id, ids.indexOf(id) + 1);
      await db.query(
        `insert into gallery_images (id, rank, title, description, credit, release_date, width, height, object_names,
           distance, constellation, categories, ra_hms, dec_dms, ra_deg, dec_deg, fov, orientation, filters)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) on conflict (id) do nothing`,
        [img.id, img.rank, img.title, img.description, img.credit, img.releaseDate, img.width, img.height,
         img.objectNames, img.distance, img.constellation, img.categories, img.raHms, img.decDms, img.raDeg,
         img.decDeg, img.fov, img.orientation, JSON.stringify(img.filters)],
      );
      added++;
    }
    report.gallery = { added };
    if (added) revalidateTag("gallery", "max");
  } catch (e) {
    report.galleryError = (e as Error).message;
  }

  if (new Date().getUTCDay() === 1 && Date.now() - t0 < 120_000) {
    try {
      const s = await ingestSpectra(db, (m) => log.push(m));
      await ingestPlanets(db, (m) => log.push(m));
      report.exo = s;
      revalidateTag("exo", "max");
    } catch (e) {
      report.exoError = (e as Error).message;
    }
  }

  await db.query(`insert into ingest_runs (source, finished_at, rows, note) values ('cron', now(), $1, $2)`, [
    (report.mast as { rows?: number } | undefined)?.rows ?? 0,
    JSON.stringify(report).slice(0, 2000),
  ]);
  return Response.json({ ok: true, seconds: Math.round((Date.now() - t0) / 1000), report, log: log.slice(-40) });
}
