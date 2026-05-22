import { describe, expect, it } from 'vitest';
import type { VaultStat } from '~/hooks/graphql/useAnalytics';
import {
  buildVaultPnlChartData,
  calculateVaultPnlHeadlineApy,
  computeVaultPnlYDomain,
} from '../vaultPnlChartUtils';
import { presetRange } from '~/components/shared/timeRange';

const ONE_DAY = 24 * 60 * 60;
const ONE_WUSDE = 10n ** 18n;
const NOW_SEC = Date.UTC(2026, 3, 24, 0, 0, 0) / 1000;

function makeStat({
  timestamp,
  tvl,
  pnl,
}: {
  timestamp: number;
  tvl: number;
  pnl: number;
}): VaultStat {
  const tvlWei = BigInt(tvl) * ONE_WUSDE;

  return {
    timestamp,
    balance: tvlWei.toString(),
    cumulativePnL: (BigInt(pnl) * ONE_WUSDE).toString(),
  } as VaultStat;
}

describe('vaultPnlChartUtils', () => {
  it('trims leading zero-TVL 3M snapshots but preserves a zero baseline before the first active point', () => {
    const vaultStats = [
      ...Array.from({ length: 38 }, (_, index) =>
        makeStat({
          timestamp: NOW_SEC - (80 - index) * ONE_DAY,
          tvl: 0,
          pnl: 0,
        })
      ),
      makeStat({ timestamp: NOW_SEC - 42 * ONE_DAY, tvl: 100, pnl: 10 }),
      makeStat({ timestamp: NOW_SEC - 20 * ONE_DAY, tvl: 100, pnl: 20 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 30 }),
    ];

    const chartData = buildVaultPnlChartData(
      vaultStats,
      presetRange('3M'),
      NOW_SEC
    );

    expect(chartData).toHaveLength(4);
    expect(chartData.map((point) => point.timestamp)).toEqual([
      NOW_SEC - 43 * ONE_DAY,
      NOW_SEC - 42 * ONE_DAY,
      NOW_SEC - 20 * ONE_DAY,
      NOW_SEC - ONE_DAY,
    ]);
    expect(chartData.map((point) => point.pnlDelta)).toEqual([0, 0, 10, 20]);
    expect(chartData.map((point) => point.pct)).toEqual([0, 0, 10, 20]);
  });

  it('calculates headline APY from the first active 3M snapshot instead of the preserved zero-TVL baseline', () => {
    const vaultStats = [
      makeStat({ timestamp: NOW_SEC - 43 * ONE_DAY, tvl: 0, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - 42 * ONE_DAY, tvl: 100, pnl: 10 }),
      makeStat({ timestamp: NOW_SEC - 20 * ONE_DAY, tvl: 100, pnl: 20 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 30 }),
    ];

    const chartData = buildVaultPnlChartData(
      vaultStats,
      presetRange('3M'),
      NOW_SEC
    );

    const expectedApy = (Math.pow(1.2, 365 / 42) - 1) * 100;

    expect(calculateVaultPnlHeadlineApy(chartData, NOW_SEC)).toBeCloseTo(
      expectedApy,
      10
    );
  });

  it('clamps visible history to anchorSec when the period window extends before it', () => {
    const anchorSec = NOW_SEC - 7 * ONE_DAY;
    const vaultStats = [
      makeStat({ timestamp: NOW_SEC - 30 * ONE_DAY, tvl: 100, pnl: 1 }),
      makeStat({ timestamp: NOW_SEC - 14 * ONE_DAY, tvl: 100, pnl: 2 }),
      makeStat({ timestamp: NOW_SEC - 8 * ONE_DAY, tvl: 100, pnl: 3 }),
      makeStat({ timestamp: anchorSec, tvl: 100, pnl: 10 }),
      makeStat({ timestamp: NOW_SEC - 3 * ONE_DAY, tvl: 100, pnl: 20 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 30 }),
    ];

    const chartData = buildVaultPnlChartData(
      vaultStats,
      presetRange('ALL'),
      NOW_SEC,
      anchorSec
    );

    expect(chartData.map((point) => point.timestamp)).toEqual([
      anchorSec,
      NOW_SEC - 3 * ONE_DAY,
      NOW_SEC - ONE_DAY,
    ]);
    // pnlDelta rebases off the first post-anchor point (pnl=10).
    expect(chartData.map((point) => point.pnlDelta)).toEqual([0, 10, 20]);
    expect(chartData[0].isReturnAnchor).toBe(true);
  });

  it('computes APY from the post-anchor snapshot, not an earlier funded one', () => {
    const anchorSec = NOW_SEC - 7 * ONE_DAY;
    const vaultStats = [
      makeStat({ timestamp: NOW_SEC - 30 * ONE_DAY, tvl: 100, pnl: 1 }),
      makeStat({ timestamp: anchorSec, tvl: 100, pnl: 10 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 20 }),
    ];

    const chartData = buildVaultPnlChartData(
      vaultStats,
      presetRange('ALL'),
      NOW_SEC,
      anchorSec
    );
    const apy = calculateVaultPnlHeadlineApy(chartData, NOW_SEC);

    // periodReturn = (20 - 10) / 100 = 0.1 over 7 days
    const expectedApy = (Math.pow(1.1, 365 / 7) - 1) * 100;
    expect(apy).toBeCloseTo(expectedApy, 10);
  });

  it('returns an empty series when anchorSec is in the future', () => {
    const anchorSec = NOW_SEC + ONE_DAY;
    const vaultStats = [
      makeStat({ timestamp: NOW_SEC - 5 * ONE_DAY, tvl: 100, pnl: 1 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 2 }),
    ];

    const chartData = buildVaultPnlChartData(
      vaultStats,
      presetRange('ALL'),
      NOW_SEC,
      anchorSec
    );

    expect(chartData).toEqual([]);
  });

  describe('computeVaultPnlYDomain', () => {
    it('anchors the baseline at zero when all values are non-negative', () => {
      const [bottom, top] = computeVaultPnlYDomain([2.26, 5.1, 8.18], 'pct');
      expect(bottom).toBe(0);
      expect(top).toBeCloseTo(8.18 + (8.18 - 2.26) * 0.1, 10);
    });

    it('pads below the minimum when any value is negative', () => {
      const [bottom, top] = computeVaultPnlYDomain([-3, 0, 5], 'pct');
      const padding = (5 - -3) * 0.1;
      expect(bottom).toBeCloseTo(-3 - padding, 10);
      expect(top).toBeCloseTo(5 + padding, 10);
    });

    it('uses a fallback pad when all values collapse to a single point', () => {
      const [bottomPct, topPct] = computeVaultPnlYDomain([4, 4], 'pct');
      expect(bottomPct).toBe(0);
      expect(topPct).toBeCloseTo(4 + 0.01, 10);

      const [bottomAbs, topAbs] = computeVaultPnlYDomain([-2, -2], 'abs');
      expect(bottomAbs).toBeCloseTo(-2 - 0.1, 10);
      expect(topAbs).toBeCloseTo(-2 + 0.1, 10);
    });

    it('returns a neutral range for an empty series', () => {
      expect(computeVaultPnlYDomain([], 'pct')).toEqual([-1, 1]);
    });
  });

  it('preserves the zero-TVL leading-point trim when no anchorSec is supplied', () => {
    const vaultStats = [
      makeStat({ timestamp: NOW_SEC - 4 * ONE_DAY, tvl: 0, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - 3 * ONE_DAY, tvl: 0, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - 2 * ONE_DAY, tvl: 100, pnl: 5 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 10 }),
    ];

    const chartData = buildVaultPnlChartData(
      vaultStats,
      presetRange('1W'),
      NOW_SEC
    );

    expect(chartData.map((point) => point.timestamp)).toEqual([
      NOW_SEC - 3 * ONE_DAY,
      NOW_SEC - 2 * ONE_DAY,
      NOW_SEC - ONE_DAY,
    ]);
    expect(chartData.map((point) => point.pnlDelta)).toEqual([0, 0, 5]);
  });
});
