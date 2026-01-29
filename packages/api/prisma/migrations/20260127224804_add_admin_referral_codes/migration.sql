-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "referredByCodeId" INTEGER;

-- CreateTable
CREATE TABLE "referral_code" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "code" VARCHAR NOT NULL,
    "codeHash" VARCHAR NOT NULL,
    "description" TEXT,
    "maxClaims" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" INTEGER,
    "createdBy" VARCHAR NOT NULL,

    CONSTRAINT "referral_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_code_code_key" ON "referral_code"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_referral_code_hash" ON "referral_code"("codeHash");

-- CreateIndex
CREATE INDEX "IDX_referral_code_hash" ON "referral_code"("codeHash");

-- CreateIndex
CREATE INDEX "IDX_referral_code_active" ON "referral_code"("isActive");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_referredByCodeId_fkey" FOREIGN KEY ("referredByCodeId") REFERENCES "referral_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;
