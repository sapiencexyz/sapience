-- Prediction timestamp indexes (time-series volume, PnL, balance queries)
CREATE INDEX IF NOT EXISTS "IDX_prediction_created_at" ON "Prediction"("onChainCreatedAt");
CREATE INDEX IF NOT EXISTS "IDX_prediction_settled_at" ON "Prediction"("settledAt");
CREATE INDEX IF NOT EXISTS "IDX_prediction_predictor_token" ON "Prediction"("predictorToken");
CREATE INDEX IF NOT EXISTS "IDX_prediction_counterparty_token" ON "Prediction"("counterpartyToken");

-- Claim timestamp index (time-series PnL queries)
CREATE INDEX IF NOT EXISTS "IDX_claim_redeemed_at" ON "Claim"("redeemedAt");

-- Close timestamp index (time-series PnL queries)
CREATE INDEX IF NOT EXISTS "IDX_close_burned_at" ON "Close"("burnedAt");

-- LegacyPosition timestamp and status indexes (time-series, protocol stats)
CREATE INDEX IF NOT EXISTS "IDX_position_minted_at" ON "position"("mintedAt");
CREATE INDEX IF NOT EXISTS "IDX_position_settled_at" ON "position"("settledAt");
CREATE INDEX IF NOT EXISTS "IDX_position_status" ON "position"("status");

-- SecondaryTrade timestamp index (time-series volume queries)
CREATE INDEX IF NOT EXISTS "IDX_secondary_trade_executed_at" ON "secondary_trade"("executedAt");
