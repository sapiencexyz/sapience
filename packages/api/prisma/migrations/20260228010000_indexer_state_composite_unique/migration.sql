-- DropIndex (handle both possible index names from different migration histories)
DROP INDEX IF EXISTS "IndexerState_chainId_key";
DROP INDEX IF EXISTS "v2_indexer_state_chainId_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IndexerState_chainId_marketAddress_key" ON "IndexerState"("chainId", "marketAddress");
