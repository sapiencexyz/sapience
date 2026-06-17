/**
 * Unit tests for `getAccountStatsHistory` — the merge layer that lines the
 * four endpoint-agnostic time-series helpers up into one snapshot per bucket
 * and truncates DECIMAL text onto integer wei.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryAccountBalance: vi.fn(),
  queryAccountPnl: vi.fn(),
  queryAccountVolume: vi.fn(),
  queryAccountPredictionCount: vi.fn(),
}));

vi.mock('../../../../services/timeSeriesQueries', () => mocks);

import {
  decimalTextToWei,
  getAccountStatsHistory,
  toServiceInterval,
} from './accountStatsHistory';
import { TimeInterval } from '../../../../services/timeSeriesTypes';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryAccountBalance.mockResolvedValue([]);
  mocks.queryAccountPnl.mockResolvedValue([]);
  mocks.queryAccountVolume.mockResolvedValue([]);
  mocks.queryAccountPredictionCount.mockResolvedValue([]);
});

describe('decimalTextToWei', () => {
  it('passes integer strings through', () => {
    expect(decimalTextToWei('1000000000000000000')).toBe(
      1_000_000_000_000_000_000n
    );
  });

  it('truncates fractional DECIMAL text toward zero', () => {
    expect(decimalTextToWei('123.999')).toBe(123n);
    expect(decimalTextToWei('-1.9')).toBe(-1n);
  });

  it('collapses empty / malformed payloads to 0n', () => {
    expect(decimalTextToWei(null)).toBe(0n);
    expect(decimalTextToWei('')).toBe(0n);
    expect(decimalTextToWei('-')).toBe(0n);
    expect(decimalTextToWei('not-a-number')).toBe(0n);
  });
});

describe('toServiceInterval', () => {
  it('maps the SDL enum values to the service enum', () => {
    expect(toServiceInterval('HOUR')).toBe(TimeInterval.HOUR);
    expect(toServiceInterval('MONTH')).toBe(TimeInterval.MONTH);
  });

  it('falls back to DAY on anything unrecognized', () => {
    expect(toServiceInterval('???')).toBe(TimeInterval.DAY);
  });
});

describe('getAccountStatsHistory', () => {
  it('merges the four series by bucket timestamp into one snapshot per bucket', async () => {
    mocks.queryAccountBalance.mockResolvedValue([
      { timestamp: 100, deployedCollateral: '50', claimableCollateral: '7' },
      { timestamp: 200, deployedCollateral: '0', claimableCollateral: '0' },
    ]);
    mocks.queryAccountPnl.mockResolvedValue([
      { timestamp: 100, pnl: '10.5', cumulativePnl: '10.5' },
      { timestamp: 200, pnl: '-3', cumulativePnl: '7.5' },
    ]);
    mocks.queryAccountVolume.mockResolvedValue([
      { timestamp: 100, volume: '1000' },
      { timestamp: 200, volume: '2000' },
    ]);
    mocks.queryAccountPredictionCount.mockResolvedValue([
      { timestamp: 100, total: 2, won: 1, lost: 0, pending: 1, nonDecisive: 0 },
      { timestamp: 200, total: 1, won: 0, lost: 1, pending: 0, nonDecisive: 0 },
    ]);

    const rows = await getAccountStatsHistory({
      address: '0xABC',
      interval: 'DAY',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      timestamp: 100,
      deployedCollateral: 50n,
      claimableCollateral: 7n,
      volume: 1000n,
      realizedPnl: 10n, // 10.5 truncated
      cumulativePnl: 10n,
      predictionsTotal: 2,
      predictionsWon: 1,
      predictionsLost: 0,
      predictionsPending: 1,
      predictionsNonDecisive: 0,
    });
    expect(rows[1].realizedPnl).toBe(-3n);
    expect(rows[1].cumulativePnl).toBe(7n);
    expect(rows[1].predictionsLost).toBe(1);
  });

  it('returns rows sorted ascending by timestamp even if a leg is out of order', async () => {
    mocks.queryAccountVolume.mockResolvedValue([
      { timestamp: 300, volume: '3' },
      { timestamp: 100, volume: '1' },
      { timestamp: 200, volume: '2' },
    ]);

    const rows = await getAccountStatsHistory({
      address: '0xabc',
      interval: 'DAY',
    });

    expect(rows.map((r) => r.timestamp)).toEqual([100, 200, 300]);
  });

  it('passes the mapped service interval and window through to every helper', async () => {
    const from = new Date('2024-01-01T00:00:00Z');
    const to = new Date('2024-02-01T00:00:00Z');

    await getAccountStatsHistory({
      address: '0xabc',
      interval: 'WEEK',
      from,
      to,
    });

    for (const fn of [
      mocks.queryAccountBalance,
      mocks.queryAccountPnl,
      mocks.queryAccountVolume,
      mocks.queryAccountPredictionCount,
    ]) {
      expect(fn).toHaveBeenCalledWith('0xabc', TimeInterval.WEEK, from, to);
    }
  });
});
