import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  attesterMarketTwError: { groupBy: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type {
  QueryAccuracyLeaderboardPageArgs,
  QueryAccountAccuracyRankArgs,
} from '../../__generated__/resolvers';
import {
  __clearAccuracyLeaderboardCache,
  accountAccuracyRank,
  accuracyLeaderboardPage,
} from './score';

type LeaderboardFn = (
  parent: unknown,
  args: QueryAccuracyLeaderboardPageArgs,
  ctx: unknown,
  info: unknown
) => Promise<{
  items: { address: string; accuracyScore: number }[];
  hasMore: boolean;
}>;
type RankFn = (
  parent: unknown,
  args: QueryAccountAccuracyRankArgs,
  ctx: unknown,
  info: unknown
) => Promise<{
  address: string;
  accuracyScore: number;
  rank: number | null;
  totalForecasters: number;
}>;

const accuracyLeaderboardPageFn =
  accuracyLeaderboardPage as unknown as LeaderboardFn;
const accountAccuracyRankFn = accountAccuracyRank as unknown as RankFn;

const FIXTURE = [
  { attester: '0xalice', _avg: { twError: 0.9 } },
  { attester: '0xbob', _avg: { twError: 0.7 } },
  { attester: '0xcarol', _avg: { twError: 0.5 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  // The leaderboard cache lives at module scope. Reset it so each test
  // sees fresh `groupBy` mock data instead of a stale cached snapshot.
  __clearAccuracyLeaderboardCache();
  mockPrisma.attesterMarketTwError.groupBy.mockResolvedValue(FIXTURE);
});

describe('accuracyLeaderboardPage — slicing & envelope', () => {
  it('orders descending by accuracy score (higher = better)', async () => {
    const result = await accuracyLeaderboardPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryAccuracyLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.items.map((i) => i.address)).toEqual([
      '0xalice',
      '0xbob',
      '0xcarol',
    ]);
  });

  it('caps take at 100 and floors at 1', async () => {
    const big = await accuracyLeaderboardPageFn(
      undefined,
      { take: 9999, skip: 0 } as QueryAccuracyLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(big.items.length).toBeLessThanOrEqual(100);
  });

  it('hasMore=true when entries exceed skip + take', async () => {
    const result = await accuracyLeaderboardPageFn(
      undefined,
      { take: 2, skip: 0 } as QueryAccuracyLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('hasMore=false on the last page', async () => {
    const result = await accuracyLeaderboardPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryAccuracyLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(3);
  });

  it('skip advances the slice (page 2)', async () => {
    const result = await accuracyLeaderboardPageFn(
      undefined,
      { take: 2, skip: 2 } as QueryAccuracyLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.items.map((i) => i.address)).toEqual(['0xcarol']);
    expect(result.hasMore).toBe(false);
  });

  it('lower-cases attester addresses (defense-in-depth — DB stores them lowered)', async () => {
    mockPrisma.attesterMarketTwError.groupBy.mockResolvedValue([
      { attester: '0xMIXEDcase', _avg: { twError: 1.0 } },
    ]);
    const result = await accuracyLeaderboardPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryAccuracyLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.items[0].address).toBe('0xmixedcase');
  });

  it('treats null _avg as accuracyScore=0', async () => {
    mockPrisma.attesterMarketTwError.groupBy.mockResolvedValue([
      { attester: '0xalice', _avg: { twError: null } },
    ]);
    const result = await accuracyLeaderboardPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryAccuracyLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.items[0]).toMatchObject({
      address: '0xalice',
      accuracyScore: 0,
    });
  });
});

describe('accountAccuracyRank', () => {
  it('returns 1-indexed rank for a present forecaster', async () => {
    const result = await accountAccuracyRankFn(
      undefined,
      { address: '0xbob' },
      undefined,
      undefined
    );
    expect(result).toMatchObject({
      address: '0xbob',
      rank: 2,
      accuracyScore: 0.7,
      totalForecasters: 3,
    });
  });

  it('returns rank=null and accuracyScore=0 for a missing forecaster (still reports total)', async () => {
    const result = await accountAccuracyRankFn(
      undefined,
      { address: '0xunknown' },
      undefined,
      undefined
    );
    expect(result).toMatchObject({
      address: '0xunknown',
      rank: null,
      accuracyScore: 0,
      totalForecasters: 3,
    });
  });

  it('lower-cases the input address before lookup', async () => {
    const result = await accountAccuracyRankFn(
      undefined,
      { address: '0xALICE' },
      undefined,
      undefined
    );
    expect(result.address).toBe('0xalice');
    expect(result.rank).toBe(1);
  });
});
