-- AlterTable
ALTER TABLE "v2_pick_configuration" ADD COLUMN "fullyRedeemed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "IDX_v2_pick_config_fully_redeemed" ON "v2_pick_configuration"("fullyRedeemed");
