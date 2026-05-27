import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRanked = vi.hoisted(() => vi.fn());

vi.mock('./queries/accountStats', () => ({
  rankedAccountsForMetric: mockRanked,
}));

import { leaderboard, accountRank } from './queries/leaderboard';

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

  it('returns a ranked page with 1-indexed ranks', async () => {
    mockRanked.mockResolvedValueOnce([
      { address: '0xa', value: '300' },
      { address: '0xb', value: '200' },
      { address: '0xc', value: '100' },
    ]);
    const result = await callResolver<{
      nodes: { rank: number; value: string }[];
      totalCount: number;
    }>(leaderboard)(null, { metric: 'PNL', first: 10 }, {}, null);
    expect(result.totalCount).toBe(3);
    expect(result.nodes.map((n) => n.rank)).toEqual([1, 2, 3]);
    expect(result.nodes.map((n) => n.value)).toEqual(['300', '200', '100']);
  });
});

describe('Account.rank (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the rank and value when present', async () => {
    mockRanked.mockResolvedValueOnce([
      { address: '0xa', value: '300' },
      { address: '0xb', value: '200' },
    ]);
    const result = await callResolver<{ rank: number; value: string } | null>(
      accountRank
    )({ address: '0xB' }, { metric: 'PNL' }, {}, null);
    expect(result?.rank).toBe(2);
    expect(result?.value).toBe('200');
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
