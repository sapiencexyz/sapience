-- Rename Prediction columns from wager to collateral
ALTER TABLE "Prediction" RENAME COLUMN "predictorWager" TO "predictorCollateral";
ALTER TABLE "Prediction" RENAME COLUMN "counterpartyWager" TO "counterpartyCollateral";
