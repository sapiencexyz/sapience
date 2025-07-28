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
    "marketAddress" VARCHAR NOT NULL,
    "marketId" VARCHAR NOT NULL,
    "prediction" VARCHAR NOT NULL,
    "comment" TEXT,

    CONSTRAINT "PK_attestation" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attestation_uid_key" ON "attestation"("uid");

-- CreateIndex
CREATE INDEX "IDX_attestation_attester" ON "attestation"("attester");

-- CreateIndex
CREATE INDEX "IDX_attestation_recipient" ON "attestation"("recipient");

-- CreateIndex
CREATE INDEX "IDX_attestation_time" ON "attestation"("time");

-- CreateIndex
CREATE INDEX "IDX_attestation_market_address" ON "attestation"("marketAddress");

-- CreateIndex
CREATE INDEX "IDX_attestation_market_id" ON "attestation"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_attestation_uid" ON "attestation"("uid");
