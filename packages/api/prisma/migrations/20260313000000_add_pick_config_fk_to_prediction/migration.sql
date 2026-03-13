-- Step 1: Add nullable pickConfigId column
ALTER TABLE "Prediction" ADD COLUMN "pickConfigId" VARCHAR;

-- Step 2: Backfill from Position table (predictorToken → Position → pickConfigId)
UPDATE "Prediction" pred
SET "pickConfigId" = pos."pickConfigId"
FROM "Position" pos
WHERE pos."tokenAddress" = pred."predictorToken"
  AND pred."pickConfigId" IS NULL;

-- Step 3: Add FK constraint and index
CREATE INDEX "IDX_prediction_pick_config_id" ON "Prediction"("pickConfigId");
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_pickConfigId_fkey" FOREIGN KEY ("pickConfigId") REFERENCES "Picks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: Drop old token columns and their indexes
DROP INDEX IF EXISTS "IDX_prediction_predictor_token";
DROP INDEX IF EXISTS "IDX_prediction_counterparty_token";
ALTER TABLE "Prediction" DROP COLUMN "predictorToken";
ALTER TABLE "Prediction" DROP COLUMN "counterpartyToken";
