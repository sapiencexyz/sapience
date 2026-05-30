-- Rename the `prediction` column on `attestation` to `forecast`. The
-- on-chain EAS schema literally declares this field as `uint256 forecast`,
-- and the indexer, scoring service, and SDK all refer to it as "forecast"
-- — the `prediction` column name was a leftover ambiguity with the
-- escrow-prediction concept (CLAUDE.md reserves "prediction" for user
-- escrow positions). This rename aligns the column with the on-chain
-- schema name and the in-tree terminology.

ALTER TABLE "attestation" RENAME COLUMN "prediction" TO "forecast";
