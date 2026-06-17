/**
 * Shared adapter: v2 `VaultStat` node → the chart point shape the vault PnL
 * chart util consumes (`{ timestamp, pnl, tvl }`, both in whole wUSDe). This
 * is the one place the migrated TVL/PnL semantics live:
 *
 * - `tvl` := `balance + deployedCollateral + claimableCollateral` (whole wUSDe).
 *   v1 used `vaultBalance + chain-wide escrowBalance`, which over-counted by
 *   mixing the vault's balance with the protocol-wide escrow; the v2 line is
 *   the vault's own AUM plus its settled-but-unredeemed winnings.
 * - `pnl` := `cumulativePnl` (whole wUSDe).
 *
 * Wei → whole-token conversion divides by 1e18 (same as the v1 chart did).
 */
import type { VaultStat } from '@sapience/sdk/queries';

export type VaultStatPoint = {
  timestamp: number;
  pnl: number;
  tvl: number;
};

const WEI_PER_WUSDE = 1e18;

const toWhole = (wei: string | null | undefined): number =>
  wei ? Number(BigInt(wei)) / WEI_PER_WUSDE : 0;

/** Pure mapper: v2 `VaultStat` → chart point in whole wUSDe. */
export function toVaultStatPoint(stat: VaultStat): VaultStatPoint {
  const tvlWei =
    BigInt(stat.balance || '0') +
    BigInt(stat.deployedCollateral || '0') +
    BigInt(stat.claimableCollateral || '0');
  return {
    timestamp: stat.timestamp,
    pnl: toWhole(stat.cumulativePnl),
    tvl: Number(tvlWei) / WEI_PER_WUSDE,
  };
}
