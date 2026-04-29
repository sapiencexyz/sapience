-- Add Claim.logIndex + (chainId, txHash, logIndex) unique constraint to make
-- the TokensRedeemed indexer write idempotent under reconciler replays and
-- background-worker / reconciler races.
--
-- Existing rows had only auto-increment id as a uniqueness signal, so any
-- replay produced a duplicate Claim row (claimed_usde was being doubled in
-- production). This migration:
--   1. adds the column nullable so dedupe can run before NOT NULL is enforced
--   2. drops duplicates from past replays (keeps the lowest id per natural key)
--   3. assigns negative-sentinel placeholders to the kept rows — real on-chain
--      logIndex values are always >= 0, so a future indexer write or backfill
--      cannot collide with any placeholder
--   4. enforces NOT NULL and adds the unique constraint immediately
--
-- The cleanup script at scripts/backfillClaimLogIndex.ts replaces the
-- placeholders with real logIndex values from chain (and fills any
-- crash-orphaned rows that were lost to the old dispatcher's Event-first
-- fast-path).

ALTER TABLE "Claim" ADD COLUMN "logIndex" INTEGER;

DELETE FROM "Claim" a
USING "Claim" b
WHERE a.id > b.id
  AND a."chainId"        = b."chainId"
  AND a."txHash"         = b."txHash"
  AND a.holder           = b.holder
  AND a."positionToken"  = b."positionToken"
  AND a."tokensBurned"   = b."tokensBurned"
  AND a."collateralPaid" = b."collateralPaid";

WITH ranked AS (
  SELECT id,
         -ROW_NUMBER() OVER (
           PARTITION BY "chainId", "txHash"
           ORDER BY id
         ) AS placeholder_log_index
  FROM "Claim"
  WHERE "logIndex" IS NULL
)
UPDATE "Claim" c
SET "logIndex" = ranked.placeholder_log_index
FROM ranked
WHERE c.id = ranked.id;

ALTER TABLE "Claim" ALTER COLUMN "logIndex" SET NOT NULL;
CREATE UNIQUE INDEX "UQ_claim_chain_tx_log"
  ON "Claim" ("chainId", "txHash", "logIndex");
