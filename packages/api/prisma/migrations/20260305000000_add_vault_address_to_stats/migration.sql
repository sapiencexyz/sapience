-- DropIndex
DROP INDEX "UQ_protocol_stats_snapshot_timestamp";

-- AlterTable
ALTER TABLE "protocol_stats_snapshot"
  ADD COLUMN "vaultAddress" VARCHAR NOT NULL DEFAULT '';

-- Delete pre-deployment rows (old vault data)
-- Vault 0x5704dB4b2c068d74Fde25257106a7029463f812E deployed 2026-02-26 = Unix 1772006400
DELETE FROM "protocol_stats_snapshot"
  WHERE "timestamp" < 1772006400;

-- Backfill remaining rows with current vault address
UPDATE "protocol_stats_snapshot"
  SET "vaultAddress" = '0x5704db4b2c068d74fde25257106a7029463f812e'
  WHERE "chainId" = 5064014;

-- CreateIndex
CREATE UNIQUE INDEX "UQ_protocol_stats_snapshot_chain_vault_timestamp"
  ON "protocol_stats_snapshot"("chainId", "vaultAddress", "timestamp");
