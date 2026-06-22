-- Drop the chain-wide wUSDe collateral-transfer index.
--
-- This table indexed every wUSDe ERC-20 Transfer on the chain. Its only
-- consumers were the vault airdrop reconciliation (now derived as an on-chain
-- balance residual) and the v2 `collateralTransfer(s)` / `collateralBalance(s)`
-- queries (removed from the schema; the frontend reads wallet balances on-chain
-- via wagmi). On a chain where wUSDe has broad non-protocol use this table grows
-- without bound, so we drop it entirely. Dropping the table also drops its
-- indexes.
DROP TABLE IF EXISTS "collateral_transfer";
