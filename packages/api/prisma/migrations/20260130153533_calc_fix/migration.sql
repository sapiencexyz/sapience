-- AlterTable
ALTER TABLE "protocol_stats_snapshot" ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 5064014,
ADD COLUMN     "vaultAirdropGains" VARCHAR NOT NULL DEFAULT '0',
ADD COLUMN     "vaultCollateralLost" VARCHAR NOT NULL DEFAULT '0',
ADD COLUMN     "vaultCollateralWon" VARCHAR NOT NULL DEFAULT '0',
ADD COLUMN     "vaultDeposits" VARCHAR NOT NULL DEFAULT '0',
ADD COLUMN     "vaultPositionsLost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vaultPositionsWon" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vaultRealizedPnL" VARCHAR NOT NULL DEFAULT '0',
ADD COLUMN     "vaultWithdrawals" VARCHAR NOT NULL DEFAULT '0';

-- CreateTable
CREATE TABLE "vault_flow_event" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "transactionHash" VARCHAR NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "eventType" VARCHAR NOT NULL,
    "user" VARCHAR NOT NULL,
    "assets" VARCHAR NOT NULL,
    "shares" VARCHAR NOT NULL,

    CONSTRAINT "vault_flow_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vault_flow_event_chainId_timestamp_idx" ON "vault_flow_event"("chainId", "timestamp");

-- CreateIndex
CREATE INDEX "vault_flow_event_eventType_idx" ON "vault_flow_event"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "vault_flow_event_chainId_transactionHash_logIndex_key" ON "vault_flow_event"("chainId", "transactionHash", "logIndex");

-- CreateIndex
CREATE INDEX "protocol_stats_snapshot_chainId_idx" ON "protocol_stats_snapshot"("chainId");
