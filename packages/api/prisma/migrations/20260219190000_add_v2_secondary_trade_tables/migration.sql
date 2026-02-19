-- CreateTable
CREATE TABLE "v2_secondary_trade" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "tradeHash" VARCHAR NOT NULL,
    "seller" VARCHAR NOT NULL,
    "buyer" VARCHAR NOT NULL,
    "token" VARCHAR NOT NULL,
    "collateral" VARCHAR NOT NULL,
    "tokenAmount" VARCHAR NOT NULL,
    "price" VARCHAR NOT NULL,
    "refCode" VARCHAR,
    "executedAt" INTEGER NOT NULL,
    "txHash" VARCHAR NOT NULL,
    "blockNumber" INTEGER NOT NULL,

    CONSTRAINT "v2_secondary_trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_secondary_indexer_state" (
    "chainId" INTEGER NOT NULL,
    "contractAddress" VARCHAR NOT NULL,
    "lastIndexedBlock" INTEGER NOT NULL,
    "lastIndexedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v2_secondary_indexer_state_pkey" PRIMARY KEY ("chainId")
);

-- CreateIndex
CREATE UNIQUE INDEX "v2_secondary_trade_tradeHash_key" ON "v2_secondary_trade"("tradeHash");

-- CreateIndex
CREATE INDEX "IDX_v2_secondary_trade_chain" ON "v2_secondary_trade"("chainId");

-- CreateIndex
CREATE INDEX "IDX_v2_secondary_trade_seller" ON "v2_secondary_trade"("seller");

-- CreateIndex
CREATE INDEX "IDX_v2_secondary_trade_buyer" ON "v2_secondary_trade"("buyer");

-- CreateIndex
CREATE INDEX "IDX_v2_secondary_trade_token" ON "v2_secondary_trade"("token");
