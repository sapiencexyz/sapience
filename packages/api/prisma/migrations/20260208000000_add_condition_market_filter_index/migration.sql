-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_condition_market_filter" ON "condition"("public", "chainId", "settled", "conditionGroupId");
