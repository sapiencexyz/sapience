-- Per-vault indexing: existing rows predate the vaultAddress column. Rather
-- than guess which vault wrote each row, clear the table and require the
-- backfillVaultFlows.ts script to be re-run. The script is idempotent and the
-- downstream consumer (protocol_stats_snapshot) is rebuilt from these events
-- plus on-chain reads, so clearing is safe.
TRUNCATE "vault_flow_event" RESTART IDENTITY;

-- AlterTable
ALTER TABLE "vault_flow_event" ADD COLUMN "vaultAddress" VARCHAR NOT NULL;

-- DropIndex
DROP INDEX "vault_flow_event_chainId_timestamp_idx";

-- CreateIndex
CREATE INDEX "vault_flow_event_chainId_vaultAddress_timestamp_idx" ON "vault_flow_event"("chainId", "vaultAddress", "timestamp");
