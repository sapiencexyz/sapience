-- Add Polymarket negative-risk basket metadata to conditions and condition groups.
ALTER TABLE "condition"
  ADD COLUMN "negRisk" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "negRiskMarketId" VARCHAR;

ALTER TABLE "condition_group"
  ADD COLUMN "negRisk" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "negRiskMarketId" VARCHAR;

-- Cheap lookup for admin invariant checks and future backfills/debugging.
CREATE INDEX "IDX_condition_neg_risk_market_id"
  ON "condition"("negRiskMarketId")
  WHERE "negRisk" = true;

CREATE INDEX "IDX_condition_group_neg_risk_market_id"
  ON "condition_group"("negRiskMarketId")
  WHERE "negRisk" = true;
