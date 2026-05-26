-- Composite (orderField, id) indices for v2 Relay-paginated resolvers.
-- Without these the planner falls back to a sort-after-filter on the
-- existing single-column index, which doesn't satisfy the (orderField
-- <op> ? OR (orderField = ? AND idField <op> ?)) keyset predicate as a
-- pure index range scan.
--
-- Production note: CREATE INDEX without CONCURRENTLY takes a brief
-- ACCESS EXCLUSIVE lock. Run during a low-traffic window, or rewrite
-- each to CREATE INDEX CONCURRENTLY outside a transaction if running
-- against a busy prod database.

CREATE INDEX IF NOT EXISTS "IDX_attestation_time_uid"
  ON "attestation" ("time", "uid");

CREATE INDEX IF NOT EXISTS "IDX_condition_endtime_id"
  ON "condition" ("endTime", "id");

CREATE INDEX IF NOT EXISTS "IDX_prediction_createdat_id"
  ON "Prediction" ("createdAt", "id");

CREATE INDEX IF NOT EXISTS "IDX_position_updatedat_id"
  ON "Position" ("updatedAt", "id");

CREATE INDEX IF NOT EXISTS "IDX_claim_redeemedat_id"
  ON "Claim" ("redeemedAt", "id");

CREATE INDEX IF NOT EXISTS "IDX_close_burnedat_id"
  ON "Close" ("burnedAt", "id");

CREATE INDEX IF NOT EXISTS "IDX_secondary_trade_executedat_tradehash"
  ON "secondary_trade" ("executedAt", "tradeHash");

CREATE INDEX IF NOT EXISTS "IDX_collateral_transfer_timestamp_id"
  ON "collateral_transfer" ("timestamp", "id");
