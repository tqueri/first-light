-- Databases created by the old db/schema.sql had an expression index on lower(target_name).
-- No query can use it (searches are `ilike '%…%'`) and Prisma can't model it, so drop it.
-- No-op on databases created from 0_init.
DROP INDEX IF EXISTS "products_target_idx";
