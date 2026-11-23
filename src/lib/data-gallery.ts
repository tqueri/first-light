import { cacheLife, cacheTag } from "next/cache";
import { sql } from "./db";
import type { ArchiveImage, GalleryImage } from "./data";

type Row = GalleryImage & { release_date: Date | string | null };
const norm = (r: Row): GalleryImage => ({
  ...r,
  release_date: r.release_date ? new Date(r.release_date).toISOString() : null,
});

/**
 * ESA publishes comparison renditions (Hubble vs Webb, NIRCam vs MIRI, two epochs)
 * at *identical* pixel dimensions and framing. Same object + same width × height
 * is therefore a reliable signal that two images are registered to each other.
 */
export async function getComparisonPartners(id: string): Promise<GalleryImage[]> {
  "use cache";
  cacheLife("days");
  cacheTag("gallery");
  const rows = await sql<Row>(
    `select b.* from gallery_images a
     join gallery_images b
       on b.id <> a.id and b.width = a.width and b.height = a.height and a.object_names && b.object_names
     where a.id = $1 and a.width > 0
       and b.title !~* '(annotated|compass|labell?ed|scale bar)'
       and a.title !~* '(annotated|compass|labell?ed|scale bar)'
     order by b.rank
     limit 3`,
    [id],
  );
  return rows.map(norm);
}

export async function getImagesByIds(ids: string[]): Promise<GalleryImage[]> {
  "use cache";
  cacheLife("days");
  cacheTag("gallery");
  const rows = await sql<Row>(`select * from gallery_images where id = any($1)`, [ids]);
  return rows.map(norm);
}

/**
 * Raw MAST image products around a sky position, one per instrument+filter
 * (nearest first). Parameters are cast explicitly so Postgres can type them.
 */
export async function getRawFramesNear(ra: number, dec: number, radiusDeg: number, limit = 12): Promise<ArchiveImage[]> {
  "use cache";
  cacheLife("days");
  cacheTag("mast");
  return sql<ArchiveImage>(
    `select obsid, obs_id, target_name, instrument, filters, t_min, release_mjd, proposal_id, proposal_pi, title,
            jpeg_url, ra, dec
     from (
       select distinct on (instrument, filters)
         obsid::text, obs_id, target_name, instrument, filters, t_min, release_mjd, proposal_id, proposal_pi, title,
         jpeg_url, ra, dec, em_min, sep
       from (
         select p.*,
           degrees(acos(least(1::float8, sin(radians(p.dec)) * sin(radians($2::float8)) +
             cos(radians(p.dec)) * cos(radians($2::float8)) * cos(radians(p.ra - $1::float8))))) as sep
         from products p
         where p.product_type = 'image' and p.jpeg_url is not null and not p.moving
           and p.dec between $2::float8 - $3::float8 and $2::float8 + $3::float8
       ) near
       where sep < $3::float8
       order by instrument, filters, sep
     ) one_per_filter
     order by em_min nulls last
     limit $4::int`,
    [ra, dec, radiusDeg, limit],
  );
}

/** Lightweight list for prev/next and static params. */
export async function getGalleryIndex(): Promise<{ id: string; title: string }[]> {
  "use cache";
  cacheLife("days");
  cacheTag("gallery");
  return sql<{ id: string; title: string }>(
    `select id, title from gallery_images
     where not ('Illustrations' = any(categories)) and jsonb_array_length(filters) > 0
     order by rank`,
  );
}
