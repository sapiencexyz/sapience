import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPnLBreakdown = vi.fn();
const mockVolumes = vi.fn();

vi.mock('../../../../services/accountStats', () => ({
  calculateAccountPnLBreakdown: mockPnLBreakdown,
  calculateAccountVolumes: mockVolumes,
}));

// No-op cache so each test sees its own mocked service data.
vi.mock('../../../../lib/ttlCache', () => ({
  TtlCache: class {
    get() {
      return undefined;
    }
    set() {}
  },
}));

const { accountStatsLeaderboardPage, accountStatsRank } = await import(
  './accountStats'
);
const { AccountStatMetric } = await import('../../__generated__/resolvers');

type Filters = {
  metric: (typeof AccountStatMetric)[keyof typeof AccountStatMetric];
  fromEpoch?: number | null;
  toEpoch?: number | null;
};
type Args = { filters: Filters; take: number; skip: number };

// Minimal `info` mock matching the field-selection probe the resolver uses to
// decide whether to populate `totalCount`. Each test names what it wants.
const infoSelecting = (...fields: string[]) => ({
  fieldNodes: [
    {
      selectionSet: {
        selections: fields.map((name) => ({
          kind: 'Field',
          name: { value: name },
        })),
      },
    },
  ],
});

const call = (args: Args, fields: string[] = ['items', 'hasMore']) =>
  (
    accountStatsLeaderboardPage as unknown as (
      p: unknown,
      a: Args,
      c: unknown,
      i: unknown
    ) => Promise<{
      items: Array<{
        address: string;
        netPnL: string;
        gains: string;
        losses: string;
        volume: string;
      }>;
      hasMore: boolean;
      totalCount: number | null;
    }>
  )({}, args, {}, infoSelecting(...fields));

const WEI = (n: number) => (BigInt(n) * 10n ** 18n).toString();

describe('Query.accountStatsLeaderboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPnLBreakdown.mockResolvedValue([
      { address: '0xAaa', netPnL: WEI(50), gains: WEI(120), losses: WEI(-70) },
      { address: '0xbbb', netPnL: WEI(-30), gains: WEI(10), losses: WEI(-40) },
      { address: '0xccc', netPnL: WEI(200), gains: WEI(200), losses: WEI(0) },
    ]);
    mockVolumes.mockResolvedValue([
      { address: '0xaaa', volume: WEI(500) },
      { address: '0xbbb', volume: WEI(9000) },
      { address: '0xddd', volume: WEI(10) },
    ]);
  });

  it('ranks by net PnL descending and lowercases addresses', async () => {
    const page = await call({
      filters: { metric: AccountStatMetric.NetPnl },
      take: 25,
      skip: 0,
    });
    expect(page.items.map((r) => r.address)).toEqual([
      '0xccc',
      '0xaaa',
      '0xddd', // only volume → netPnL 0
      '0xbbb',
    ]);
  });

  it('ranks by gains descending', async () => {
    const page = await call({
      filters: { metric: AccountStatMetric.Gains },
      take: 25,
      skip: 0,
    });
    expect(page.items.slice(0, 2).map((r) => r.address)).toEqual([
      '0xccc',
      '0xaaa',
    ]);
  });

  it('ranks by losses ascending (biggest loss first)', async () => {
    const page = await call({
      filters: { metric: AccountStatMetric.Losses },
      take: 25,
      skip: 0,
    });
    expect(page.items[0].address).toBe('0xaaa'); // -70
    expect(page.items[1].address).toBe('0xbbb'); // -40
  });

  it('ranks by volume descending', async () => {
    const page = await call({
      filters: { metric: AccountStatMetric.Volume },
      take: 25,
      skip: 0,
    });
    expect(page.items.slice(0, 2).map((r) => r.address)).toEqual([
      '0xbbb',
      '0xaaa',
    ]);
  });

  it('merges PnL and volume per address, defaulting the missing side to "0"', async () => {
    const page = await call({
      filters: { metric: AccountStatMetric.NetPnl },
      take: 25,
      skip: 0,
    });
    const ddd = page.items.find((r) => r.address === '0xddd');
    expect(ddd).toMatchObject({ netPnL: '0', gains: '0', losses: '0' });
    expect(ddd?.volume).toBe(WEI(10));
    const ccc = page.items.find((r) => r.address === '0xccc');
    expect(ccc?.volume).toBe('0');
  });

  it('passes the resolved epoch window through; omitting `fromEpoch` means all-time', async () => {
    await call({
      filters: { metric: AccountStatMetric.NetPnl },
      take: 25,
      skip: 0,
    });
    expect(mockPnLBreakdown).toHaveBeenCalledWith({
      fromEpoch: undefined,
      toEpoch: expect.any(Number),
    });
    expect(mockVolumes).toHaveBeenCalledWith({
      fromEpoch: undefined,
      toEpoch: expect.any(Number),
    });

    vi.clearAllMocks();
    mockPnLBreakdown.mockResolvedValue([]);
    mockVolumes.mockResolvedValue([]);
    const from = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000);
    const to = Math.floor(new Date('2026-02-01T00:00:00Z').getTime() / 1000);
    await call({
      filters: {
        metric: AccountStatMetric.NetPnl,
        fromEpoch: from,
        toEpoch: to,
      },
      take: 25,
      skip: 0,
    });
    expect(mockPnLBreakdown).toHaveBeenCalledWith({
      fromEpoch: from,
      toEpoch: to,
    });
  });

  it('caps take at 100 and applies skip', async () => {
    const page = await call({
      filters: { metric: AccountStatMetric.NetPnl },
      take: 1000,
      skip: 1,
    });
    // 4 distinct addresses, skip 1 ⇒ 3 returned, hasMore=false.
    expect(page.items).toHaveLength(3);
    expect(page.items[0].address).toBe('0xaaa');
    expect(page.hasMore).toBe(false);
  });

  it('flags hasMore=true when the window has more rows than requested', async () => {
    const page = await call({
      filters: { metric: AccountStatMetric.NetPnl },
      take: 2,
      skip: 0,
    });
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });

  it('omits totalCount unless the client selected the field', async () => {
    const without = await call(
      { filters: { metric: AccountStatMetric.NetPnl }, take: 2, skip: 0 },
      ['items', 'hasMore']
    );
    expect(without.totalCount).toBeNull();

    const withTotal = await call(
      { filters: { metric: AccountStatMetric.NetPnl }, take: 2, skip: 0 },
      ['items', 'hasMore', 'totalCount']
    );
    expect(withTotal.totalCount).toBe(4);
  });
});

