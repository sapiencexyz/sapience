-- CreateEnum
CREATE TYPE "ParlayStatus" AS ENUM ('active', 'settled', 'consolidated');

-- CreateTable
CREATE TABLE "parlay" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "maker" VARCHAR NOT NULL,
    "taker" VARCHAR NOT NULL,
    "makerNftTokenId" VARCHAR NOT NULL,
    "takerNftTokenId" VARCHAR NOT NULL,
    "totalCollateral" VARCHAR NOT NULL,
    "refCode" VARCHAR,
    "status" "ParlayStatus" NOT NULL DEFAULT 'active',
    "makerWon" BOOLEAN,
    "mintedAt" INTEGER NOT NULL,
    "settledAt" INTEGER,
    "endsAt" INTEGER,
    "predictedOutcomes" JSON NOT NULL,

    CONSTRAINT "parlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_parlay_maker" ON "parlay"("maker");

-- CreateIndex
CREATE INDEX "IDX_parlay_taker" ON "parlay"("taker");

-- CreateIndex
CREATE INDEX "IDX_parlay_chain_market" ON "parlay"("chainId", "marketAddress");
