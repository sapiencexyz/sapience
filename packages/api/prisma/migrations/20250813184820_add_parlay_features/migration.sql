-- AlterTable
ALTER TABLE "market" ADD COLUMN     "similarMarkets" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "parlay_incompatibility" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketAId" INTEGER NOT NULL,
    "marketBId" INTEGER NOT NULL,
    "incompatibilityReason" TEXT,

    CONSTRAINT "parlay_incompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parlay_incompatibility_marketAId_idx" ON "parlay_incompatibility"("marketAId");

-- CreateIndex
CREATE INDEX "parlay_incompatibility_marketBId_idx" ON "parlay_incompatibility"("marketBId");

-- CreateIndex
CREATE UNIQUE INDEX "parlay_incompatibility_marketAId_marketBId_key" ON "parlay_incompatibility"("marketAId", "marketBId");

-- AddForeignKey
ALTER TABLE "parlay_incompatibility" ADD CONSTRAINT "parlay_incompatibility_marketAId_fkey" FOREIGN KEY ("marketAId") REFERENCES "market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parlay_incompatibility" ADD CONSTRAINT "parlay_incompatibility_marketBId_fkey" FOREIGN KEY ("marketBId") REFERENCES "market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
