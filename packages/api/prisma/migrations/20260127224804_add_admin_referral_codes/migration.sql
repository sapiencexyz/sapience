-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "referredByCodeId" INTEGER;

-- CreateTable
CREATE TABLE "referral_code" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "codeHash" VARCHAR NOT NULL,
    "maxClaims" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" INTEGER,
    "createdBy" VARCHAR NOT NULL,
    "creatorType" VARCHAR(10) NOT NULL DEFAULT 'user',

    CONSTRAINT "referral_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_referral_code_hash" ON "referral_code"("codeHash");

-- CreateIndex
CREATE INDEX "IDX_referral_code_hash" ON "referral_code"("codeHash");

-- CreateIndex
CREATE INDEX "IDX_referral_code_active" ON "referral_code"("isActive");

-- CreateIndex
CREATE INDEX "IDX_referral_code_created_by" ON "referral_code"("createdBy");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_referredByCodeId_fkey" FOREIGN KEY ("referredByCodeId") REFERENCES "referral_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;
