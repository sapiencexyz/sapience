import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphQLError } from 'graphql';
import { TimeInterval } from './timeSeriesTypes';

// ─── Mock prisma ─────────────────────────────────────────────────────────────

vi.mock('../core/db', () => {
  return {
    default: {
      $queryRaw: vi.fn(),
    },
  };
});

import prisma from '../core/db';
import {
  resolveDefaults,
  queryAccountPredictionCount,
  queryAccountVolume,
  queryAccountPnl,
  queryProtocolVolume,
} from './timeSeriesQueries';

const mockQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

// ─── resolveDefaults ─────────────────────────────────────────────────────────

describe('resolveDefaults', () => {
  it('returns pgTrunc and pgStep for DAY interval', () => {
    const result = resolveDefaults(TimeInterval.DAY);
    expect(result.pgTrunc).toBe('day');
    expect(result.pgStep).toBe('1 day');
    expect(result.fromEpoch).toBeLessThan(result.toEpoch);
  });

  it('returns pgTrunc and pgStep for HOUR interval', () => {
    // HOUR max is 168 (7 days), so use a 3-day range
    const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const to = new Date();
    const result = resolveDefaults(TimeInterval.HOUR, from, to);
    expect(result.pgTrunc).toBe('hour');
    expect(result.pgStep).toBe('1 hour');
  });

  it('defaults to 90-day range when no from/to given', () => {
    const now = Math.floor(Date.now() / 1000);
    const result = resolveDefaults(TimeInterval.DAY);
    // toEpoch should be close to now
    expect(result.toEpoch).toBeGreaterThan(now - 5);
    expect(result.toEpoch).toBeLessThanOrEqual(now + 1);
    // fromEpoch should be ~90 days before now
    const ninetyDays = 90 * 24 * 60 * 60;
    expect(result.toEpoch - result.fromEpoch).toBeCloseTo(ninetyDays, -2);
  });

  it('respects explicit from and to dates', () => {
    const from = new Date('2024-01-01T00:00:00Z');
    const to = new Date('2024-01-31T00:00:00Z');
    const result = resolveDefaults(TimeInterval.DAY, from, to);
    expect(result.fromEpoch).toBe(Math.floor(from.getTime() / 1000));
    expect(result.toEpoch).toBe(Math.floor(to.getTime() / 1000));
  });

  it('throws when bucket count exceeds maximum for HOUR', () => {
    // HOUR max is 168 (7 days), request 30 days
    const from = new Date('2024-01-01T00:00:00Z');
    const to = new Date('2024-01-31T00:00:00Z');
    expect(() => resolveDefaults(TimeInterval.HOUR, from, to)).toThrow(
      GraphQLError
    );
    expect(() => resolveDefaults(TimeInterval.HOUR, from, to)).toThrow(
      /Too many buckets/
    );
  });

  it('throws when bucket count exceeds maximum for DAY', () => {
    // DAY max is 365, request 2 years
    const from = new Date('2022-01-01T00:00:00Z');
    const to = new Date('2024-01-01T00:00:00Z');
    expect(() => resolveDefaults(TimeInterval.DAY, from, to)).toThrow(
      /Too many buckets/
    );
  });

  it('allows ranges within limits', () => {
    // 30 days with DAY interval = 30 buckets, well under 365 max
    const from = new Date('2024-01-01T00:00:00Z');
    const to = new Date('2024-01-31T00:00:00Z');
    expect(() => resolveDefaults(TimeInterval.DAY, from, to)).not.toThrow();
  });
});

// ─── queryAccountPredictionCount ─────────────────────────────────────────────

describe('queryAccountVolume and queryProtocolVolume', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it('uses secondary trade price instead of collateral address for account volume', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await queryAccountVolume(
      '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      TimeInterval.DAY,
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-10T00:00:00Z')
    );

    const queryText = mockQueryRaw.mock.calls[0][0].join(' ');
    expect(queryText).toContain('CAST(price AS DECIMAL) AS vol');
    expect(queryText).not.toContain('CAST(collateral AS DECIMAL) AS vol');
  });

  it('uses secondary trade price instead of collateral address for protocol volume', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await queryProtocolVolume(
      TimeInterval.DAY,
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-10T00:00:00Z')
    );

    const queryText = mockQueryRaw.mock.calls[0][0].join(' ');
    expect(queryText).toContain('CAST(price AS DECIMAL) AS vol');
    expect(queryText).not.toContain('CAST(collateral AS DECIMAL) AS vol');
  });
});

