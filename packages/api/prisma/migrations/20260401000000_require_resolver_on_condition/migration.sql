-- Backfill NULL resolvers per chain with the correct resolver address.
-- Testnet (13374202): ManualConditionResolver — stand-in for the LZ bridge.
-- Covers the 8 conditions created 2026-04-01 with resolver: null due to
-- missing RESOLVER_TYPE env var on staging market-keeper.
UPDATE "condition"
SET "resolver" = '0x7e81ca51de1eecc5ed4f7ecbaa3156400c6b3b9c'
WHERE "resolver" IS NULL AND "chainId" = 13374202;

-- Mainnet (5064014): ConditionalTokensConditionResolver — LZ bridge from Polygon.
-- Safety net in case any mainnet conditions have NULL resolver.
UPDATE "condition"
SET "resolver" = '0xc7a489f8b5cef914fca2511a84cdc0221cd9a0f4'
WHERE "resolver" IS NULL AND "chainId" = 5064014;

-- Make resolver NOT NULL — conditions must always have a resolver.
ALTER TABLE "condition" ALTER COLUMN "resolver" SET NOT NULL;
