-- AlterTable
ALTER TABLE "attestation" ADD COLUMN     "condition" TEXT,
ADD COLUMN     "resolver" VARCHAR,
ALTER COLUMN "marketAddress" DROP NOT NULL,
ALTER COLUMN "marketId" DROP NOT NULL,
ALTER COLUMN "questionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "attestation_score" ADD COLUMN     "resolver" VARCHAR,
ALTER COLUMN "marketAddress" DROP NOT NULL,
ALTER COLUMN "marketId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "IDX_attestation_resolver" ON "attestation"("resolver");
