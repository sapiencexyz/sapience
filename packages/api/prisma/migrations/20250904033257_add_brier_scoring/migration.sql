-- CreateTable
CREATE TABLE "attestation_score" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attestationId" INTEGER NOT NULL,
    "attester" VARCHAR NOT NULL,
    "marketAddress" VARCHAR NOT NULL,
    "marketId" VARCHAR NOT NULL,
    "questionId" VARCHAR,
    "madeAt" INTEGER NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "probabilityD18" VARCHAR,
    "probabilityFloat" DOUBLE PRECISION,
    "outcome" INTEGER,
    "errorSquared" DOUBLE PRECISION,
    "scoredAt" TIMESTAMP(6),

    CONSTRAINT "attestation_score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attestation_score_attestationId_key" ON "attestation_score"("attestationId");

-- CreateIndex
CREATE INDEX "IDX_attestation_score_attester" ON "attestation_score"("attester");

-- CreateIndex
CREATE INDEX "IDX_attestation_score_market_address" ON "attestation_score"("marketAddress");

-- CreateIndex
CREATE INDEX "IDX_attestation_score_market_id" ON "attestation_score"("marketId");

-- CreateIndex
CREATE INDEX "IDX_attestation_score_attester_market" ON "attestation_score"("attester", "marketAddress", "marketId");

-- AddForeignKey
ALTER TABLE "attestation_score" ADD CONSTRAINT "attestation_score_attestationId_fkey" FOREIGN KEY ("attestationId") REFERENCES "attestation"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
