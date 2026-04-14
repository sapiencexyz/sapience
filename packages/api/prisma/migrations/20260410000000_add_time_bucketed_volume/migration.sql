-- Add time-bucketed volume columns to condition
ALTER TABLE "condition"
  ADD COLUMN "volume1h"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "volume4h"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "volume24h"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "volume7d"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "volumeFiltered1h"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "volumeFiltered4h"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "volumeFiltered24h"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "volumeFiltered7d"   DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Add denormalized volume aggregate columns to condition_group
ALTER TABLE "condition_group"
  ADD COLUMN "totalVolume1h"           DECIMAL NOT NULL DEFAULT 0,
  ADD COLUMN "totalVolume4h"           DECIMAL NOT NULL DEFAULT 0,
  ADD COLUMN "totalVolume24h"          DECIMAL NOT NULL DEFAULT 0,
  ADD COLUMN "totalVolume7d"           DECIMAL NOT NULL DEFAULT 0,
  ADD COLUMN "totalVolumeFiltered1h"   DECIMAL NOT NULL DEFAULT 0,
  ADD COLUMN "totalVolumeFiltered4h"   DECIMAL NOT NULL DEFAULT 0,
  ADD COLUMN "totalVolumeFiltered24h"  DECIMAL NOT NULL DEFAULT 0,
  ADD COLUMN "totalVolumeFiltered7d"   DECIMAL NOT NULL DEFAULT 0;

-- Extend recalculate_condition_group_aggregates to include volume columns
CREATE OR REPLACE FUNCTION recalculate_condition_group_aggregates(group_id integer)
RETURNS void AS $$
BEGIN
  UPDATE condition_group cg
  SET
    "totalOpenInterest"       = COALESCE(sub.total_oi, 0),
    "maxEndTime"              = COALESCE(sub.max_et, 0),
    "totalPredictionCount"    = COALESCE(sub.total_pc, 0),
    "maxCreatedAtEpoch"       = COALESCE(sub.max_ca, 0),
    "publicConditionCount"    = COALESCE(sub.pub_count, 0),
    "totalVolume1h"           = COALESCE(sub.total_v1h, 0),
    "totalVolume4h"           = COALESCE(sub.total_v4h, 0),
    "totalVolume24h"          = COALESCE(sub.total_v24h, 0),
    "totalVolume7d"           = COALESCE(sub.total_v7d, 0),
    "totalVolumeFiltered1h"   = COALESCE(sub.total_vf1h, 0),
    "totalVolumeFiltered4h"   = COALESCE(sub.total_vf4h, 0),
    "totalVolumeFiltered24h"  = COALESCE(sub.total_vf24h, 0),
    "totalVolumeFiltered7d"   = COALESCE(sub.total_vf7d, 0)
  FROM (
    SELECT
      COALESCE(SUM("openInterest"::numeric), 0) AS total_oi,
      COALESCE(MAX("endTime"), 0) AS max_et,
      COALESCE(SUM("predictionCount"), 0) AS total_pc,
      COALESCE(MAX(FLOOR(EXTRACT(EPOCH FROM "createdAt"))::bigint), 0) AS max_ca,
      COUNT(*)::integer AS pub_count,
      COALESCE(SUM("volume1h"), 0) AS total_v1h,
      COALESCE(SUM("volume4h"), 0) AS total_v4h,
      COALESCE(SUM("volume24h"), 0) AS total_v24h,
      COALESCE(SUM("volume7d"), 0) AS total_v7d,
      COALESCE(SUM("volumeFiltered1h"), 0) AS total_vf1h,
      COALESCE(SUM("volumeFiltered4h"), 0) AS total_vf4h,
      COALESCE(SUM("volumeFiltered24h"), 0) AS total_vf24h,
      COALESCE(SUM("volumeFiltered7d"), 0) AS total_vf7d
    FROM condition
    WHERE "conditionGroupId" = group_id AND public = true
  ) sub
  WHERE cg.id = group_id;
END;
$$ LANGUAGE plpgsql;

-- Extend trigger to fire on volume column changes
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
      OLD.settled IS DISTINCT FROM NEW.settled OR
      OLD."volume1h" IS DISTINCT FROM NEW."volume1h" OR
      OLD."volume4h" IS DISTINCT FROM NEW."volume4h" OR
      OLD."volume24h" IS DISTINCT FROM NEW."volume24h" OR
      OLD."volume7d" IS DISTINCT FROM NEW."volume7d" OR
      OLD."volumeFiltered1h" IS DISTINCT FROM NEW."volumeFiltered1h" OR
      OLD."volumeFiltered4h" IS DISTINCT FROM NEW."volumeFiltered4h" OR
      OLD."volumeFiltered24h" IS DISTINCT FROM NEW."volumeFiltered24h" OR
      OLD."volumeFiltered7d" IS DISTINCT FROM NEW."volumeFiltered7d"
    ) THEN
      PERFORM recalculate_condition_group_aggregates(NEW."conditionGroupId");
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Indexes on condition_group for sorting (raw volume)
CREATE INDEX IF NOT EXISTS "IDX_cg_total_volume_1h"
  ON "condition_group" ("totalVolume1h" DESC) WHERE "publicConditionCount" > 0;
CREATE INDEX IF NOT EXISTS "IDX_cg_total_volume_4h"
  ON "condition_group" ("totalVolume4h" DESC) WHERE "publicConditionCount" > 0;
CREATE INDEX IF NOT EXISTS "IDX_cg_total_volume_24h"
  ON "condition_group" ("totalVolume24h" DESC) WHERE "publicConditionCount" > 0;
CREATE INDEX IF NOT EXISTS "IDX_cg_total_volume_7d"
  ON "condition_group" ("totalVolume7d" DESC) WHERE "publicConditionCount" > 0;

-- Indexes on condition_group for sorting (filtered volume)
CREATE INDEX IF NOT EXISTS "IDX_cg_total_vf_1h"
  ON "condition_group" ("totalVolumeFiltered1h" DESC) WHERE "publicConditionCount" > 0;
CREATE INDEX IF NOT EXISTS "IDX_cg_total_vf_4h"
  ON "condition_group" ("totalVolumeFiltered4h" DESC) WHERE "publicConditionCount" > 0;
CREATE INDEX IF NOT EXISTS "IDX_cg_total_vf_24h"
  ON "condition_group" ("totalVolumeFiltered24h" DESC) WHERE "publicConditionCount" > 0;
CREATE INDEX IF NOT EXISTS "IDX_cg_total_vf_7d"
  ON "condition_group" ("totalVolumeFiltered7d" DESC) WHERE "publicConditionCount" > 0;
