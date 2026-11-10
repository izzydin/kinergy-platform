-- Normalize existing room features to lowercase for deterministic index & array queries
-- Ensures case-insensitive feature compatibility across Prisma and PostgreSQL
UPDATE "rooms"
SET "features" = ARRAY(
    SELECT lower(trim(val))
    FROM unnest("features") AS val
)
WHERE "features" IS NOT NULL AND cardinality("features") > 0;

