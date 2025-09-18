-- Add optional short_name columns for market and condition
ALTER TABLE "market" ADD COLUMN IF NOT EXISTS "shortName" VARCHAR NULL;
ALTER TABLE "condition" ADD COLUMN IF NOT EXISTS "shortName" VARCHAR NULL;


