-- Move rules from market to market_group
-- It's acceptable to drop existing market.rules data.

-- Add rules to market_group
ALTER TABLE "market_group" ADD COLUMN IF NOT EXISTS "rules" TEXT;

-- Drop rules from market
ALTER TABLE "market" DROP COLUMN IF EXISTS "rules";

