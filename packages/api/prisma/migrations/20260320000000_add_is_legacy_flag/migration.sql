-- AlterTable: Add isLegacy flag to Prediction
ALTER TABLE "Prediction" ADD COLUMN "isLegacy" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add isLegacy flag to Picks
ALTER TABLE "Picks" ADD COLUMN "isLegacy" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: Mark existing data from legacy contracts as isLegacy = true
-- Chain 5064014 (Ethereal mainnet) — current escrow is 0xEF6B5C544814a3c5E335b6D2BAec6CBDe0f97A76
UPDATE "Prediction" SET "isLegacy" = true
WHERE "chainId" = 5064014
  AND LOWER("marketAddress") != LOWER('0xEF6B5C544814a3c5E335b6D2BAec6CBDe0f97A76');

UPDATE "Picks" SET "isLegacy" = true
WHERE "chainId" = 5064014
  AND LOWER("marketAddress") != LOWER('0xEF6B5C544814a3c5E335b6D2BAec6CBDe0f97A76');

-- Chain 13374202 (Ethereal testnet) — current escrow is 0x3B680e06B9A384179644C1bC7842Db67Df5Fb5f0
UPDATE "Prediction" SET "isLegacy" = true
WHERE "chainId" = 13374202
  AND LOWER("marketAddress") != LOWER('0x3B680e06B9A384179644C1bC7842Db67Df5Fb5f0');

UPDATE "Picks" SET "isLegacy" = true
WHERE "chainId" = 13374202
  AND LOWER("marketAddress") != LOWER('0x3B680e06B9A384179644C1bC7842Db67Df5Fb5f0');
