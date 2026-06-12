import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRanked = vi.hoisted(() => vi.fn());

vi.mock('./queries/accountStats', () => ({
  rankedAccountsForMetric: mockRanked,
}));

import { leaderboard, accountRank } from './queries/leaderboard';
import { Ranking } from './Ranking';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

describe('leaderboard (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a ranked page with 1-indexed ranks and typed PNL values', async () => {
    mockRanked.mockResolvedValueOnce([
      { address: '0xa', value: '300' },
      { address: '0xb', value: '200' },
      { address: '0xc', value: '100' },
    ]);
    const result = await callResolver<{
      nodes: { rank: number; pnl: bigint; accuracy: number | null }[];
      totalCount: number;
    }>(leaderboard)(null, { metric: 'PNL', first: 10 }, {}, null);
    expect(result.totalCount).toBe(3);
    expect(result.nodes.map((n) => n.rank)).toEqual([1, 2, 3]);
    expect(result.nodes.map((n) => n.pnl)).toEqual([300n, 200n, 100n]);
    // Only the queried metric's field is populated.
    expect(result.nodes.every((n) => n.accuracy === null)).toBe(true);
  });

  it('places the value in the metric-typed field (ACCURACY → accuracy float)', async () => {
    mockRanked.mockResolvedValueOnce([{ address: '0xa', value: '0.92' }]);
    const result = await callResolver<{
      nodes: { accuracy: number | null; pnl: bigint | null }[];
    }>(leaderboard)(null, { metric: 'ACCURACY', first: 10 }, {}, null);
    expect(result.nodes[0].accuracy).toBe(0.92);
    expect(result.nodes[0].pnl).toBeNull();
  });
});

describe('Account.rank (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the rank and metric-typed value when present', async () => {
    mockRanked.mockResolvedValueOnce([
      { address: '0xa', value: '300' },
      { address: '0xb', value: '200' },
    ]);
    const result = await callResolver<{ rank: number; pnl: bigint } | null>(
      accountRank
    )({ address: '0xB' }, { metric: 'PNL' }, {}, null);
    expect(result?.rank).toBe(2);
    expect(result?.pnl).toBe(200n);
  });

  it('returns null when the address is unranked', async () => {
    mockRanked.mockResolvedValueOnce([{ address: '0xa', value: '300' }]);
    const result = await callResolver<unknown>(accountRank)(
      { address: '0xZ' },
      { metric: 'PNL' },
      {},
      null
    );
    expect(result).toBeNull();
  });
});

describe('Ranking.pnlFormatted (v2)', () => {
  const resolve = (parent: { pnl: bigint | null }) =>
    callResolver<string>(Ranking.pnlFormatted)(parent, {}, {}, null);

  it('scales the wUSDe-wei pnl down by 18 decimals into a v1-shaped string', () => {
    // 123.456 wUSDe = 123456000000000000000 wei.
    expect(resolve({ pnl: 123456000000000000000n })).toBe('123.456');
  });

  it('preserves the sign for losses', () => {
    expect(resolve({ pnl: -5_000000000000000000n })).toBe('-5');
  });

  it('returns "0" when pnl is null (non-PNL ranking row)', () => {
    expect(resolve({ pnl: null })).toBe('0');
  });
});
