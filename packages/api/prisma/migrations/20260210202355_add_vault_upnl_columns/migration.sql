-- AlterTable
ALTER TABLE "protocol_stats_snapshot" ADD COLUMN     "uPnLQuoteFromRelayer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vaultCollateralPerShare" VARCHAR NOT NULL DEFAULT '0',
ADD COLUMN     "vaultFairValueAssets" VARCHAR NOT NULL DEFAULT '0',
ADD COLUMN     "vaultTotalSupply" VARCHAR NOT NULL DEFAULT '0',
ADD COLUMN     "vaultUPnL" VARCHAR NOT NULL DEFAULT '0';
