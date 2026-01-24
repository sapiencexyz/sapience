-- CreateTable
CREATE TABLE "protocol_stats_snapshot" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timestamp" INTEGER NOT NULL,
    "vaultBalance" VARCHAR NOT NULL,
    "escrowBalance" VARCHAR NOT NULL,

    CONSTRAINT "protocol_stats_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_protocol_stats_snapshot_timestamp" ON "protocol_stats_snapshot"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_protocol_stats_snapshot_timestamp" ON "protocol_stats_snapshot"("timestamp");
