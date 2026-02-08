-- Functional index for openInterest numeric sorting (partial: public only)
-- Supports ORDER BY "openInterest"::numeric in the questionsSorted resolver
CREATE INDEX IF NOT EXISTS "IDX_condition_oi_numeric"
ON "condition" (("openInterest"::numeric) DESC)
WHERE "public" = true;

-- Partial index on endTime for public conditions (helps expired_groups CTE)
CREATE INDEX IF NOT EXISTS "IDX_condition_public_endtime"
ON "condition" ("endTime" DESC)
WHERE "public" = true;
