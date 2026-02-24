-- AlterTable
ALTER TABLE "Picks" ADD COLUMN IF NOT EXISTS "fullyRedeemed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IDX_pick_config_fully_redeemed" ON "Picks"("fullyRedeemed");
