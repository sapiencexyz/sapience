-- Rename tables from v2_ prefix to match model names
ALTER TABLE "v2_indexer_state" RENAME TO "IndexerState";
ALTER TABLE "v2_prediction" RENAME TO "Prediction";
ALTER TABLE "v2_pick_configuration" RENAME TO "Picks";
ALTER TABLE "v2_pick" RENAME TO "Pick";
ALTER TABLE "v2_position_balance" RENAME TO "Position";
ALTER TABLE "v2_redemption_record" RENAME TO "Claim";
ALTER TABLE "v2_burn_record" RENAME TO "Close";

-- Rename indexes
ALTER INDEX "IDX_v2_prediction_chain_market" RENAME TO "IDX_prediction_chain_market";
ALTER INDEX "IDX_v2_prediction_predictor" RENAME TO "IDX_prediction_predictor";
ALTER INDEX "IDX_v2_prediction_counterparty" RENAME TO "IDX_prediction_counterparty";
ALTER INDEX "IDX_v2_prediction_settled" RENAME TO "IDX_prediction_settled";
ALTER INDEX "IDX_v2_pick_config_chain_market" RENAME TO "IDX_pick_config_chain_market";
ALTER INDEX "IDX_v2_pick_config_resolved" RENAME TO "IDX_pick_config_resolved";
ALTER INDEX "IDX_v2_pick_config_id" RENAME TO "IDX_pick_config_id";
ALTER INDEX "UQ_v2_position_balance" RENAME TO "UQ_position_balance";
ALTER INDEX "IDX_v2_position_balance_holder" RENAME TO "IDX_position_balance_holder";
ALTER INDEX "IDX_v2_position_balance_pick_config" RENAME TO "IDX_position_balance_pick_config";
ALTER INDEX "IDX_v2_redemption_chain_market" RENAME TO "IDX_claim_chain_market";
ALTER INDEX "IDX_v2_redemption_holder" RENAME TO "IDX_claim_holder";
ALTER INDEX "IDX_v2_redemption_prediction" RENAME TO "IDX_claim_prediction";
ALTER INDEX "IDX_v2_burn_chain_market" RENAME TO "IDX_close_chain_market";
ALTER INDEX "IDX_v2_burn_pick_config" RENAME TO "IDX_close_pick_config";
ALTER INDEX "IDX_v2_burn_predictor" RENAME TO "IDX_close_predictor";
ALTER INDEX "IDX_v2_burn_counterparty" RENAME TO "IDX_close_counterparty";
