-- Move canonical resolver from prediction rows onto condition

-- 1) Add resolver column to condition
ALTER TABLE "condition" ADD COLUMN "resolver" VARCHAR;

-- 2) Backfill using latest prediction per condition (latest wins)
UPDATE "condition" c
SET "resolver" = p."resolver"
FROM (
  SELECT DISTINCT ON ("conditionId")
    "conditionId",
    "resolver"
  FROM "prediction"
  ORDER BY "conditionId", "createdAt" DESC, "id" DESC
) p
WHERE c."id" = p."conditionId";

-- 3) Index for resolver lookups
CREATE INDEX "IDX_condition_resolver" ON "condition"("resolver");

-- 4) Deduplicate predictions before tightening uniqueness (keep latest)
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "positionId", "conditionId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "prediction"
  WHERE "positionId" IS NOT NULL
)
DELETE FROM "prediction" p
USING ranked r
WHERE p."id" = r."id"
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "limitOrderId", "conditionId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "prediction"
  WHERE "limitOrderId" IS NOT NULL
)
DELETE FROM "prediction" p
USING ranked r
WHERE p."id" = r."id"
  AND r.rn > 1;

-- 5) Drop old resolver index + uniqueness keyed by resolver
DROP INDEX IF EXISTS "IDX_prediction_resolver";
DROP INDEX IF EXISTS "UQ_prediction_position_condition_resolver";

-- 6) Drop resolver column from prediction
ALTER TABLE "prediction" DROP COLUMN "resolver";

-- 7) Replace uniqueness constraints so each leg is unique per parent+condition
CREATE UNIQUE INDEX "UQ_prediction_position_condition"
  ON "prediction"("positionId", "conditionId");

CREATE UNIQUE INDEX "UQ_prediction_limit_order_condition"
  ON "prediction"("limitOrderId", "conditionId");


