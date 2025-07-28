-- Add questionId column to attestation table
ALTER TABLE "attestation" ADD COLUMN "questionId" VARCHAR NOT NULL DEFAULT '';

-- Create index for questionId
CREATE INDEX "IDX_attestation_question_id" ON "attestation"("questionId"); 