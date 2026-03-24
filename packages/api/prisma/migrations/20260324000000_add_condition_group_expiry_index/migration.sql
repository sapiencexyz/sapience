-- Composite index covering the expired_groups CTE in QuestionsResolver.
-- Includes endTime so MAX(endTime) can be resolved with an index-only scan.
-- CONCURRENTLY avoids table locks on production.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_condition_group_expiry"
ON "condition" ("conditionGroupId", "public", "chainId", "settled", "endTime" DESC)
WHERE "public" = true;
