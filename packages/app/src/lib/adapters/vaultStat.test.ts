import { describe, expect, it } from 'vitest';
import type { VaultStat } from '@sapience/sdk/queries';
import { toVaultStatPoint } from './vaultStat';

const ONE_WUSDE = 10n ** 18n;

function makeStat(overrides: Partial<VaultStat> = {}): VaultStat {
  return {
    timestamp: 1700000000,
    balance: '0',
    deployedCollateral: '0',
    undeployedCollateral: '0',
    cumulativePnl: '0',
    claimableCollateral: '0',
    ...overrides,
  };
}

describe('toVaultStatPoint', () => {
  it('computes TVL = balance + deployedCollateral + claimableCollateral (scaled to wUSDe)', () => {
    const point = toVaultStatPoint(
      makeStat({
        balance: (100n * ONE_WUSDE).toString(),
        deployedCollateral: (40n * ONE_WUSDE).toString(),
        claimableCollateral: (10n * ONE_WUSDE).toString(),
      })
    );
    // 100 + 40 + 10 = 150
    expect(point.tvl).toBeCloseTo(150, 10);
  });

  it('computes PnL = cumulativePnl (scaled to wUSDe)', () => {
    const point = toVaultStatPoint(
      makeStat({ cumulativePnl: (25n * ONE_WUSDE).toString() })
    );
    expect(point.pnl).toBeCloseTo(25, 10);
  });

  it('carries the timestamp through unchanged', () => {
    expect(toVaultStatPoint(makeStat({ timestamp: 1234 })).timestamp).toBe(
      1234
    );
  });

  it('handles negative cumulative PnL', () => {
    const point = toVaultStatPoint(
      makeStat({ cumulativePnl: (-5n * ONE_WUSDE).toString() })
    );
    expect(point.pnl).toBeCloseTo(-5, 10);
  });

  it('treats missing/empty wei strings as zero', () => {
    const point = toVaultStatPoint(
      makeStat({ balance: '', deployedCollateral: '', claimableCollateral: '' })
    );
    expect(point.tvl).toBe(0);
    expect(point.pnl).toBe(0);
  });
});
