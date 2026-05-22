-- Adds partial indexes on `condition` for sort fields exposed via
-- QuestionSortField that previously fell back to sequential scan when
-- the ungrouped-condition branch of the questionsConnection UNION sorted on
-- them. The matching condition_group aggregate columns already had
-- indexes; this closes the gap on the per-condition side.
--
-- Production note: CREATE INDEX without CONCURRENTLY takes a brief
-- write lock on the condition table. Run during a low-traffic window,
-- or rewrite each to `CREATE INDEX CONCURRENTLY` outside a transaction
-- if running against a busy prod database.

-- Sort by createdAt (QuestionSortField.createdAt)
CREATE INDEX IF NOT EXISTS "IDX_condition_public_createdat"
ON "condition" ("createdAt" DESC)
WHERE "public" = true;

-- Sort by similarMarketVolume with the 24h window (default volumeKey
-- when no similarMarketVolumeWindow arg is supplied).
CREATE INDEX IF NOT EXISTS "IDX_condition_public_volume24h"
ON "condition" ("volume24h" DESC)
WHERE "public" = true;

-- Sort by similarMarketVolume with the 7d window (the longest common
-- discovery window in the FE).
CREATE INDEX IF NOT EXISTS "IDX_condition_public_volume7d"
ON "condition" ("volume7d" DESC)
WHERE "public" = true;
