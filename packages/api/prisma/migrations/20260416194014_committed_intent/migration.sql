-- CreateEnum
CREATE TYPE "V2CommitmentStatus" AS ENUM ('OPEN', 'EXECUTED', 'EXPIRED', 'SLASH_ONLY_STAY_ALIVE');

-- CreateTable
CREATE TABLE "commitment" (
    "id" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "predictor" VARCHAR NOT NULL,
    "pickConfigId" VARCHAR NOT NULL,
    "amountIn" VARCHAR NOT NULL,
    "minFillIn" VARCHAR NOT NULL,
    "minAmountOut" VARCHAR NOT NULL,
    "executorTip" VARCHAR NOT NULL,
    "predictorWindowEnd" INTEGER NOT NULL,
    "deadline" INTEGER NOT NULL,
    "nonce" VARCHAR NOT NULL,
    "sponsorUse" VARCHAR NOT NULL,
    "walletUse" VARCHAR NOT NULL,
    "createdBlock" INTEGER NOT NULL,
    "createdTxHash" VARCHAR NOT NULL,
    "status" "V2CommitmentStatus" NOT NULL DEFAULT 'OPEN',
    "filledIn" VARCHAR,
    "filledOut" VARCHAR,
    "refundedIn" VARCHAR,
    "tipPaid" VARCHAR,
    "walletRefunded" VARCHAR,
    "sponsorReleased" VARCHAR,
    "settledAt" INTEGER,
    "settledTxHash" VARCHAR,

    CONSTRAINT "commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_slice" (
    "id" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "commitmentHash" VARCHAR NOT NULL,
    "sliceIndex" INTEGER NOT NULL,
    "quoteHash" VARCHAR NOT NULL,
    "counterparty" VARCHAR NOT NULL,
    "sliceIn" VARCHAR NOT NULL,
    "sliceOut" VARCHAR NOT NULL,
    "sliceBonus" VARCHAR NOT NULL,
    "predictionId" VARCHAR NOT NULL,
    "txHash" VARCHAR NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "indexedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commitment_slice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_slash" (
    "id" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "commitmentHash" VARCHAR NOT NULL,
    "counterparty" VARCHAR NOT NULL,
    "vaultDrained" VARCHAR NOT NULL,
    "makeWhole" VARCHAR NOT NULL,
    "poolContribution" VARCHAR NOT NULL,
    "poolReceived" VARCHAR NOT NULL,
    "txHash" VARCHAR NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "indexedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commitment_slash_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparty_vault_event" (
    "id" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "counterparty" VARCHAR NOT NULL,
    "eventType" VARCHAR NOT NULL,
    "amount" VARCHAR NOT NULL,
    "txHash" VARCHAR NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "indexedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counterparty_vault_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_pool_event" (
    "id" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "eventType" VARCHAR NOT NULL,
    "fromCounterparty" VARCHAR,
    "commitmentHash" VARCHAR,
    "amount" VARCHAR NOT NULL,
    "txHash" VARCHAR NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "indexedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_pool_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_commitment_chain" ON "commitment"("chainId");

-- CreateIndex
CREATE INDEX "IDX_commitment_predictor" ON "commitment"("predictor");

-- CreateIndex
CREATE INDEX "IDX_commitment_pick_config" ON "commitment"("pickConfigId");

-- CreateIndex
CREATE INDEX "IDX_commitment_status" ON "commitment"("status");

-- CreateIndex
CREATE INDEX "IDX_commitment_created_block" ON "commitment"("createdBlock");

-- CreateIndex
CREATE INDEX "IDX_commitment_slice_hash_idx" ON "commitment_slice"("commitmentHash", "sliceIndex");

-- CreateIndex
CREATE INDEX "IDX_commitment_slice_counterparty" ON "commitment_slice"("counterparty");

-- CreateIndex
CREATE INDEX "IDX_commitment_slice_prediction" ON "commitment_slice"("predictionId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_commitment_slice_tx_log" ON "commitment_slice"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "IDX_commitment_slash_hash" ON "commitment_slash"("commitmentHash");

-- CreateIndex
CREATE INDEX "IDX_commitment_slash_counterparty" ON "commitment_slash"("counterparty");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_commitment_slash_tx_log" ON "commitment_slash"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "IDX_cp_vault_event_counterparty" ON "counterparty_vault_event"("counterparty");

-- CreateIndex
CREATE INDEX "IDX_cp_vault_event_chain_cp" ON "counterparty_vault_event"("chainId", "counterparty");

-- CreateIndex
CREATE INDEX "IDX_cp_vault_event_type" ON "counterparty_vault_event"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_cp_vault_event_tx_log" ON "counterparty_vault_event"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "IDX_insurance_pool_event_chain" ON "insurance_pool_event"("chainId");

-- CreateIndex
CREATE INDEX "IDX_insurance_pool_event_type" ON "insurance_pool_event"("eventType");

-- CreateIndex
CREATE INDEX "IDX_insurance_pool_event_commitment" ON "insurance_pool_event"("commitmentHash");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_insurance_pool_event_tx_log" ON "insurance_pool_event"("txHash", "logIndex");

-- AddForeignKey
ALTER TABLE "commitment_slice" ADD CONSTRAINT "commitment_slice_commitmentHash_fkey" FOREIGN KEY ("commitmentHash") REFERENCES "commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_slash" ADD CONSTRAINT "commitment_slash_commitmentHash_fkey" FOREIGN KEY ("commitmentHash") REFERENCES "commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
