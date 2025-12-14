-- Rename position participant fields to predictor/counterparty terminology
ALTER TABLE "position" RENAME COLUMN "maker" TO "predictor";
ALTER TABLE "position" RENAME COLUMN "taker" TO "counterparty";
ALTER TABLE "position" RENAME COLUMN "makerNftTokenId" TO "predictorNftTokenId";
ALTER TABLE "position" RENAME COLUMN "takerNftTokenId" TO "counterpartyNftTokenId";
ALTER TABLE "position" RENAME COLUMN "makerCollateral" TO "predictorCollateral";
ALTER TABLE "position" RENAME COLUMN "takerCollateral" TO "counterpartyCollateral";
ALTER TABLE "position" RENAME COLUMN "makerWon" TO "predictorWon";

-- Update index names to match new column names
ALTER INDEX "IDX_position_maker" RENAME TO "IDX_position_predictor";
ALTER INDEX "IDX_position_taker" RENAME TO "IDX_position_counterparty";
