-- Track vault cash flows from secondary-market trades alongside settlement PnL.
--
-- Previously the residual airdrop bucket absorbed any unexplained wUSDe move
-- in/out of the vault, including secondary-market buys and sells. With these
-- columns the snapshot can attribute trade flow explicitly so that
-- `vaultAirdropGains` only carries truly independent inflows.

ALTER TABLE "protocol_stats_snapshot"
  ADD COLUMN "vaultSecondaryBought" VARCHAR NOT NULL DEFAULT '0',
  ADD COLUMN "vaultSecondarySold"   VARCHAR NOT NULL DEFAULT '0';
