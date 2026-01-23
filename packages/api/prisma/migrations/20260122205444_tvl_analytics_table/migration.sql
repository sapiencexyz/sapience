-- CreateTable
CREATE TABLE "protocol_stats_snapshot" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotTimestamp" INTEGER NOT NULL,
    "chainId" INTEGER NOT NULL,
    "vaultTVL" VARCHAR NOT NULL,
    "predictionMarketTVL" VARCHAR NOT NULL,

    CONSTRAINT "protocol_stats_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_protocol_stats_snapshot_chain" ON "protocol_stats_snapshot"("chainId");

-- CreateIndex
CREATE INDEX "IDX_protocol_stats_snapshot_timestamp" ON "protocol_stats_snapshot"("snapshotTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_protocol_stats_snapshot_timestamp_chain" ON "protocol_stats_snapshot"("snapshotTimestamp", "chainId");
