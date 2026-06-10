-- Reverse the previously-applied staging migration that renamed attestation.prediction
-- to attestation.forecast. Keep the old migration file in-tree so Prisma can
-- validate databases that already applied it, then move the live schema back to
-- the current Prisma model column name.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attestation'
      AND column_name = 'forecast'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attestation'
      AND column_name = 'prediction'
  ) THEN
    ALTER TABLE "attestation" RENAME COLUMN "forecast" TO "prediction";
  END IF;
END $$;
