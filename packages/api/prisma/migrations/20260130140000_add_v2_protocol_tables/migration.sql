-- CreateEnum
CREATE TYPE "V2SettlementResult" AS ENUM ('UNRESOLVED', 'PREDICTOR_WINS', 'COUNTERPARTY_WINS', 'NON_DECISIVE');

-- CreateTable
CREATE TABLE "v2_pick_configuration" (
    "id" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "totalPredictorCollateral" VARCHAR NOT NULL,
    "totalCounterpartyCollateral" VARCHAR NOT NULL,
    "claimedPredictorCollateral" VARCHAR NOT NULL DEFAULT '0',
    "claimedCounterpartyCollateral" VARCHAR NOT NULL DEFAULT '0',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "result" "V2SettlementResult" NOT NULL DEFAULT 'UNRESOLVED',
    "resolvedAt" INTEGER,
    "predictorToken" VARCHAR,
    "counterpartyToken" VARCHAR,
    "endsAt" INTEGER,

    CONSTRAINT "v2_pick_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_pick" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickConfigId" VARCHAR NOT NULL,
    "conditionResolver" VARCHAR NOT NULL,
    "conditionId" VARCHAR NOT NULL,
    "predictedOutcome" INTEGER NOT NULL,

    CONSTRAINT "v2_pick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_prediction" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "predictionId" VARCHAR NOT NULL,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "predictor" VARCHAR NOT NULL,
    "counterparty" VARCHAR NOT NULL,
    "predictorToken" VARCHAR NOT NULL,
    "counterpartyToken" VARCHAR NOT NULL,
    "predictorWager" VARCHAR NOT NULL,
    "counterpartyWager" VARCHAR NOT NULL,
    "collateralDeposited" VARCHAR,
    "collateralDepositedAt" INTEGER,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" INTEGER,
    "settleTxHash" VARCHAR,
    "result" "V2SettlementResult" NOT NULL DEFAULT 'UNRESOLVED',
    "predictorClaimable" VARCHAR,
    "counterpartyClaimable" VARCHAR,
    "onChainCreatedAt" INTEGER NOT NULL,
    "createTxHash" VARCHAR NOT NULL,
    "refCode" VARCHAR,

    CONSTRAINT "v2_prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_position_balance" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "tokenAddress" VARCHAR NOT NULL,
    "pickConfigId" VARCHAR NOT NULL,
    "isPredictorToken" BOOLEAN NOT NULL,
    "holder" VARCHAR NOT NULL,
    "balance" VARCHAR NOT NULL,

    CONSTRAINT "v2_position_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_burn_record" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "pickConfigId" VARCHAR NOT NULL,
    "predictorHolder" VARCHAR NOT NULL,
    "counterpartyHolder" VARCHAR NOT NULL,
    "predictorTokensBurned" VARCHAR NOT NULL,
    "counterpartyTokensBurned" VARCHAR NOT NULL,
    "predictorPayout" VARCHAR NOT NULL,
    "counterpartyPayout" VARCHAR NOT NULL,
    "burnedAt" INTEGER NOT NULL,
    "txHash" VARCHAR NOT NULL,
    "refCode" VARCHAR,

    CONSTRAINT "v2_burn_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_redemption_record" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "predictionId" VARCHAR NOT NULL,
    "holder" VARCHAR NOT NULL,
    "positionToken" VARCHAR NOT NULL,
    "tokensBurned" VARCHAR NOT NULL,
    "collateralPaid" VARCHAR NOT NULL,
    "redeemedAt" INTEGER NOT NULL,
    "txHash" VARCHAR NOT NULL,
    "refCode" VARCHAR,

    CONSTRAINT "v2_redemption_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_indexer_state" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "lastIndexedBlock" INTEGER NOT NULL,
    "lastIndexedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "v2_indexer_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_v2_pick_config_chain_market" ON "v2_pick_configuration"("chainId", "marketAddress");

-- CreateIndex
CREATE INDEX "IDX_v2_pick_config_resolved" ON "v2_pick_configuration"("resolved");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_v2_pick_config_chain_market_id" ON "v2_pick_configuration"("chainId", "marketAddress", "id");

-- CreateIndex
CREATE INDEX "IDX_v2_pick_condition" ON "v2_pick"("conditionId");

-- CreateIndex
CREATE INDEX "IDX_v2_pick_resolver" ON "v2_pick"("conditionResolver");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_v2_pick_config_resolver_condition" ON "v2_pick"("pickConfigId", "conditionResolver", "conditionId");

-- CreateIndex
CREATE UNIQUE INDEX "v2_prediction_predictionId_key" ON "v2_prediction"("predictionId");

-- CreateIndex
CREATE INDEX "IDX_v2_prediction_predictor" ON "v2_prediction"("predictor");

-- CreateIndex
CREATE INDEX "IDX_v2_prediction_counterparty" ON "v2_prediction"("counterparty");

-- CreateIndex
CREATE INDEX "IDX_v2_prediction_chain_market" ON "v2_prediction"("chainId", "marketAddress");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_v2_prediction_chain_market_id" ON "v2_prediction"("chainId", "marketAddress", "predictionId");

-- CreateIndex
CREATE INDEX "IDX_v2_position_balance_holder" ON "v2_position_balance"("holder");

-- CreateIndex
CREATE INDEX "IDX_v2_position_balance_pick_config" ON "v2_position_balance"("pickConfigId");

-- CreateIndex
CREATE INDEX "IDX_v2_position_balance_chain_token" ON "v2_position_balance"("chainId", "tokenAddress");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_v2_position_balance_chain_token_holder" ON "v2_position_balance"("chainId", "tokenAddress", "holder");

-- CreateIndex
CREATE INDEX "IDX_v2_burn_record_pick_config" ON "v2_burn_record"("pickConfigId");

-- CreateIndex
CREATE INDEX "IDX_v2_burn_record_predictor" ON "v2_burn_record"("predictorHolder");

-- CreateIndex
CREATE INDEX "IDX_v2_burn_record_counterparty" ON "v2_burn_record"("counterpartyHolder");

-- CreateIndex
CREATE INDEX "IDX_v2_redemption_prediction" ON "v2_redemption_record"("predictionId");

-- CreateIndex
CREATE INDEX "IDX_v2_redemption_holder" ON "v2_redemption_record"("holder");

-- CreateIndex
CREATE UNIQUE INDEX "v2_indexer_state_chainId_key" ON "v2_indexer_state"("chainId");

-- AddForeignKey
ALTER TABLE "v2_pick" ADD CONSTRAINT "v2_pick_pickConfigId_fkey" FOREIGN KEY ("pickConfigId") REFERENCES "v2_pick_configuration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2_pick" ADD CONSTRAINT "v2_pick_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "condition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
