-- AlterTable
ALTER TABLE "condition" ADD COLUMN     "conditionGroupId" INTEGER,
ADD COLUMN     "displayOrder" INTEGER;

-- CreateTable
CREATE TABLE "condition_group" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR NOT NULL,
    "categoryId" INTEGER,

    CONSTRAINT "condition_group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "condition_group_name_key" ON "condition_group"("name");

-- CreateIndex
CREATE INDEX "condition_group_categoryId_idx" ON "condition_group"("categoryId");

-- CreateIndex
CREATE INDEX "condition_conditionGroupId_idx" ON "condition"("conditionGroupId");

-- AddForeignKey
ALTER TABLE "condition" ADD CONSTRAINT "condition_conditionGroupId_fkey" FOREIGN KEY ("conditionGroupId") REFERENCES "condition_group"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "condition_group" ADD CONSTRAINT "condition_group_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
