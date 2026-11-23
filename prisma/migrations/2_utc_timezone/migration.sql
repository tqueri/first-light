-- @prisma/adapter-pg reads timestamptz values as if the session were in UTC (it overwrites the
-- offset with +00:00), so every session must be UTC or dates shift by hours.
-- Hosted Postgres (Neon, Prisma Postgres…) already defaults to UTC; this pins it for any other
-- server (e.g. one whose initdb picked up a local time zone). Takes effect for new sessions.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'not allowed to set the database time zone; make sure sessions run in UTC';
END $$;
