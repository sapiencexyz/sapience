-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "V2SettlementResult" AS ENUM ('UNRESOLVED', 'PREDICTOR_WINS', 'COUNTERPARTY_WINS', 'NON_DECISIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "v2_indexer_state" (
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "lastIndexedBlock" INTEGER NOT NULL,
    "lastIndexedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v2_indexer_state_pkey" PRIMARY KEY ("chainId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "v2_prediction" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "predictionId" VARCHAR NOT NULL,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "predictor" VARCHAR NOT NULL,
    "counterparty" VARCHAR NOT NULL,
    "predictorToken" VARCHAR NOT NULL,
    "counterpartyToken" VARCHAR NOT NULL,
    "predictorCollateral" VARCHAR NOT NULL,
    "counterpartyCollateral" VARCHAR NOT NULL,
    "onChainCreatedAt" INTEGER NOT NULL,
    "createTxHash" VARCHAR NOT NULL,
    "refCode" VARCHAR,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" INTEGER,
    "settleTxHash" VARCHAR,
    "result" "V2SettlementResult" NOT NULL DEFAULT 'UNRESOLVED',
    "predictorClaimable" VARCHAR,
    "counterpartyClaimable" VARCHAR,
    "collateralDeposited" VARCHAR,
    "collateralDepositedAt" INTEGER,

    CONSTRAINT "v2_prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "v2_pick_configuration" (
    "id" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "totalPredictorCollateral" VARCHAR NOT NULL DEFAULT '0',
    "totalCounterpartyCollateral" VARCHAR NOT NULL DEFAULT '0',
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
CREATE TABLE IF NOT EXISTS "v2_pick" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickConfigId" VARCHAR NOT NULL,
    "conditionResolver" VARCHAR NOT NULL,
    "conditionId" VARCHAR NOT NULL,
    "predictedOutcome" INTEGER NOT NULL,

    CONSTRAINT "v2_pick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "v2_position_balance" (
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
CREATE TABLE IF NOT EXISTS "v2_redemption_record" (
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
CREATE TABLE IF NOT EXISTS "v2_burn_record" (
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

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "v2_prediction_predictionId_key" ON "v2_prediction"("predictionId");
CREATE INDEX IF NOT EXISTS "IDX_v2_prediction_chain_market" ON "v2_prediction"("chainId", "marketAddress");
CREATE INDEX IF NOT EXISTS "IDX_v2_prediction_predictor" ON "v2_prediction"("predictor");
CREATE INDEX IF NOT EXISTS "IDX_v2_prediction_counterparty" ON "v2_prediction"("counterparty");
CREATE INDEX IF NOT EXISTS "IDX_v2_prediction_settled" ON "v2_prediction"("settled");

CREATE INDEX IF NOT EXISTS "IDX_v2_pick_config_chain_market" ON "v2_pick_configuration"("chainId", "marketAddress");
CREATE INDEX IF NOT EXISTS "IDX_v2_pick_config_resolved" ON "v2_pick_configuration"("resolved");

CREATE INDEX IF NOT EXISTS "IDX_v2_pick_config_id" ON "v2_pick"("pickConfigId");

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_v2_position_balance" ON "v2_position_balance"("chainId", "tokenAddress", "holder");
CREATE INDEX IF NOT EXISTS "IDX_v2_position_balance_holder" ON "v2_position_balance"("holder");
CREATE INDEX IF NOT EXISTS "IDX_v2_position_balance_pick_config" ON "v2_position_balance"("pickConfigId");

CREATE INDEX IF NOT EXISTS "IDX_v2_redemption_chain_market" ON "v2_redemption_record"("chainId", "marketAddress");
CREATE INDEX IF NOT EXISTS "IDX_v2_redemption_holder" ON "v2_redemption_record"("holder");
CREATE INDEX IF NOT EXISTS "IDX_v2_redemption_prediction" ON "v2_redemption_record"("predictionId");

CREATE INDEX IF NOT EXISTS "IDX_v2_burn_chain_market" ON "v2_burn_record"("chainId", "marketAddress");
CREATE INDEX IF NOT EXISTS "IDX_v2_burn_pick_config" ON "v2_burn_record"("pickConfigId");
CREATE INDEX IF NOT EXISTS "IDX_v2_burn_predictor" ON "v2_burn_record"("predictorHolder");
CREATE INDEX IF NOT EXISTS "IDX_v2_burn_counterparty" ON "v2_burn_record"("counterpartyHolder");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "v2_pick" ADD CONSTRAINT "v2_pick_pickConfigId_fkey" FOREIGN KEY ("pickConfigId") REFERENCES "v2_pick_configuration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "v2_position_balance" ADD CONSTRAINT "v2_position_balance_pickConfigId_fkey" FOREIGN KEY ("pickConfigId") REFERENCES "v2_pick_configuration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
