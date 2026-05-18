-- Add Polymarket negative-risk basket identifier to condition groups.
-- The `negRisk` boolean is *not* stored — GraphQL derives it from
-- `negRiskMarketId IS NOT NULL` at query time, so the column is the only
-- source of truth and we can't drift the two.
ALTER TABLE "condition_group"
  ADD COLUMN "negRiskMarketId" VARCHAR;

-- Cheap lookup for admin invariant checks and future backfills/debugging.
CREATE INDEX "IDX_condition_group_neg_risk_market_id"
  ON "condition_group"("negRiskMarketId")
  WHERE "negRiskMarketId" IS NOT NULL;
