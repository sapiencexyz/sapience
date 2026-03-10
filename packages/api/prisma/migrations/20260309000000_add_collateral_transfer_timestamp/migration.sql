-- AlterTable
ALTER TABLE "collateral_transfer" ADD COLUMN "timestamp" TIMESTAMP(6) NOT NULL DEFAULT NOW();

-- Once backfilled, remove the default
ALTER TABLE "collateral_transfer" ALTER COLUMN "timestamp" DROP DEFAULT;
