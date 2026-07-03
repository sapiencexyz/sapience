import { describe, expect, it } from 'vitest';
import type { VaultStatPoint } from '~/lib/adapters/vaultStat';
import {
  buildVaultPnlChartData,
  calculateVaultPnlHeadlineApy,
  computeVaultPnlYDomain,
} from '../vaultPnlChartUtils';

const ONE_DAY = 24 * 60 * 60;
const NOW_SEC = Date.UTC(2026, 3, 24, 0, 0, 0) / 1000;

// The chart util now consumes the adapted `{ timestamp, pnl, tvl }` point
// (whole wUSDe) produced by `toVaultStatPoint`, not the raw ProtocolStat it previously consumed.
function makeStat({
  timestamp,
  tvl,
  pnl,
}: {
  timestamp: number;
  tvl: number;
  pnl: number;
}): VaultStatPoint {
  return { timestamp, tvl, pnl };
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
    // pct chains per-interval returns: 10% then 10% on the grown base → 21%.
    expect(chartData[0].pct).toBe(0);
    expect(chartData[1].pct).toBe(0);
    expect(chartData[2].pct).toBeCloseTo(10, 10);
    expect(chartData[3].pct).toBeCloseTo(21, 10);
  });

  it('measures each interval against its own starting TVL so later deposits do not inflate the return', () => {
    const protocolStats = [
      makeStat({ timestamp: NOW_SEC - 3 * ONE_DAY, tvl: 100, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - 2 * ONE_DAY, tvl: 100, pnl: 50 }),
      // Large deposit arrives; the next interval's PnL is measured against
      // the new capital base, not the tiny seed TVL.
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 10_000, pnl: 150 }),
    ];

    const chartData = buildVaultPnlChartData(protocolStats, 'ALL', NOW_SEC);

    // Each interval's return divides by the *previous snapshot's* TVL:
    // r1 = 50/100, r2 = (150-50)/100 → cumulative (1.5)(2.0) - 1 = 200%.
    expect(chartData[1].pct).toBeCloseTo(50, 10);
    expect(chartData[2].pct).toBeCloseTo(200, 10);
  });

  it('uses the grown capital base for intervals after a deposit snapshot', () => {
    const protocolStats = [
      makeStat({ timestamp: NOW_SEC - 3 * ONE_DAY, tvl: 100, pnl: 0 }),
      // Deposit lands: TVL jumps to 10k with no PnL change.
      makeStat({ timestamp: NOW_SEC - 2 * ONE_DAY, tvl: 10_000, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 10_100, pnl: 100 }),
    ];

    const chartData = buildVaultPnlChartData(protocolStats, 'ALL', NOW_SEC);

    // r1 = 0; r2 = 100 / 10,000 = 1% — NOT 100/100 = 100% as the old
    // fixed-denominator formula would report.
    expect(chartData[1].pct).toBeCloseTo(0, 10);
    expect(chartData[2].pct).toBeCloseTo(1, 10);
  });

  it('treats intervals starting from zero TVL as flat instead of dividing by zero', () => {
    const protocolStats = [
      makeStat({ timestamp: NOW_SEC - 4 * ONE_DAY, tvl: 100, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - 3 * ONE_DAY, tvl: 100, pnl: 10 }),
      // Full withdrawal mid-series.
      makeStat({ timestamp: NOW_SEC - 2 * ONE_DAY, tvl: 0, pnl: 10 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 15 }),
    ];

    const chartData = buildVaultPnlChartData(protocolStats, 'ALL', NOW_SEC);

    expect(chartData[1].pct).toBeCloseTo(10, 10);
    expect(chartData[2].pct).toBeCloseTo(10, 10);
    // Interval starting at tvl=0 contributes no return.
    expect(chartData[3].pct).toBeCloseTo(10, 10);
  });

  it('calculates headline APY from the chained return since the first active snapshot', () => {
    const protocolStats = [
      makeStat({ timestamp: NOW_SEC - 43 * ONE_DAY, tvl: 0, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - 42 * ONE_DAY, tvl: 100, pnl: 10 }),
      makeStat({ timestamp: NOW_SEC - 20 * ONE_DAY, tvl: 100, pnl: 20 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 100, pnl: 30 }),
    ];

    const chartData = buildVaultPnlChartData(protocolStats, '3M', NOW_SEC);

    // Chained return: (1.1)(1.1) - 1 = 21% over 42 days.
    const expectedApy = (Math.pow(1.21, 365 / 42) - 1) * 100;

    expect(calculateVaultPnlHeadlineApy(chartData, NOW_SEC)).toBeCloseTo(
      expectedApy,
      8
    );
  });

  it('caps the headline APY at 1,000,000%', () => {
    const protocolStats = [
      makeStat({ timestamp: NOW_SEC - 3 * ONE_DAY, tvl: 100, pnl: 0 }),
      makeStat({ timestamp: NOW_SEC - ONE_DAY, tvl: 200, pnl: 100 }),
    ];

    const chartData = buildVaultPnlChartData(protocolStats, 'ALL', NOW_SEC);

    // +100% over 3 days annualizes to an astronomical number; the cap wins.
    expect(calculateVaultPnlHeadlineApy(chartData, NOW_SEC)).toBe(1_000_000);
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
