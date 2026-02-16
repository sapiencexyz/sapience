-- AlterTable
ALTER TABLE "condition" ADD COLUMN "predictionCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing counts
UPDATE condition c
SET "predictionCount" = sub.cnt
FROM (
  SELECT "conditionId", COUNT(*)::integer AS cnt
  FROM prediction GROUP BY "conditionId"
) sub WHERE c.id = sub."conditionId";

-- Trigger to maintain count on INSERT/DELETE (handles cascade deletes)
CREATE OR REPLACE FUNCTION update_condition_prediction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE condition SET "predictionCount" = "predictionCount" + 1 WHERE id = NEW."conditionId";
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE condition SET "predictionCount" = GREATEST("predictionCount" - 1, 0) WHERE id = OLD."conditionId";
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prediction_count
AFTER INSERT OR DELETE ON prediction
FOR EACH ROW EXECUTE FUNCTION update_condition_prediction_count();

-- Index for sorting
CREATE INDEX IF NOT EXISTS "IDX_condition_prediction_count"
ON "condition" ("predictionCount" DESC) WHERE "public" = true;
