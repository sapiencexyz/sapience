import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPnLBreakdown = vi.fn();
const mockVolumes = vi.fn();

vi.mock('../../../../services/accountStats', () => ({
  calculateAccountPnLBreakdown: mockPnLBreakdown,
  calculateAccountVolumes: mockVolumes,
}));

const mockQueryAccountVolume = vi.fn();
const mockQueryAccountPnl = vi.fn();
const mockQueryAccountBalance = vi.fn();
const mockQueryAccountPredictionCount = vi.fn();

vi.mock('../../../../services/timeSeriesQueries', () => ({
  queryAccountVolume: mockQueryAccountVolume,
  queryAccountPnl: mockQueryAccountPnl,
  queryAccountBalance: mockQueryAccountBalance,
  queryAccountPredictionCount: mockQueryAccountPredictionCount,
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

const { accountStats, accountStatsLeaderboardPage, accountStatsRank } =
  await import('./accountStats');
const { AccountStatsMetric } = await import('../../__generated__/resolvers');

type Filters = {
  metric?: (typeof AccountStatsMetric)[keyof typeof AccountStatsMetric];
  fromEpoch?: number | null;
  toEpoch?: number | null;
};
type Args = { filters?: Filters | null; take: number; skip: number };

const call = (args: Args) =>
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
  )({}, args, {}, {});

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
      filters: { metric: AccountStatsMetric.NetPnl },
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

  it('defaults to NET_PNL when `filters` is omitted entirely', async () => {
    const page = await call({ take: 25, skip: 0 });
    expect(page.items.map((r) => r.address)).toEqual([
      '0xccc',
      '0xaaa',
      '0xddd',
      '0xbbb',
    ]);
  });

  it('ranks by gains descending', async () => {
    const page = await call({
      filters: { metric: AccountStatsMetric.Gains },
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
      filters: { metric: AccountStatsMetric.Losses },
      take: 25,
      skip: 0,
    });
    expect(page.items[0].address).toBe('0xaaa'); // -70
    expect(page.items[1].address).toBe('0xbbb'); // -40
  });

  it('ranks by volume descending', async () => {
    const page = await call({
      filters: { metric: AccountStatsMetric.Volume },
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
      filters: { metric: AccountStatsMetric.NetPnl },
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
      filters: { metric: AccountStatsMetric.NetPnl },
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
        metric: AccountStatsMetric.NetPnl,
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
      filters: { metric: AccountStatsMetric.NetPnl },
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
      filters: { metric: AccountStatsMetric.NetPnl },
      take: 2,
      skip: 0,
    });
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });

  it('populates totalCount unconditionally (cheap in-memory derivation)', async () => {
    const page = await call({
      filters: { metric: AccountStatsMetric.NetPnl },
      take: 2,
      skip: 0,
    });
    expect(page.totalCount).toBe(4);
  });
});

