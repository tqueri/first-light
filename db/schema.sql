-- FIRST LIGHT — database schema (idempotent; safe to run on every boot)

-- One row per public, calibrated (level 3) JWST science product from MAST/CAOM.
-- NOTE: a product is not an "observation": NIRSpec MOS yields one spectrum per
-- source, NIRCam yields one mosaic per filter, etc.
create table if not exists products (
  obsid          bigint primary key,
  obs_id         text not null,
  target_name    text,
  target_class   text,
  ra             double precision,
  dec            double precision,
  instrument     text,
  filters        text,
  product_type   text not null,          -- image | spectrum | cube | timeseries
  t_min          double precision,       -- MJD, start of first exposure
  t_max          double precision,
  exptime        double precision,       -- seconds (product-level; do not sum across products)
  release_mjd    double precision,       -- MJD the data became public
  proposal_id    integer,
  proposal_pi    text,
  proposal_type  text,
  title          text,
  em_min         double precision,       -- nm
  em_max         double precision,       -- nm
  jpeg_url       text,                   -- mast: URI of the preview JPEG (images only)
  moving         boolean not null default false,
  ingested_at    timestamptz not null default now()
);
create index if not exists products_target_idx   on products (lower(target_name));
create index if not exists products_proposal_idx on products (proposal_id);
create index if not exists products_tmin_idx     on products (t_min desc);
create index if not exists products_release_idx  on products (release_mjd desc);
create index if not exists products_type_idx     on products (product_type);

-- Resumable backfill bookkeeping: one row per (release window, product type).
create table if not exists ingest_windows (
  product_type  text not null,
  mjd_start     double precision not null,
  mjd_end       double precision not null,
  rows          integer not null,
  completed_at  timestamptz not null default now(),
  primary key (product_type, mjd_start, mjd_end)
);

create table if not exists ingest_runs (
  id           serial primary key,
  source       text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  rows         integer,
  note         text
);

-- Sky aggregation (~0.2° cells), rebuilt after each ingest. Fixed targets only.
create table if not exists sky_cells (
  id            integer primary key,
  ra            double precision not null,
  dec           double precision not null,
  n_products    integer not null,
  n_image       integer not null,
  n_spectrum    integer not null,
  n_cube        integer not null,
  n_timeseries  integer not null,
  inst_mask     integer not null,        -- 1 NIRCam, 2 NIRSpec, 4 MIRI, 8 NIRISS, 16 FGS
  first_mjd     double precision,
  last_mjd      double precision,
  n_programs    integer not null,
  target        text,
  dec_bin       integer not null,
  ra_bin        integer not null
);

-- ESA/Webb curated images (CC BY 4.0) — the "Top 100".
create table if not exists gallery_images (
  id             text primary key,       -- e.g. weic2205a
  rank           integer,                -- order in ESA's Top 100 list
  title          text not null,
  description    text[] not null default '{}',
  credit         text,
  release_date   timestamptz,
  width          integer,
  height         integer,
  object_names   text[] not null default '{}',
  distance       text,
  constellation  text,
  categories     text[] not null default '{}',
  ra_hms         text,
  dec_dms        text,
  ra_deg         double precision,
  dec_deg        double precision,
  fov            text,
  orientation    text,
  filters        jsonb not null default '[]',
  ingested_at    timestamptz not null default now()
);

-- NASA Exoplanet Archive: JWST atmospheric spectra.
create table if not exists exo_spectra (
  id             text primary key,       -- spec_path
  planet         text not null,
  spec_type      text not null,          -- Transmission | Eclipse | Direct Imaging
  instrument     text,
  authors        text,
  bibcode        text,
  note           text,
  min_wl         double precision,
  max_wl         double precision,
  points         jsonb,                  -- [[wl_um, value, err_plus, err_minus, halfwidth], ...]
  value_unit     text,
  ingested_at    timestamptz not null default now()
);
create index if not exists exo_planet_idx on exo_spectra (planet);

create table if not exists exo_planets (
  name          text primary key,
  host          text,
  radius_re     double precision,
  mass_me       double precision,
  period_days   double precision,
  eq_temp_k     double precision,
  distance_pc   double precision,
  disc_year     integer,
  host_teff     double precision,
  host_spectype text
);
-- exo additions (idempotent)
alter table exo_spectra add column if not exists n_points    integer;
alter table exo_spectra add column if not exists reference   text;      -- REFERENCE header of the file
alter table exo_spectra add column if not exists value_kind  text;      -- transit_depth | eclipse_depth | brightness_temp
alter table exo_spectra add column if not exists derived     boolean not null default false; -- depth computed from Rp/Rs
alter table exo_planets add column if not exists star_rad_rsun double precision;
alter table exo_planets add column if not exists insol_earth   double precision;
