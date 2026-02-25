-- CreateTable
CREATE TABLE "collateral_transfer" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "transactionHash" VARCHAR NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "from" VARCHAR NOT NULL,
    "to" VARCHAR NOT NULL,
    "value" VARCHAR NOT NULL,

    CONSTRAINT "collateral_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_collateral_transfer_from" ON "collateral_transfer"("chainId", "from");

-- CreateIndex
CREATE INDEX "IDX_collateral_transfer_to" ON "collateral_transfer"("chainId", "to");

-- CreateIndex
CREATE INDEX "IDX_collateral_transfer_block" ON "collateral_transfer"("chainId", "blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "collateral_transfer_chainId_transactionHash_logIndex_key" ON "collateral_transfer"("chainId", "transactionHash", "logIndex");
