-- CreateEnum
CREATE TYPE "LimitOrderStatus" AS ENUM ('pending', 'filled', 'cancelled');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('active', 'settled', 'consolidated');

-- CreateTable
CREATE TABLE "app_user" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "address" VARCHAR NOT NULL,
    "refCodeHash" VARCHAR,
    "maxReferrals" INTEGER NOT NULL DEFAULT 0,
    "referredById" INTEGER,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestation" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uid" VARCHAR NOT NULL,
    "attester" VARCHAR NOT NULL,
    "recipient" VARCHAR NOT NULL,
    "time" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "transactionHash" VARCHAR NOT NULL,
    "schemaId" VARCHAR NOT NULL,
    "data" VARCHAR NOT NULL,
    "decodedDataJson" VARCHAR NOT NULL DEFAULT '',
    "marketAddress" VARCHAR,
    "marketId" VARCHAR,
    "prediction" VARCHAR NOT NULL,
    "comment" TEXT,
    "questionId" VARCHAR,
    "condition" TEXT,
    "resolver" VARCHAR,

    CONSTRAINT "PK_attestation" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestation_score" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attestationId" INTEGER NOT NULL,
    "attester" VARCHAR NOT NULL,
    "marketAddress" VARCHAR,
    "marketId" VARCHAR,
    "questionId" VARCHAR,
    "madeAt" INTEGER NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "probabilityD18" VARCHAR,
    "probabilityFloat" DOUBLE PRECISION,
    "outcome" INTEGER,
    "errorSquared" DOUBLE PRECISION,
    "scoredAt" TIMESTAMP(6),
    "resolver" VARCHAR,

    CONSTRAINT "attestation_score_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "category" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR NOT NULL,
    "slug" VARCHAR NOT NULL,

    CONSTRAINT "PK_9c4e4a89e3674fc9f382d733f03" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "text" TEXT NOT NULL,
    "address" VARCHAR,
    "timestamp" BIGINT NOT NULL,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condition" (
    "id" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question" VARCHAR NOT NULL,
    "categoryId" INTEGER,
    "endTime" INTEGER NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT true,
    "claimStatement" VARCHAR NOT NULL,
    "description" TEXT NOT NULL,
    "similarMarkets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shortName" VARCHAR,
    "chainId" INTEGER NOT NULL DEFAULT 42161,
    "resolvedToYes" BOOLEAN NOT NULL DEFAULT false,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" INTEGER,
    "assertionId" VARCHAR,
    "assertionTimestamp" INTEGER,
    "openInterest" VARCHAR NOT NULL DEFAULT '0',
    "conditionGroupId" INTEGER,
    "displayOrder" INTEGER,
    "resolver" VARCHAR,

    CONSTRAINT "condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condition_group" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR NOT NULL,
    "categoryId" INTEGER,

    CONSTRAINT "condition_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockNumber" INTEGER NOT NULL,
    "transactionHash" VARCHAR NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "logData" JSON NOT NULL,

    CONSTRAINT "PK_30c2f3bbaf6d34a55f8ae6e4614" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_value_store" (
    "key" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "key_value_store_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "limit_order" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "orderId" VARCHAR NOT NULL,
    "predictor" VARCHAR NOT NULL,
    "resolver" VARCHAR NOT NULL,
    "predictorCollateral" VARCHAR NOT NULL,
    "counterpartyCollateral" VARCHAR NOT NULL,
    "refCode" VARCHAR,
    "status" "LimitOrderStatus" NOT NULL DEFAULT 'pending',
    "placedAt" INTEGER NOT NULL,
    "filledAt" INTEGER,
    "cancelledAt" INTEGER,
    "counterparty" VARCHAR,
    "placedTxHash" VARCHAR NOT NULL,
    "filledTxHash" VARCHAR,
    "cancelledTxHash" VARCHAR,

    CONSTRAINT "limit_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migrations" (
    "id" SERIAL NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "name" VARCHAR NOT NULL,

    CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "predictor" VARCHAR NOT NULL,
    "counterparty" VARCHAR NOT NULL,
    "predictorNftTokenId" VARCHAR NOT NULL,
    "counterpartyNftTokenId" VARCHAR NOT NULL,
    "totalCollateral" VARCHAR NOT NULL,
    "refCode" VARCHAR,
    "status" "PositionStatus" NOT NULL DEFAULT 'active',
    "predictorWon" BOOLEAN,
    "mintedAt" INTEGER NOT NULL,
    "settledAt" INTEGER,
    "endsAt" INTEGER,
    "predictorCollateral" VARCHAR,
    "counterpartyCollateral" VARCHAR,

    CONSTRAINT "parlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conditionId" TEXT NOT NULL,
    "positionId" INTEGER,
    "limitOrderId" INTEGER,
    "outcomeYes" BOOLEAN NOT NULL,
    "chainId" INTEGER,

    CONSTRAINT "prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_job" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" VARCHAR NOT NULL,
    "serviceId" VARCHAR NOT NULL,

    CONSTRAINT "PK_a00488019eafb11b27af1aa1a76" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_user_address" ON "app_user"("address" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_user_address" ON "app_user"("address" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_user_ref_code_hash" ON "app_user"("refCodeHash" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_attester" ON "attestation"("attester" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_market_address" ON "attestation"("marketAddress" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_market_id" ON "attestation"("marketId" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_question_id" ON "attestation"("questionId" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_recipient" ON "attestation"("recipient" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_resolver" ON "attestation"("resolver" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_time" ON "attestation"("time" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_attestation_uid" ON "attestation"("uid" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "attestation_uid_key" ON "attestation"("uid" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_score_attester" ON "attestation_score"("attester" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_score_attester_market" ON "attestation_score"("attester" ASC, "marketAddress" ASC, "marketId" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_score_attester_market_madeat" ON "attestation_score"("attester" ASC, "marketAddress" ASC, "marketId" ASC, "madeAt" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_score_market_address" ON "attestation_score"("marketAddress" ASC);

-- CreateIndex
CREATE INDEX "IDX_attestation_score_market_id" ON "attestation_score"("marketId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "attestation_score_attestationId_key" ON "attestation_score"("attestationId" ASC);

-- CreateIndex
CREATE INDEX "IDX_attester_market_tw_error_attester" ON "attester_market_tw_error"("attester" ASC);

-- CreateIndex
CREATE INDEX "IDX_attester_market_tw_error_market" ON "attester_market_tw_error"("marketAddress" ASC, "marketId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_attester_market_tw_error" ON "attester_market_tw_error"("attester" ASC, "marketAddress" ASC, "marketId" ASC);

-- CreateIndex
CREATE INDEX "IDX_cb73208f151aa71cdd78f662d7" ON "category"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_23c05c292c439d77b0de816b500" ON "category"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_cb73208f151aa71cdd78f662d70" ON "category"("slug" ASC);

-- CreateIndex
CREATE INDEX "IDX_chat_message_address" ON "chat_message"("address" ASC);

-- CreateIndex
CREATE INDEX "IDX_chat_message_timestamp" ON "chat_message"("timestamp" ASC);

-- CreateIndex
CREATE INDEX "IDX_condition_resolver" ON "condition"("resolver" ASC);

-- CreateIndex
CREATE INDEX "condition_categoryId_idx" ON "condition"("categoryId" ASC);

-- CreateIndex
CREATE INDEX "condition_conditionGroupId_idx" ON "condition"("conditionGroupId" ASC);

-- CreateIndex
CREATE INDEX "condition_endTime_idx" ON "condition"("endTime" ASC);

-- CreateIndex
CREATE INDEX "condition_group_categoryId_idx" ON "condition_group"("categoryId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "condition_group_name_key" ON "condition_group"("name" ASC);

-- CreateIndex
CREATE INDEX "IDX_2c15918ff289396205521c5f3c" ON "event"("timestamp" ASC);

-- CreateIndex
CREATE INDEX "IDX_5430e2d7fe1df2bcada2c12deb" ON "event"("blockNumber" ASC);

-- CreateIndex
CREATE INDEX "IDX_limit_order_chain_status" ON "limit_order"("chainId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "IDX_limit_order_predictor" ON "limit_order"("predictor" ASC);

-- CreateIndex
CREATE INDEX "IDX_limit_order_status" ON "limit_order"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_limit_order_chain_market_id" ON "limit_order"("chainId" ASC, "marketAddress" ASC, "orderId" ASC);

-- CreateIndex
CREATE INDEX "IDX_position_chain_market" ON "position"("chainId" ASC, "marketAddress" ASC);

-- CreateIndex
CREATE INDEX "IDX_position_counterparty" ON "position"("counterparty" ASC);

-- CreateIndex
CREATE INDEX "IDX_position_predictor" ON "position"("predictor" ASC);

-- CreateIndex
CREATE INDEX "IDX_prediction_condition" ON "prediction"("conditionId" ASC);

-- CreateIndex
CREATE INDEX "IDX_prediction_limit_order" ON "prediction"("limitOrderId" ASC);

-- CreateIndex
CREATE INDEX "IDX_prediction_position" ON "prediction"("positionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_prediction_limit_order_condition" ON "prediction"("limitOrderId" ASC, "conditionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_prediction_position_condition" ON "prediction"("positionId" ASC, "conditionId" ASC);

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation_score" ADD CONSTRAINT "attestation_score_attestationId_fkey" FOREIGN KEY ("attestationId") REFERENCES "attestation"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "condition" ADD CONSTRAINT "condition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "condition" ADD CONSTRAINT "condition_conditionGroupId_fkey" FOREIGN KEY ("conditionGroupId") REFERENCES "condition_group"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "condition_group" ADD CONSTRAINT "condition_group_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "prediction" ADD CONSTRAINT "prediction_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "condition"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "prediction" ADD CONSTRAINT "prediction_limitOrderId_fkey" FOREIGN KEY ("limitOrderId") REFERENCES "limit_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "prediction" ADD CONSTRAINT "prediction_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "position"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

