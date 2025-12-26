/*
  Warnings:

  - You are about to drop the column `condition` on the `attestation` table. All the data in the column will be lost.
  - You are about to drop the column `marketAddress` on the `attestation` table. All the data in the column will be lost.
  - You are about to drop the column `marketId` on the `attestation` table. All the data in the column will be lost.
  - You are about to drop the column `questionId` on the `attestation` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "IDX_attestation_market_address";

-- DropIndex
DROP INDEX "IDX_attestation_market_id";

-- DropIndex
DROP INDEX "IDX_attestation_question_id";

-- AlterTable
ALTER TABLE "attestation" DROP COLUMN "condition",
DROP COLUMN "marketAddress",
DROP COLUMN "marketId",
DROP COLUMN "questionId",
ADD COLUMN     "conditionId" VARCHAR;

-- AlterTable
ALTER TABLE "position" RENAME CONSTRAINT "parlay_pkey" TO "position_pkey";

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "condition"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
