-- Completes the volume-sort index coverage on `condition`. The 24h and 7d
-- unfiltered windows were indexed in the prior migration; this one adds the
-- remaining six (1h + 4h unfiltered, plus all four filtered variants) so
-- every `similarMarketVolumeWindow` choice on questionsPage — both filtered
-- and unfiltered — has a matching index. Mirrors the symmetric coverage
-- already present on the condition_group side.
--
-- Production note: CREATE INDEX without CONCURRENTLY takes a brief write
-- lock on the condition table. Sub-second on a small/medium table; if you're
-- running this against a busy prod table, rewrite each to
-- CREATE INDEX CONCURRENTLY outside a transaction.

-- Unfiltered: 1h window.
CREATE INDEX IF NOT EXISTS "IDX_condition_public_volume1h"
ON "condition" ("volume1h" DESC)
WHERE "public" = true;

-- Unfiltered: 4h window.
CREATE INDEX IF NOT EXISTS "IDX_condition_public_volume4h"
ON "condition" ("volume4h" DESC)
WHERE "public" = true;

-- Filtered (excludes extreme-odds trades outside [0.01, 0.99]): 1h window.
CREATE INDEX IF NOT EXISTS "IDX_condition_public_volumefiltered1h"
ON "condition" ("volumeFiltered1h" DESC)
WHERE "public" = true;

-- Filtered: 4h window.
CREATE INDEX IF NOT EXISTS "IDX_condition_public_volumefiltered4h"
ON "condition" ("volumeFiltered4h" DESC)
WHERE "public" = true;

-- Filtered: 24h window.
CREATE INDEX IF NOT EXISTS "IDX_condition_public_volumefiltered24h"
ON "condition" ("volumeFiltered24h" DESC)
WHERE "public" = true;

-- Filtered: 7d window.
CREATE INDEX IF NOT EXISTS "IDX_condition_public_volumefiltered7d"
ON "condition" ("volumeFiltered7d" DESC)
WHERE "public" = true;
