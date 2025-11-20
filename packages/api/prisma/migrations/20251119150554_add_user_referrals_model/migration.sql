-- CreateTable
CREATE TABLE "app_user" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "address" VARCHAR NOT NULL,
    "refCodeHash" VARCHAR,
    "maxReferrals" INTEGER NOT NULL DEFAULT 0,
    "referredById" INTEGER,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_user_address" ON "app_user"("address");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_user_ref_code_hash" ON "app_user"("refCodeHash");

-- CreateIndex
CREATE INDEX "IDX_user_address" ON "app_user"("address");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
