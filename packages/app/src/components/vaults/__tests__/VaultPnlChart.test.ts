import { describe, expect, it } from 'vitest';
import type { ProtocolStat } from '~/hooks/graphql/useAnalytics';
import {
  buildVaultPnlChartData,
  calculateVaultPnlHeadlineApy,
} from '../vaultPnlChartUtils';

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
}): ProtocolStat {
  const tvlWei = BigInt(tvl) * ONE_WUSDE;

  return {
    timestamp,
    vaultBalance: tvlWei.toString(),
    escrowBalance: '0',
    vaultCumulativePnL: (BigInt(pnl) * ONE_WUSDE).toString(),
  } as ProtocolStat;
}

describe('vaultPnlChartUtils', () => {
  it('trims leading zero-TVL 3M snapshots but preserves a zero baseline before the first active point', () => {
    const protocolStats = [
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

    const chartData = buildVaultPnlChartData(protocolStats, '3M', NOW_SEC);

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
    const protocolStats = [
      makeStat({ timestamp: NOW_SEC - 43 * ONE_DAY, tvl: 0, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - 42 * ONE_DAY, tvl: 100, pnl: 10 }),
      makeStat({ timestamp: NOW_SEC - 20 * ONE_DAY, tvl: 100, pnl: 20 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 30 }),
    ];

    const chartData = buildVaultPnlChartData(protocolStats, '3M', NOW_SEC);

    const expectedApy = (Math.pow(1.2, 365 / 42) - 1) * 100;

    expect(calculateVaultPnlHeadlineApy(chartData, NOW_SEC)).toBeCloseTo(
      expectedApy,
      10
    );
  });

  it('clamps visible history to anchorSec when the period window extends before it', () => {
    const anchorSec = NOW_SEC - 7 * ONE_DAY;
    const protocolStats = [
      makeStat({ timestamp: NOW_SEC - 30 * ONE_DAY, tvl: 100, pnl: 1 }),
      makeStat({ timestamp: NOW_SEC - 14 * ONE_DAY, tvl: 100, pnl: 2 }),
      makeStat({ timestamp: NOW_SEC - 8 * ONE_DAY, tvl: 100, pnl: 3 }),
      makeStat({ timestamp: anchorSec, tvl: 100, pnl: 10 }),
      makeStat({ timestamp: NOW_SEC - 3 * ONE_DAY, tvl: 100, pnl: 20 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 30 }),
    ];

    const chartData = buildVaultPnlChartData(
      protocolStats,
      'ALL',
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
    const protocolStats = [
      makeStat({ timestamp: NOW_SEC - 30 * ONE_DAY, tvl: 100, pnl: 1 }),
      makeStat({ timestamp: anchorSec, tvl: 100, pnl: 10 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 20 }),
    ];

    const chartData = buildVaultPnlChartData(
      protocolStats,
      'ALL',
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
    const protocolStats = [
      makeStat({ timestamp: NOW_SEC - 5 * ONE_DAY, tvl: 100, pnl: 1 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 2 }),
    ];

    const chartData = buildVaultPnlChartData(
      protocolStats,
      'ALL',
      NOW_SEC,
      anchorSec
    );

    expect(chartData).toEqual([]);
  });

  it('preserves the zero-TVL leading-point trim when no anchorSec is supplied', () => {
    const protocolStats = [
      makeStat({ timestamp: NOW_SEC - 4 * ONE_DAY, tvl: 0, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - 3 * ONE_DAY, tvl: 0, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - 2 * ONE_DAY, tvl: 100, pnl: 5 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 10 }),
    ];

    const chartData = buildVaultPnlChartData(protocolStats, '1W', NOW_SEC);

    expect(chartData.map((point) => point.timestamp)).toEqual([
      NOW_SEC - 3 * ONE_DAY,
      NOW_SEC - 2 * ONE_DAY,
      NOW_SEC - ONE_DAY,
    ]);
    expect(chartData.map((point) => point.pnlDelta)).toEqual([0, 0, 5]);
  });
});
