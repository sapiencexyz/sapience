-- CreateTable
CREATE TABLE "attester_market_tw_error" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attester" VARCHAR NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "marketId" INTEGER NOT NULL,
    "twError" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "attester_market_tw_error_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_market_realized_pnl" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "address" VARCHAR NOT NULL,
    "marketId" INTEGER NOT NULL,
    "owner" VARCHAR NOT NULL,
    "realizedPnl" DECIMAL(78,0) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "owner_market_realized_pnl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_attester_market_tw_error_attester" ON "attester_market_tw_error"("attester");

-- CreateIndex
CREATE INDEX "IDX_attester_market_tw_error_market" ON "attester_market_tw_error"("marketAddress", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_attester_market_tw_error" ON "attester_market_tw_error"("attester", "marketAddress", "marketId");

-- CreateIndex
CREATE INDEX "IDX_owner_market_realized_pnl_owner" ON "owner_market_realized_pnl"("owner");

-- CreateIndex
CREATE INDEX "IDX_owner_market_realized_pnl_market" ON "owner_market_realized_pnl"("chainId", "address", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_owner_market_realized_pnl" ON "owner_market_realized_pnl"("chainId", "address", "marketId", "owner");

-- CreateIndex
CREATE INDEX "IDX_attestation_score_attester_market_madeat" ON "attestation_score"("attester", "marketAddress", "marketId", "madeAt");

-- CreateIndex
CREATE INDEX "IDX_position_market_id" ON "position"("marketId");

-- CreateIndex
CREATE INDEX "IDX_transaction_position_id" ON "transaction"("positionId");
