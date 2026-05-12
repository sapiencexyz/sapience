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

const { accountStatsLeaderboard } = await import('./accountStats');
const { AccountStatMetric } = await import('../../__generated__/resolvers');

type Args = {
  metric: (typeof AccountStatMetric)[keyof typeof AccountStatMetric];
  from?: Date | null;
  to?: Date | null;
  limit: number;
  skip: number;
};
const call = (args: Args) =>
  (
    accountStatsLeaderboard as unknown as (
      p: unknown,
      a: Args,
      c: unknown,
      i: unknown
    ) => Promise<Array<{ address: string }>>
  )({}, args, {}, {});

const WEI = (n: number) => (BigInt(n) * 10n ** 18n).toString();

describe('Query.accountStatsLeaderboard', () => {
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
    const rows = await call({
      metric: AccountStatMetric.NetPnl,
      limit: 25,
      skip: 0,
    });
    expect(rows.map((r) => r.address)).toEqual([
      '0xccc',
      '0xaaa',
      '0xddd', // only volume → netPnL 0
      '0xbbb',
    ]);
  });

  it('ranks by gains descending', async () => {
    const rows = await call({
      metric: AccountStatMetric.Gains,
      limit: 25,
      skip: 0,
    });
    expect(rows.slice(0, 2).map((r) => r.address)).toEqual(['0xccc', '0xaaa']);
  });

  it('ranks by losses ascending (biggest loss first)', async () => {
    const rows = await call({
      metric: AccountStatMetric.Losses,
      limit: 25,
      skip: 0,
    });
    expect(rows[0].address).toBe('0xaaa'); // -70
    expect(rows[1].address).toBe('0xbbb'); // -40
  });

  it('ranks by volume descending', async () => {
    const rows = await call({
      metric: AccountStatMetric.Volume,
      limit: 25,
      skip: 0,
    });
    expect(rows.slice(0, 2).map((r) => r.address)).toEqual(['0xbbb', '0xaaa']);
  });

  it('merges PnL and volume per address, defaulting the missing side to "0"', async () => {
    const rows = (await call({
      metric: AccountStatMetric.NetPnl,
      limit: 25,
      skip: 0,
    })) as Array<{
      address: string;
      netPnL: string;
      gains: string;
      losses: string;
      volume: string;
    }>;
    const ddd = rows.find((r) => r.address === '0xddd');
    expect(ddd).toMatchObject({ netPnL: '0', gains: '0', losses: '0' });
    expect(ddd?.volume).toBe(WEI(10));
    const ccc = rows.find((r) => r.address === '0xccc');
    expect(ccc?.volume).toBe('0');
  });

  it('passes the resolved epoch window through; omitting `from` means all-time', async () => {
    await call({ metric: AccountStatMetric.NetPnl, limit: 25, skip: 0 });
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
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    await call({
      metric: AccountStatMetric.NetPnl,
      from,
      to,
      limit: 25,
      skip: 0,
    });
    expect(mockPnLBreakdown).toHaveBeenCalledWith({
      fromEpoch: Math.floor(from.getTime() / 1000),
      toEpoch: Math.floor(to.getTime() / 1000),
    });
  });

  it('caps limit at 100 and applies skip', async () => {
    const rows = await call({
      metric: AccountStatMetric.NetPnl,
      limit: 1000,
      skip: 1,
    });
    // 4 distinct addresses, skip 1 ⇒ 3 returned.
    expect(rows).toHaveLength(3);
    expect(rows[0].address).toBe('0xaaa');
  });
});