describe('queryAccountPredictionCount', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it('lowercases the address', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await queryAccountPredictionCount(
      '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      TimeInterval.DAY
    );

    // The tagged template is called with the query parts; verify the address
    // was lowercased by inspecting the call args
    const callArgs = mockQueryRaw.mock.calls[0];
    // Prisma tagged template: callArgs[0] is the template strings array,
    // remaining args are interpolated values. The address appears as a
    // parameterized value.
    const allValues = callArgs.slice(1);
    const hasLowercasedAddr = allValues.some(
      (v: unknown) => v === '0xabcdef1234567890abcdef1234567890abcdef12'
    );
    expect(hasLowercasedAddr).toBe(true);
  });

  it('maps row bigints to numbers correctly', async () => {
    mockQueryRaw.mockResolvedValue([
      {
        timestamp: 1704067200n,
        total: 5n,
        won: 2n,
        lost: 1n,
        pending: 1n,
        non_decisive: 1n,
      },
      {
        timestamp: 1704153600n,
        total: 3n,
        won: 1n,
        lost: 1n,
        pending: 1n,
        non_decisive: 0n,
      },
    ]);

    const result = await queryAccountPredictionCount(
      '0xabc',
      TimeInterval.DAY,
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-10T00:00:00Z')
    );

    expect(result).toEqual([
      {
        timestamp: 1704067200,
        total: 5,
        won: 2,
        lost: 1,
        pending: 1,
        nonDecisive: 1,
      },
      {
        timestamp: 1704153600,
        total: 3,
        won: 1,
        lost: 1,
        pending: 1,
        nonDecisive: 0,
      },
    ]);
  });

  it('returns empty array when no rows', async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await queryAccountPredictionCount(
      '0xabc',
      TimeInterval.DAY,
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-10T00:00:00Z')
    );

    expect(result).toEqual([]);
  });

  it('outcome fields sum to total', async () => {
    mockQueryRaw.mockResolvedValue([
      {
        timestamp: 1704067200n,
        total: 10n,
        won: 4n,
        lost: 3n,
        pending: 2n,
        non_decisive: 1n,
      },
    ]);

    const result = await queryAccountPredictionCount(
      '0xabc',
      TimeInterval.DAY,
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-10T00:00:00Z')
    );

    const row = result[0];
    expect(row.won + row.lost + row.pending + row.nonDecisive).toBe(row.total);
  });
});

// ─── queryAccountPnl ─────────────────────────────────────────────────────────

describe('queryAccountPnl', () => {
  const from = new Date('2024-01-01T00:00:00Z');
  const to = new Date('2024-01-10T00:00:00Z');

  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it('lowercases the address', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await queryAccountPnl(
      '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      TimeInterval.DAY,
      from,
      to
    );

    const allValues = mockQueryRaw.mock.calls[0].slice(1);
    expect(
      allValues.some(
        (v: unknown) => v === '0xabcdef1234567890abcdef1234567890abcdef12'
      )
    ).toBe(true);
  });

  // Regression: the Claim.pickConfigId column (formerly mislabeled predictionId)
  // holds a pickConfigId, so joining it to Prediction.predictionId matched zero
  // rows and the Claims branch always contributed 0 PnL. Cost basis must resolve
  // through the pick configuration.
  it('attributes claim PnL via pickConfigId, not the empty predictionId join', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await queryAccountPnl('0xabc', TimeInterval.DAY, from, to);

    const queryText = mockQueryRaw.mock.calls[0][0].join(' ');
    expect(queryText).not.toMatch(/cl\."predictionId"\s*=\s*p\."predictionId"/);
    expect(queryText).toContain('pickConfigId');
    expect(queryText).toContain('"Picks"');
  });

  // Side (predictor vs counterparty) is identified by the redeemed positionToken
  // matching the pick configuration's predictor/counterparty token.
  it('determines claim side from the pick configuration tokens', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await queryAccountPnl('0xabc', TimeInterval.DAY, from, to);

    const queryText = mockQueryRaw.mock.calls[0][0].join(' ');
    expect(queryText).toContain('"predictorToken"');
    expect(queryText).toContain('"counterpartyToken"');
  });

  // A holder may redeem the same (pickConfig, side) across several unequal
  // claims. Cost basis must be allocated in proportion to the tokens each claim
  // redeemed (not split evenly), so partial redemptions land the right PnL in
  // the right bucket. The denominator totals tokens across all of the holder's
  // claims, guarded with NULLIF against divide-by-zero.
  it('allocates claim cost basis proportionally to tokens redeemed, not evenly', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await queryAccountPnl('0xabc', TimeInterval.DAY, from, to);

    const queryText = mockQueryRaw.mock.calls[0][0].join(' ');
    expect(queryText).toContain('total_burned');
    expect(queryText).toContain('tokensBurned');
    expect(queryText).toMatch(/NULLIF/i);
    // must not fall back to the naive even split
    expect(queryText).not.toContain('claim_count');
  });

  it('maps rows to the PnlDataPoint shape', async () => {
    mockQueryRaw.mockResolvedValue([
      { timestamp: 1704067200n, pnl: '100', cumulative_pnl: '100' },
      { timestamp: 1704153600n, pnl: '-50', cumulative_pnl: '50' },
    ]);

    const result = await queryAccountPnl('0xabc', TimeInterval.DAY, from, to);

    expect(result).toEqual([
      { timestamp: 1704067200, pnl: '100', cumulativePnl: '100' },
      { timestamp: 1704153600, pnl: '-50', cumulativePnl: '50' },
    ]);
  });
});
