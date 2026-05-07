-- Adds wUSDe earmarked for the vault from resolved-but-not-yet-redeemed wins.
-- Default '0' keeps existing snapshots numerically equivalent to the prior
-- airdrop formula until a backfill repopulates them.

ALTER TABLE "protocol_stats_snapshot"
  ADD COLUMN "vaultUnredeemedClaim" VARCHAR NOT NULL DEFAULT '0';
