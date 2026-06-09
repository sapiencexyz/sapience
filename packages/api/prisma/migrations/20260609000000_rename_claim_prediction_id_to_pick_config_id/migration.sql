-- Rename the `predictionId` column on `Claim` to `pickConfigId`. The column
-- has always stored the on-chain pickConfigId (the TokensRedeemed event field),
-- never a Prediction.predictionId. The misnomer caused the accountPnl Claims
-- branch to INNER JOIN Claim.predictionId to Prediction.predictionId and match
-- zero rows, so claim-based accounts reported 0 PnL (fixed in the same PR by
-- resolving cost basis through the pick configuration). This rename makes the
-- schema honest and aligns the column with Close.pickConfigId / the on-chain
-- event field name.

ALTER TABLE "Claim" RENAME COLUMN "predictionId" TO "pickConfigId";

ALTER INDEX "IDX_claim_prediction" RENAME TO "IDX_claim_pick_config";
