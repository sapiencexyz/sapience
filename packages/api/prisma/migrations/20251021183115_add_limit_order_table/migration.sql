-- CreateEnum
CREATE TYPE "LimitOrderStatus" AS ENUM ('pending', 'filled', 'cancelled');

-- CreateTable
CREATE TABLE "limit_order" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "orderId" VARCHAR NOT NULL,
    "maker" VARCHAR NOT NULL,
    "resolver" VARCHAR NOT NULL,
    "makerCollateral" VARCHAR NOT NULL,
    "takerCollateral" VARCHAR NOT NULL,
    "refCode" VARCHAR,
    "status" "LimitOrderStatus" NOT NULL DEFAULT 'pending',
    "placedAt" INTEGER NOT NULL,
    "filledAt" INTEGER,
    "cancelledAt" INTEGER,
    "taker" VARCHAR,
    "placedTxHash" VARCHAR NOT NULL,
    "filledTxHash" VARCHAR,
    "cancelledTxHash" VARCHAR,
    "predictedOutcomes" JSON NOT NULL,

    CONSTRAINT "PK_limit_order" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_limit_order_chain_market_id" ON "limit_order"("chainId", "marketAddress", "orderId");

-- CreateIndex
CREATE INDEX "IDX_limit_order_maker" ON "limit_order"("maker");

-- CreateIndex
CREATE INDEX "IDX_limit_order_chain_status" ON "limit_order"("chainId", "status");

-- CreateIndex
CREATE INDEX "IDX_limit_order_status" ON "limit_order"("status");