type RankArgs = {
  address: string;
  filters: {
    metric: (typeof AccountStatMetric)[keyof typeof AccountStatMetric];
    fromEpoch?: number | null;
    toEpoch?: number | null;
  };
};
type RankResult = {
  address: string;
  netPnL: string;
  gains: string;
  losses: string;
  volume: string;
  rank: number | null;
  totalParticipants: number;
};
const callRank = (args: RankArgs): Promise<RankResult> =>
  (
    accountStatsRank as unknown as (
      p: unknown,
      a: RankArgs,
      c: unknown,
      i: unknown
    ) => Promise<RankResult>
  )({}, args, {}, {});

describe('Query.accountStatsRank', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Same fixture as the leaderboard suite — 4 distinct addresses, ranked by
    // NET_PNL: 0xccc(200), 0xaaa(50), 0xddd(0, volume-only), 0xbbb(-30).
    mockPnLBreakdown.mockResolvedValue([
      { address: '0xAaa', netPnL: WEI(50), gains: WEI(120), losses: WEI(-70) },
      { address: '0xbbb', netPnL: WEI(-30), gains: WEI(10), losses: WEI(-40) },
      { address: '0xccc', netPnL: WEI(200), gains: WEI(200), losses: WEI(0) },
    ]);
    mockVolumes.mockResolvedValue([
      { address: '0xaaa', volume: WEI(500) },
      { address: '0xbbb', volume: WEI(9000) },
      { address: '0xddd', volume: WEI(10) },
    ]);
  });

  it('returns 1-indexed rank + stats for a present address by NET_PNL', async () => {
    const r = await callRank({
      address: '0xAAA',
      filters: { metric: AccountStatMetric.NetPnl },
    });
    expect(r).toMatchObject({
      address: '0xaaa',
      netPnL: WEI(50),
      gains: WEI(120),
      losses: WEI(-70),
      volume: WEI(500),
      rank: 2,
      totalParticipants: 4,
    });
  });

  it('rank reflects metric — same address ranks differently by VOLUME vs NET_PNL', async () => {
    const byPnl = await callRank({
      address: '0xbbb',
      filters: { metric: AccountStatMetric.NetPnl },
    });
    const byVolume = await callRank({
      address: '0xbbb',
      filters: { metric: AccountStatMetric.Volume },
    });
    expect(byPnl.rank).toBe(4); // worst PnL
    expect(byVolume.rank).toBe(1); // highest volume
  });

  it('rank=null + zero stats when the address has no activity in the window', async () => {
    const r = await callRank({
      address: '0xunknown',
      filters: { metric: AccountStatMetric.NetPnl },
    });
    expect(r).toMatchObject({
      address: '0xunknown',
      netPnL: '0',
      gains: '0',
      losses: '0',
      volume: '0',
      rank: null,
      totalParticipants: 4,
    });
  });

  it('returns the all-zero stub when the window has no participants', async () => {
    mockPnLBreakdown.mockResolvedValue([]);
    mockVolumes.mockResolvedValue([]);
    const r = await callRank({
      address: '0xaaa',
      filters: { metric: AccountStatMetric.NetPnl },
    });
    expect(r).toEqual({
      address: '0xaaa',
      netPnL: '0',
      gains: '0',
      losses: '0',
      volume: '0',
      rank: null,
      totalParticipants: 0,
    });
  });

  it('passes the resolved epoch window through; omitting `fromEpoch` means all-time', async () => {
    await callRank({
      address: '0xaaa',
      filters: { metric: AccountStatMetric.NetPnl },
    });
    expect(mockPnLBreakdown).toHaveBeenCalledWith({
      fromEpoch: undefined,
      toEpoch: expect.any(Number),
    });

    vi.clearAllMocks();
    mockPnLBreakdown.mockResolvedValue([]);
    mockVolumes.mockResolvedValue([]);
    const from = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000);
    const to = Math.floor(new Date('2026-02-01T00:00:00Z').getTime() / 1000);
    await callRank({
      address: '0xaaa',
      filters: {
        metric: AccountStatMetric.NetPnl,
        fromEpoch: from,
        toEpoch: to,
      },
    });
    expect(mockPnLBreakdown).toHaveBeenCalledWith({
      fromEpoch: from,
      toEpoch: to,
    });
  });
});
