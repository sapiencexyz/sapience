-- Composite (orderField, id) indices for v2 Relay-paginated resolvers.
-- Without these the planner falls back to a sort-after-filter on the
-- existing single-column index, which doesn't satisfy the (orderField
-- <op> ? OR (orderField = ? AND idField <op> ?)) keyset predicate as a
-- pure index range scan.
--
-- CONCURRENTLY: these tables take live writes; a plain CREATE INDEX
-- holds an ACCESS EXCLUSIVE lock for the whole build. Prisma Migrate
-- runs these statements outside a transaction, so CONCURRENTLY is
-- safe here (same pattern as the 20260208000000 condition-market-
-- filter-index migration). If a build fails it leaves an INVALID
-- index that IF NOT EXISTS will then skip — DROP INDEX it before
-- re-running.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_attestation_time_uid"
  ON "attestation" ("time", "uid");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_condition_endtime_id"
  ON "condition" ("endTime", "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_prediction_createdat_id"
  ON "Prediction" ("createdAt", "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_position_updatedat_id"
  ON "Position" ("updatedAt", "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_claim_redeemedat_id"
  ON "Claim" ("redeemedAt", "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_close_burnedat_id"
  ON "Close" ("burnedAt", "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_secondary_trade_executedat_tradehash"
  ON "secondary_trade" ("executedAt", "tradeHash");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_collateral_transfer_timestamp_id"
  ON "collateral_transfer" ("timestamp", "id");
