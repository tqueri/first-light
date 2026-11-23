-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "products" (
    "obsid" BIGINT NOT NULL,
    "obs_id" TEXT NOT NULL,
    "target_name" TEXT,
    "target_class" TEXT,
    "ra" DOUBLE PRECISION,
    "dec" DOUBLE PRECISION,
    "instrument" TEXT,
    "filters" TEXT,
    "product_type" TEXT NOT NULL,
    "t_min" DOUBLE PRECISION,
    "t_max" DOUBLE PRECISION,
    "exptime" DOUBLE PRECISION,
    "release_mjd" DOUBLE PRECISION,
    "proposal_id" INTEGER,
    "proposal_pi" TEXT,
    "proposal_type" TEXT,
    "title" TEXT,
    "em_min" DOUBLE PRECISION,
    "em_max" DOUBLE PRECISION,
    "jpeg_url" TEXT,
    "moving" BOOLEAN NOT NULL DEFAULT false,
    "ingested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("obsid")
);

-- CreateTable
CREATE TABLE "ingest_windows" (
    "product_type" TEXT NOT NULL,
    "mjd_start" DOUBLE PRECISION NOT NULL,
    "mjd_end" DOUBLE PRECISION NOT NULL,
    "rows" INTEGER NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingest_windows_pkey" PRIMARY KEY ("product_type","mjd_start","mjd_end")
);

-- CreateTable
CREATE TABLE "ingest_runs" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "rows" INTEGER,
    "note" TEXT,

    CONSTRAINT "ingest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sky_cells" (
    "id" INTEGER NOT NULL,
    "ra" DOUBLE PRECISION NOT NULL,
    "dec" DOUBLE PRECISION NOT NULL,
    "n_products" INTEGER NOT NULL,
    "n_image" INTEGER NOT NULL,
    "n_spectrum" INTEGER NOT NULL,
    "n_cube" INTEGER NOT NULL,
    "n_timeseries" INTEGER NOT NULL,
    "inst_mask" INTEGER NOT NULL,
    "first_mjd" DOUBLE PRECISION,
    "last_mjd" DOUBLE PRECISION,
    "n_programs" INTEGER NOT NULL,
    "target" TEXT,
    "dec_bin" INTEGER NOT NULL,
    "ra_bin" INTEGER NOT NULL,

    CONSTRAINT "sky_cells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_images" (
    "id" TEXT NOT NULL,
    "rank" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "credit" TEXT,
    "release_date" TIMESTAMPTZ(6),
    "width" INTEGER,
    "height" INTEGER,
    "object_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "distance" TEXT,
    "constellation" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ra_hms" TEXT,
    "dec_dms" TEXT,
    "ra_deg" DOUBLE PRECISION,
    "dec_deg" DOUBLE PRECISION,
    "fov" TEXT,
    "orientation" TEXT,
    "filters" JSONB NOT NULL DEFAULT '[]',
    "ingested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exo_spectra" (
    "id" TEXT NOT NULL,
    "planet" TEXT NOT NULL,
    "spec_type" TEXT NOT NULL,
    "instrument" TEXT,
    "authors" TEXT,
    "bibcode" TEXT,
    "note" TEXT,
    "min_wl" DOUBLE PRECISION,
    "max_wl" DOUBLE PRECISION,
    "points" JSONB,
    "value_unit" TEXT,
    "ingested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "n_points" INTEGER,
    "reference" TEXT,
    "value_kind" TEXT,
    "derived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "exo_spectra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exo_planets" (
    "name" TEXT NOT NULL,
    "host" TEXT,
    "radius_re" DOUBLE PRECISION,
    "mass_me" DOUBLE PRECISION,
    "period_days" DOUBLE PRECISION,
    "eq_temp_k" DOUBLE PRECISION,
    "distance_pc" DOUBLE PRECISION,
    "disc_year" INTEGER,
    "host_teff" DOUBLE PRECISION,
    "host_spectype" TEXT,
    "star_rad_rsun" DOUBLE PRECISION,
    "insol_earth" DOUBLE PRECISION,

    CONSTRAINT "exo_planets_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "products_proposal_idx" ON "products"("proposal_id");

-- CreateIndex
CREATE INDEX "products_tmin_idx" ON "products"("t_min" DESC);

-- CreateIndex
CREATE INDEX "products_release_idx" ON "products"("release_mjd" DESC);

-- CreateIndex
CREATE INDEX "products_type_idx" ON "products"("product_type");

-- CreateIndex
CREATE INDEX "exo_planet_idx" ON "exo_spectra"("planet");
