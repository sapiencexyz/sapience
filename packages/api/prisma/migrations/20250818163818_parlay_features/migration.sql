-- AlterTable
ALTER TABLE "market" ADD COLUMN     "similarMarkets" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "parlay_incompatibility" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketGroupAId" INTEGER NOT NULL,
    "marketGroupBId" INTEGER NOT NULL,
    "incompatibilityReason" TEXT,

    CONSTRAINT "parlay_incompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parlay_incompatibility_marketGroupAId_idx" ON "parlay_incompatibility"("marketGroupAId");

-- CreateIndex
CREATE INDEX "parlay_incompatibility_marketGroupBId_idx" ON "parlay_incompatibility"("marketGroupBId");

-- CreateIndex
CREATE UNIQUE INDEX "parlay_incompatibility_marketGroupAId_marketGroupBId_key" ON "parlay_incompatibility"("marketGroupAId", "marketGroupBId");

-- AddForeignKey
ALTER TABLE "parlay_incompatibility" ADD CONSTRAINT "parlay_incompatibility_marketGroupAId_fkey" FOREIGN KEY ("marketGroupAId") REFERENCES "market_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parlay_incompatibility" ADD CONSTRAINT "parlay_incompatibility_marketGroupBId_fkey" FOREIGN KEY ("marketGroupBId") REFERENCES "market_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
