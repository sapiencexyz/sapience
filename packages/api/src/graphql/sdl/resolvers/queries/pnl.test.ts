import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  calculateCombinedPositionPnL: vi.fn(),
}));

vi.mock('../../../../services/positionPnL', () => mocks);

import type { QueryProfitLeaderboardPageArgs } from '../../__generated__/resolvers';
import { __clearProfitLeaderboardCache, profitLeaderboardPage } from './pnl';

type Fn = (
  parent: unknown,
  args: QueryProfitLeaderboardPageArgs,
  ctx: unknown,
  info: unknown
) => Promise<{
  items: { address: string; totalPnL: string }[];
  hasMore: boolean;
}>;
const profitLeaderboardPageFn = profitLeaderboardPage as unknown as Fn;

const wei = (n: number) => (BigInt(Math.round(n)) * 10n ** 18n).toString();

beforeEach(() => {
  vi.clearAllMocks();
  __clearProfitLeaderboardCache();
  // PnL inputs are wei-scale; resolver scales down by 1e18 before sorting.
  mocks.calculateCombinedPositionPnL.mockResolvedValue([
    { owner: '0xalice', totalPnL: wei(50) },
    { owner: '0xbob', totalPnL: wei(20) },
    { owner: '0xcarol', totalPnL: wei(10) },
  ]);
});

describe('profitLeaderboardPage — slicing & envelope', () => {
  it('orders descending by totalPnL', async () => {
    const result = await profitLeaderboardPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryProfitLeaderboardPageArgs,
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
    const result = await profitLeaderboardPageFn(
      undefined,
      { take: 9999, skip: 0 } as QueryProfitLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.items.length).toBeLessThanOrEqual(100);
  });

  it('hasMore=true when entries exceed skip + take', async () => {
    const result = await profitLeaderboardPageFn(
      undefined,
      { take: 2, skip: 0 } as QueryProfitLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('hasMore=false on the last page', async () => {
    const result = await profitLeaderboardPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryProfitLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(false);
  });

  it('skip advances the slice', async () => {
    const result = await profitLeaderboardPageFn(
      undefined,
      { take: 1, skip: 1 } as QueryProfitLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.items.map((i) => i.address)).toEqual(['0xbob']);
    expect(result.hasMore).toBe(true);
  });

  it('aggregates rows for the same owner across legacy + new tables (lower-cased key)', async () => {
    mocks.calculateCombinedPositionPnL.mockResolvedValue([
      { owner: '0xALICE', totalPnL: wei(30) },
      { owner: '0xalice', totalPnL: wei(20) },
      { owner: '0xbob', totalPnL: wei(40) },
    ]);
    const result = await profitLeaderboardPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryProfitLeaderboardPageArgs,
      undefined,
      undefined
    );
    // 0xalice should aggregate to 50 and beat 0xbob's 40, with the address
    // lowered.
    expect(result.items.map((i) => i.address)).toEqual(['0xalice', '0xbob']);
    expect(result.items[0].totalPnL).toBe('50.000000000000000000');
  });

  it('skips rows whose totalPnL parses to non-finite (defense against bad indexer data)', async () => {
    mocks.calculateCombinedPositionPnL.mockResolvedValue([
      { owner: '0xalice', totalPnL: wei(10) },
      { owner: '0xbad', totalPnL: 'NotANumber' },
    ]);
    const result = await profitLeaderboardPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryProfitLeaderboardPageArgs,
      undefined,
      undefined
    );
    expect(result.items.map((i) => i.address)).toEqual(['0xalice']);
  });
});
