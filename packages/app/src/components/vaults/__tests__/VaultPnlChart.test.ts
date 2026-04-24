import { describe, expect, it } from 'vitest';
import type { ProtocolStat } from '~/hooks/graphql/useAnalytics';
import {
  buildVaultPnlChartData,
  calculateVaultPnlHeadlineApy,
} from '../vaultPnlChartUtils';

const ONE_DAY = 24 * 60 * 60;
const ONE_ETH = 10n ** 18n;
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
  const tvlWei = BigInt(tvl) * ONE_ETH;

  return {
    timestamp,
    vaultBalance: tvlWei.toString(),
    escrowBalance: '0',
    vaultCumulativePnL: (BigInt(pnl) * ONE_ETH).toString(),
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
});
