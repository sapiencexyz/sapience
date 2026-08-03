import { describe, expect, it } from 'vitest';
import type { VaultStat } from '~/lib/sdk/queries';
import {
  buildVaultSharePriceChartData,
  computeSharePriceYDomain,
} from '../vaultSharePriceChartUtils';
import { ROBINHOOD_CHART_START_SEC } from '../vaultPnlChartUtils';

const ONE_DAY = 24 * 60 * 60;
const NOW_SEC = Date.UTC(2026, 6, 20, 0, 0, 0) / 1000;

// Only `timestamp` and `sharePrice` matter to the share-price util; the wei
// fields are along for the ride to satisfy the SDK type.
function makeStat(timestamp: number, sharePrice: string | null): VaultStat {
  return {
    timestamp,
    balance: '0',
    deployedCollateral: '0',
    undeployedCollateral: '0',
    cumulativePnl: '0',
    claimableCollateral: '0',
    sharePrice,
  };
}

describe('buildVaultSharePriceChartData', () => {
  it('returns an empty series for undefined or empty stats', () => {
    expect(buildVaultSharePriceChartData(undefined, 'ALL', NOW_SEC)).toEqual(
      []
    );
    expect(buildVaultSharePriceChartData([], 'ALL', NOW_SEC)).toEqual([]);
  });

  it('drops snapshots with no share price (the pre-feature era) and parses the rest', () => {
    const stats = [
      makeStat(NOW_SEC - 3 * ONE_DAY, null),
      makeStat(NOW_SEC - 2 * ONE_DAY, '1.0100'),
      makeStat(NOW_SEC - ONE_DAY, '1.0250'),
    ];

    expect(buildVaultSharePriceChartData(stats, 'ALL', NOW_SEC)).toEqual([
      { timestamp: NOW_SEC - 2 * ONE_DAY, price: 1.01 },
      { timestamp: NOW_SEC - ONE_DAY, price: 1.025 },
    ]);
  });

  it('drops non-finite and non-positive prices', () => {
    const stats = [
      makeStat(NOW_SEC - 4 * ONE_DAY, 'not-a-number'),
      makeStat(NOW_SEC - 3 * ONE_DAY, 'Infinity'),
      makeStat(NOW_SEC - 2 * ONE_DAY, '0'),
      makeStat(NOW_SEC - ONE_DAY, '1.5'),
    ];

    expect(buildVaultSharePriceChartData(stats, 'ALL', NOW_SEC)).toEqual([
      { timestamp: NOW_SEC - ONE_DAY, price: 1.5 },
    ]);
  });

  it('applies the period window', () => {
    const stats = [
      makeStat(NOW_SEC - 30 * ONE_DAY, '1.0'),
      makeStat(NOW_SEC - 8 * ONE_DAY, '1.1'),
      makeStat(NOW_SEC - 2 * ONE_DAY, '1.2'),
    ];

    const points = buildVaultSharePriceChartData(stats, '1W', NOW_SEC);
    expect(points.map((p) => p.timestamp)).toEqual([NOW_SEC - 2 * ONE_DAY]);
  });

  it('clamps visible history to the chain anchor even on ALL', () => {
    const stats = [
      makeStat(ROBINHOOD_CHART_START_SEC - ONE_DAY, '0.9'),
      makeStat(ROBINHOOD_CHART_START_SEC + ONE_DAY, '1.1'),
    ];

    const points = buildVaultSharePriceChartData(
      stats,
      'ALL',
      NOW_SEC,
      ROBINHOOD_CHART_START_SEC
    );
    expect(points.map((p) => p.timestamp)).toEqual([
      ROBINHOOD_CHART_START_SEC + ONE_DAY,
    ]);
  });

  it('appends a live point stamped at now when a live price is provided', () => {
    const stats = [makeStat(NOW_SEC - ONE_DAY, '1.02')];

    const points = buildVaultSharePriceChartData(
      stats,
      'ALL',
      NOW_SEC,
      undefined,
      1.031
    );
    expect(points).toEqual([
      { timestamp: NOW_SEC - ONE_DAY, price: 1.02 },
      { timestamp: NOW_SEC, price: 1.031 },
    ]);
  });

  it('renders a lone live point when no snapshot has a share price yet (day one)', () => {
    const stats = [makeStat(NOW_SEC - ONE_DAY, null)];

    const points = buildVaultSharePriceChartData(
      stats,
      'ALL',
      NOW_SEC,
      undefined,
      1.005
    );
    expect(points).toEqual([{ timestamp: NOW_SEC, price: 1.005 }]);
  });

  it('ignores a non-positive or non-finite live price', () => {
    const stats = [makeStat(NOW_SEC - ONE_DAY, '1.02')];

    expect(
      buildVaultSharePriceChartData(stats, 'ALL', NOW_SEC, undefined, 0)
    ).toHaveLength(1);
    expect(
      buildVaultSharePriceChartData(stats, 'ALL', NOW_SEC, undefined, NaN)
    ).toHaveLength(1);
  });
});

describe('computeSharePriceYDomain', () => {
  it('pads the min/max without anchoring at zero', () => {
    const [bottom, top] = computeSharePriceYDomain([1.0, 1.1]);
    // 10% of the 0.1 range on each side.
    expect(bottom).toBeCloseTo(0.99, 10);
    expect(top).toBeCloseTo(1.11, 10);
    expect(bottom).toBeGreaterThan(0);
  });

  it('does not collapse for a flat series', () => {
    const [bottom, top] = computeSharePriceYDomain([1.0, 1.0, 1.0]);
    expect(top).toBeGreaterThan(1.0);
    expect(bottom).toBeLessThan(1.0);
  });

  it('returns a sane default for an empty series', () => {
    expect(computeSharePriceYDomain([])).toEqual([0, 1]);
  });
});