type RankArgs = {
  address: string;
  filters?: {
    metric?: (typeof AccountStatsMetric)[keyof typeof AccountStatsMetric];
    fromEpoch?: number | null;
    toEpoch?: number | null;
  } | null;
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
      filters: { metric: AccountStatsMetric.NetPnl },
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

  it('defaults to NET_PNL when `filters` is omitted', async () => {
    const r = await callRank({ address: '0xaaa' });
    expect(r.rank).toBe(2);
    expect(r.totalParticipants).toBe(4);
  });

  it('rank reflects metric — same address ranks differently by VOLUME vs NET_PNL', async () => {
    const byPnl = await callRank({
      address: '0xbbb',
      filters: { metric: AccountStatsMetric.NetPnl },
    });
    const byVolume = await callRank({
      address: '0xbbb',
      filters: { metric: AccountStatsMetric.Volume },
    });
    expect(byPnl.rank).toBe(4); // worst PnL
    expect(byVolume.rank).toBe(1); // highest volume
  });

  it('rank=null + zero stats when the address has no activity in the window', async () => {
    const r = await callRank({
      address: '0xunknown',
      filters: { metric: AccountStatsMetric.NetPnl },
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
      filters: { metric: AccountStatsMetric.NetPnl },
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
      filters: { metric: AccountStatsMetric.NetPnl },
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
        metric: AccountStatsMetric.NetPnl,
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

// ─── accountStats (time series fat row) ─────────────────────────────────────

type AccountStatsArgs = {
  address: string;
  filters?: { fromEpoch?: number | null; toEpoch?: number | null } | null;
};

type AccountStatsRow = {
  timestamp: number;
  pnl: string;
  cumulativePnl: string;
  volume: string;
  cumulativeVolume: string;
  deployedCollateral: string;
  claimableCollateral: string;
  predictionsTotal: number;
  predictionsWon: number;
  predictionsLost: number;
  predictionsPending: number;
  predictionsNonDecisive: number;
};

const callStats = (args: AccountStatsArgs): Promise<AccountStatsRow[]> =>
  (
    accountStats as unknown as (
      p: unknown,
      a: AccountStatsArgs,
      c: unknown,
      i: unknown
    ) => Promise<AccountStatsRow[]>
  )({}, args, {}, {});

describe('Query.accountStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Three aligned buckets (1d, 2d, 3d epoch); each helper returns its own slice.
    mockQueryAccountVolume.mockResolvedValue([
      { timestamp: 1_000_000, volume: WEI(10) },
      { timestamp: 1_086_400, volume: WEI(5) },
      { timestamp: 1_172_800, volume: WEI(20) },
    ]);
    mockQueryAccountPnl.mockResolvedValue([
      { timestamp: 1_000_000, pnl: WEI(3), cumulativePnl: WEI(3) },
      { timestamp: 1_086_400, pnl: WEI(-1), cumulativePnl: WEI(2) },
      { timestamp: 1_172_800, pnl: WEI(7), cumulativePnl: WEI(9) },
    ]);
    mockQueryAccountBalance.mockResolvedValue([
      {
        timestamp: 1_000_000,
        deployedCollateral: WEI(100),
        claimableCollateral: WEI(0),
      },
      {
        timestamp: 1_086_400,
        deployedCollateral: WEI(80),
        claimableCollateral: WEI(20),
      },
      {
        timestamp: 1_172_800,
        deployedCollateral: WEI(60),
        claimableCollateral: WEI(40),
      },
    ]);
    mockQueryAccountPredictionCount.mockResolvedValue([
      {
        timestamp: 1_000_000,
        total: 2,
        won: 0,
        lost: 0,
        pending: 2,
        nonDecisive: 0,
      },
      {
        timestamp: 1_086_400,
        total: 1,
        won: 1,
        lost: 0,
        pending: 0,
        nonDecisive: 0,
      },
      {
        timestamp: 1_172_800,
        total: 3,
        won: 1,
        lost: 1,
        pending: 1,
        nonDecisive: 0,
      },
    ]);
  });

  it('merges all four helper series into the fat row by timestamp, ascending', async () => {
    const rows = await callStats({ address: '0xABC' });
    expect(rows.map((r) => r.timestamp)).toEqual([
      1_000_000, 1_086_400, 1_172_800,
    ]);

    expect(rows[0]).toMatchObject({
      timestamp: 1_000_000,
      pnl: WEI(3),
      cumulativePnl: WEI(3),
      volume: WEI(10),
      deployedCollateral: WEI(100),
      claimableCollateral: WEI(0),
      predictionsTotal: 2,
      predictionsPending: 2,
    });
  });

  it('computes `cumulativeVolume` as a running sum across buckets', async () => {
    const rows = await callStats({ address: '0xabc' });
    expect(rows.map((r) => r.cumulativeVolume)).toEqual([
      WEI(10),
      WEI(15),
      WEI(35),
    ]);
  });

  it('normalizes the address to lowercase before querying helpers', async () => {
    await callStats({ address: '0xAbCdEf' });
    for (const m of [
      mockQueryAccountVolume,
      mockQueryAccountPnl,
      mockQueryAccountBalance,
      mockQueryAccountPredictionCount,
    ]) {
      expect(m).toHaveBeenCalledWith(
        '0xabcdef',
        expect.any(String),
        expect.any(Date),
        expect.any(Date)
      );
    }
  });

  it('defaults to a 365-day window when neither bound is given', async () => {
    const before = Math.floor(Date.now() / 1000);
    await callStats({ address: '0xabc' });
    const after = Math.floor(Date.now() / 1000);
    const [, , fromDate, toDate] = mockQueryAccountVolume.mock.calls[0];
    const fromEpoch = Math.floor((fromDate as Date).getTime() / 1000);
    const toEpoch = Math.floor((toDate as Date).getTime() / 1000);
    // `to` ≈ now, `from` ≈ now − 365d (within a 2-second tolerance for test latency).
    expect(toEpoch).toBeGreaterThanOrEqual(before);
    expect(toEpoch).toBeLessThanOrEqual(after + 1);
    expect(toEpoch - fromEpoch).toBe(365 * 86_400);
  });

  it('respects explicit `fromEpoch` / `toEpoch` bounds', async () => {
    const from = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000);
    const to = Math.floor(new Date('2026-02-01T00:00:00Z').getTime() / 1000);
    await callStats({
      address: '0xabc',
      filters: { fromEpoch: from, toEpoch: to },
    });
    const [, , fromDate, toDate] = mockQueryAccountVolume.mock.calls[0];
    expect(Math.floor((fromDate as Date).getTime() / 1000)).toBe(from);
    expect(Math.floor((toDate as Date).getTime() / 1000)).toBe(to);
  });

  it('returns an empty array when every helper returns nothing', async () => {
    for (const m of [
      mockQueryAccountVolume,
      mockQueryAccountPnl,
      mockQueryAccountBalance,
      mockQueryAccountPredictionCount,
    ]) {
      m.mockResolvedValue([]);
    }
    const rows = await callStats({ address: '0xabc' });
    expect(rows).toEqual([]);
  });

  it('keeps bars that only some helpers report (sparse merge)', async () => {
    // Volume + balance are sparse; pnl + counts have all three buckets.
    mockQueryAccountVolume.mockResolvedValue([
      { timestamp: 1_086_400, volume: WEI(5) },
    ]);
    mockQueryAccountBalance.mockResolvedValue([]);
    const rows = await callStats({ address: '0xabc' });
    expect(rows.map((r) => r.timestamp)).toEqual([
      1_000_000, 1_086_400, 1_172_800,
    ]);
    expect(rows[0].volume).toBe('0');
    expect(rows[0].deployedCollateral).toBe('0');
    expect(rows[1].volume).toBe(WEI(5));
    // Running cumulative volume still walks the merged-timestamp list.
    expect(rows.map((r) => r.cumulativeVolume)).toEqual(['0', WEI(5), WEI(5)]);
  });
});
