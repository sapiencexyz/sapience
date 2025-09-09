-- CreateTable
CREATE TABLE "condition" (
    "id" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question" VARCHAR NOT NULL,
    "categoryId" INTEGER,
    "endTime" INTEGER NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT true,
    "claimStatement" VARCHAR NOT NULL,
    "description" TEXT NOT NULL,
    "similarMarkets" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "condition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "condition_categoryId_idx" ON "condition"("categoryId");

-- CreateIndex
CREATE INDEX "condition_endTime_idx" ON "condition"("endTime");

-- AddForeignKey
ALTER TABLE "condition" ADD CONSTRAINT "condition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
