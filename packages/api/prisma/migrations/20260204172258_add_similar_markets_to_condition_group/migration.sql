-- AlterTable
ALTER TABLE "condition_group" ADD COLUMN     "similarMarkets" TEXT[] DEFAULT ARRAY[]::TEXT[];
