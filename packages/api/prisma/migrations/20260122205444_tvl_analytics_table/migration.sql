-- CreateTable
CREATE TABLE "protocol_stats_snapshot" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotDate" DATE NOT NULL,
    "chainId" INTEGER NOT NULL,
    "vaultTVL" VARCHAR NOT NULL,
    "predictionMarketTVL" VARCHAR NOT NULL,
    "computedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "protocol_stats_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_protocol_stats_snapshot_chain" ON "protocol_stats_snapshot"("chainId");

-- CreateIndex
CREATE INDEX "IDX_protocol_stats_snapshot_date" ON "protocol_stats_snapshot"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_protocol_stats_snapshot_date_chain" ON "protocol_stats_snapshot"("snapshotDate", "chainId");
