-- AlterTable: add denormalized aggregate columns
ALTER TABLE "condition_group"
  ADD COLUMN "totalOpenInterest" DECIMAL NOT NULL DEFAULT 0,
  ADD COLUMN "maxEndTime" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalPredictionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxCreatedAtEpoch" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "publicConditionCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing condition data
UPDATE condition_group cg
SET
  "totalOpenInterest"    = sub.total_oi,
  "maxEndTime"           = sub.max_et,
  "totalPredictionCount" = sub.total_pc,
  "maxCreatedAtEpoch"    = sub.max_ca,
  "publicConditionCount" = sub.pub_count
FROM (
  SELECT
    "conditionGroupId",
    COALESCE(SUM("openInterest"::numeric), 0) AS total_oi,
    COALESCE(MAX("endTime"), 0) AS max_et,
    COALESCE(SUM("predictionCount"), 0) AS total_pc,
    COALESCE(MAX(FLOOR(EXTRACT(EPOCH FROM "createdAt"))::bigint), 0) AS max_ca,
    COUNT(*)::integer AS pub_count
  FROM condition
  WHERE "conditionGroupId" IS NOT NULL AND public = true
  GROUP BY "conditionGroupId"
) sub
WHERE cg.id = sub."conditionGroupId";

-- Helper: full recalculation for a single group (groups have 2-5 conditions)
CREATE OR REPLACE FUNCTION recalculate_condition_group_aggregates(group_id integer)
RETURNS void AS $$
BEGIN
  UPDATE condition_group cg
  SET
    "totalOpenInterest"    = COALESCE(sub.total_oi, 0),
    "maxEndTime"           = COALESCE(sub.max_et, 0),
    "totalPredictionCount" = COALESCE(sub.total_pc, 0),
    "maxCreatedAtEpoch"    = COALESCE(sub.max_ca, 0),
    "publicConditionCount" = COALESCE(sub.pub_count, 0)
  FROM (
    SELECT
      COALESCE(SUM("openInterest"::numeric), 0) AS total_oi,
      COALESCE(MAX("endTime"), 0) AS max_et,
      COALESCE(SUM("predictionCount"), 0) AS total_pc,
      COALESCE(MAX(FLOOR(EXTRACT(EPOCH FROM "createdAt"))::bigint), 0) AS max_ca,
      COUNT(*)::integer AS pub_count
    FROM condition
    WHERE "conditionGroupId" = group_id AND public = true
  ) sub
  WHERE cg.id = group_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger function: fires AFTER INSERT/UPDATE/DELETE on condition
CREATE OR REPLACE FUNCTION update_condition_group_aggregates()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."conditionGroupId" IS NOT NULL THEN
      PERFORM recalculate_condition_group_aggregates(NEW."conditionGroupId");
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD."conditionGroupId" IS NOT NULL THEN
      PERFORM recalculate_condition_group_aggregates(OLD."conditionGroupId");
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Group assignment changed: recalculate both old and new
    IF OLD."conditionGroupId" IS DISTINCT FROM NEW."conditionGroupId" THEN
      IF OLD."conditionGroupId" IS NOT NULL THEN
        PERFORM recalculate_condition_group_aggregates(OLD."conditionGroupId");
      END IF;
      IF NEW."conditionGroupId" IS NOT NULL THEN
        PERFORM recalculate_condition_group_aggregates(NEW."conditionGroupId");
      END IF;
    -- Same group: only recalculate if relevant columns changed
    ELSIF NEW."conditionGroupId" IS NOT NULL AND (
      OLD.public IS DISTINCT FROM NEW.public OR
      OLD."openInterest" IS DISTINCT FROM NEW."openInterest" OR
      OLD."endTime" IS DISTINCT FROM NEW."endTime" OR
      OLD."predictionCount" IS DISTINCT FROM NEW."predictionCount" OR
      OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
      OLD.settled IS DISTINCT FROM NEW.settled
    ) THEN
      PERFORM recalculate_condition_group_aggregates(NEW."conditionGroupId");
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_condition_group_aggregates
AFTER INSERT OR UPDATE OR DELETE ON condition
FOR EACH ROW EXECUTE FUNCTION update_condition_group_aggregates();

-- Partial indexes for sorting (only groups with public conditions)
CREATE INDEX IF NOT EXISTS "IDX_cg_total_oi"
ON "condition_group" ("totalOpenInterest" DESC) WHERE "publicConditionCount" > 0;

CREATE INDEX IF NOT EXISTS "IDX_cg_max_end_time"
ON "condition_group" ("maxEndTime" DESC) WHERE "publicConditionCount" > 0;

CREATE INDEX IF NOT EXISTS "IDX_cg_total_prediction_count"
ON "condition_group" ("totalPredictionCount" DESC) WHERE "publicConditionCount" > 0;

CREATE INDEX IF NOT EXISTS "IDX_cg_max_created_at_epoch"
ON "condition_group" ("maxCreatedAtEpoch" DESC) WHERE "publicConditionCount" > 0;
