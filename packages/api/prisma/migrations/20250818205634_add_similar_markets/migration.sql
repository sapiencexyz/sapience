-- AlterTable
ALTER TABLE "market" ADD COLUMN     "similarMarkets" TEXT[] DEFAULT ARRAY[]::TEXT[];
