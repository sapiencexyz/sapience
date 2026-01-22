-- CreateTable
CREATE TABLE "protocol_tvl_snapshot" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotDate" DATE NOT NULL,
    "chainId" INTEGER NOT NULL,
    "vaultTVL" VARCHAR NOT NULL,
    "predictionMarketTVL" VARCHAR NOT NULL,
    "totalTVL" VARCHAR NOT NULL,
    "computedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "protocol_tvl_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_protocol_tvl_snapshot_chain" ON "protocol_tvl_snapshot"("chainId");

-- CreateIndex
CREATE INDEX "IDX_protocol_tvl_snapshot_date" ON "protocol_tvl_snapshot"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_protocol_tvl_snapshot_date_chain" ON "protocol_tvl_snapshot"("snapshotDate", "chainId");
