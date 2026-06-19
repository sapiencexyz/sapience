import { beforeEach, describe, expect, it, vi } from 'vitest';

const INTERVAL = 86400;

// Two configured vault families; legacy lists empty.
const mockGetConfiguredVaults = vi.hoisted(() =>
  vi.fn(() => [
    { kind: 'protocol', address: '0xAAAA', config: { legacy: [] } },
    { kind: 'pyth', address: '0xBBBB', config: { legacy: [] } },
  ])
);

// All-vault raw snapshots at two daily timestamps. Per timestamp, available
// assets sum across families: 1_000_000 -> 100+200=300, 1_086_400 -> 150+250=400.
const mockGetProtocolStatsTimeSeries = vi.hoisted(() =>
  vi.fn(async () => [
    {
      vaultAddress: '0xaaaa',
      timestamp: 1_000_000,
      vaultAvailableAssets: '100',
      escrowBalance: '50',
    },
    {
      vaultAddress: '0xbbbb',
      timestamp: 1_000_000,
      vaultAvailableAssets: '200',
      escrowBalance: '50',
    },
    {
      vaultAddress: '0xaaaa',
      timestamp: 1_086_400,
      vaultAvailableAssets: '150',
      escrowBalance: '60',
    },
    {
      vaultAddress: '0xbbbb',
      timestamp: 1_086_400,
      vaultAvailableAssets: '250',
      escrowBalance: '60',
    },
  ])
);

const mockGetLatestProtocolStats = vi.hoisted(() =>
  vi.fn(async (_chainId: number, address: string) => ({
    timestamp: 1_086_400,
    vaultAvailableAssets: address === '0xaaaa' ? '150' : '250',
    escrowBalance: '60',
  }))
);

// v1 protocolStats: two recorded rows (display ts = rawTs − interval) plus the
// appended in-progress live candle (labelled far in the future, no raw match).
const mockV1ProtocolStats = vi.hoisted(() =>
  vi.fn(async () => [
    {
      timestamp: 1_000_000 - INTERVAL,
      cumulativeVolume: '1000',
      totalTradeCount: 5,
      periodVolume: '100',
      periodTradeCount: 2,
      openInterest: '10',
      escrowBalance: '50',
    },
    {
      timestamp: 1_086_400 - INTERVAL,
      cumulativeVolume: '2000',
      totalTradeCount: 9,
      periodVolume: '200',
      periodTradeCount: 4,
      openInterest: '20',
      escrowBalance: '60',
    },
    {
      timestamp: 1_700_000_000,
      cumulativeVolume: '2500',
      totalTradeCount: 12,
      periodVolume: '500',
      periodTradeCount: 3,
      openInterest: '25',
      escrowBalance: '70',
    },
  ])
);

vi.mock('../../../services/protocolStats', () => ({
  getConfiguredVaults: mockGetConfiguredVaults,
  getLatestProtocolStats: mockGetLatestProtocolStats,
  getProtocolStatsTimeSeries: mockGetProtocolStatsTimeSeries,
  resolveSnapshotIntervalSeconds: () => INTERVAL,
}));

vi.mock('@sapience/sdk/constants', () => ({ DEFAULT_CHAIN_ID: 13374202 }));

vi.mock('@sapience/sdk/contracts', () => ({
  normalizeLegacyEntry: (le: { address?: string } | string) =>
    typeof le === 'string' ? { address: le } : { address: le.address ?? '' },
}));

vi.mock('../../sdl/resolvers/queries/analytics', () => ({
  protocolStats: mockV1ProtocolStats,
  openInterestByCategory: vi.fn(),
  openInterestByTimeToResolution: vi.fn(),
}));

vi.mock('../cacheHints', () => ({
  CACHE_HINTS: { SNAPSHOT_MINUTE: {} },
  setCacheHint: vi.fn(),
}));

import { Protocol, __clearProtocolCaches } from './Protocol';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult>;

describe('Protocol (v2)', () => {
  // Memoized TVL / cross-family reads persist across calls; clear them (and
  // mock call counts) between tests so each starts from a cold cache.
  beforeEach(() => {
    vi.clearAllMocks();
    __clearProtocolCaches();
  });

  it('statsHistory drops the live candle and aggregates TVL across all vaults', async () => {
    const conn = await callResolver<{
      nodes: {
        timestamp: number;
        cumulativeVolume: string;
        cumulativeTradeCount: number;
        totalValueLocked: bigint;
      }[];
      totalCount: number;
    }>(Protocol.statsHistory)(null, {}, {}, null);

    // 3 v1 rows in, live candle (cumulativeVolume '2500') filtered out.
    expect(conn.totalCount).toBe(2);
    expect(conn.nodes.map((n) => n.cumulativeVolume)).toEqual(['1000', '2000']);

    // totalValueLocked = chain-wide escrow + Σ available across families:
    //   row1: 50 + 300 = 350 ; row2: 60 + 400 = 460
    expect(conn.nodes[0].totalValueLocked).toBe(350n);
    expect(conn.nodes[1].totalValueLocked).toBe(460n);

    // v1's `totalTradeCount` is surfaced as `cumulativeTradeCount`.
    expect(conn.nodes.map((n) => n.cumulativeTradeCount)).toEqual([5, 9]);
  });

  it('statsHistory honors the filter.timestamp window (display-ts, inclusive)', async () => {
    // History display timestamps are 913_600 and 1_000_000 (live candle aside).
    // gte = 1_000_000 should keep only the later row.
    const conn = await callResolver<{
      nodes: { timestamp: number; cumulativeVolume: string }[];
      totalCount: number;
    }>(Protocol.statsHistory)(
      null,
      { filter: { timestamp: { gte: 1_000_000 } } },
      {},
      null
    );
    expect(conn.totalCount).toBe(1);
    expect(conn.nodes.map((n) => n.timestamp)).toEqual([1_000_000]);
    expect(conn.nodes[0].cumulativeVolume).toBe('2000');
  });

  it('stats returns the live candle with live cross-vault TVL', async () => {
    const stat = await callResolver<{
      cumulativeVolume: string;
      cumulativeTradeCount: number;
      totalValueLocked: bigint;
    }>(Protocol.stats)(null, {}, {}, null);

    expect(stat.cumulativeVolume).toBe('2500');
    expect(stat.cumulativeTradeCount).toBe(12);
    // computeProtocolTvl: latest escrow 60 + (150 + 250) = 460
    expect(stat.totalValueLocked).toBe(460n);
  });

  it('statsHistory(interval: DAY) buckets sub-daily snapshots into one node per day', async () => {
    // Three recorded rows: two land in the same UTC day, one in the next.
    // Display ts = rawTs − INTERVAL; rawTs is what crossFamily keys TVL on.
    //   display 90000  (raw 176400) -> day 86400
    //   display 93600  (raw 180000) -> day 86400  (same bucket)
    //   display 176400 (raw 262800) -> day 172800
    mockV1ProtocolStats.mockResolvedValueOnce([
      {
        timestamp: 90000,
        cumulativeVolume: '1000',
        totalTradeCount: 5,
        periodVolume: '100',
        periodTradeCount: 2,
        openInterest: '10',
        escrowBalance: '50',
      },
      {
        timestamp: 93600,
        cumulativeVolume: '1500',
        totalTradeCount: 8,
        periodVolume: '500',
        periodTradeCount: 3,
        openInterest: '15',
        escrowBalance: '55',
      },
      {
        timestamp: 176400,
        cumulativeVolume: '2000',
        totalTradeCount: 9,
        periodVolume: '500',
        periodTradeCount: 1,
        openInterest: '20',
        escrowBalance: '60',
      },
      // live candle — no matching raw snapshot, dropped before bucketing.
      {
        timestamp: 1_700_000_000,
        cumulativeVolume: '9999',
        totalTradeCount: 99,
        periodVolume: '0',
        periodTradeCount: 0,
        openInterest: '0',
        escrowBalance: '0',
      },
    ]);
    // crossFamily only reads vaultAvailableAssets; escrowBalance is required by
    // the row shape but unused for the TVL-per-snapshot sum here.
    mockGetProtocolStatsTimeSeries.mockResolvedValueOnce([
      {
        vaultAddress: '0xaaaa',
        timestamp: 176400,
        vaultAvailableAssets: '100',
        escrowBalance: '0',
      },
      {
        vaultAddress: '0xbbbb',
        timestamp: 176400,
        vaultAvailableAssets: '200',
        escrowBalance: '0',
      },
      {
        vaultAddress: '0xaaaa',
        timestamp: 180000,
        vaultAvailableAssets: '150',
        escrowBalance: '0',
      },
      {
        vaultAddress: '0xbbbb',
        timestamp: 180000,
        vaultAvailableAssets: '250',
        escrowBalance: '0',
      },
      {
        vaultAddress: '0xaaaa',
        timestamp: 262800,
        vaultAvailableAssets: '1',
        escrowBalance: '0',
      },
      {
        vaultAddress: '0xbbbb',
        timestamp: 262800,
        vaultAvailableAssets: '2',
        escrowBalance: '0',
      },
    ]);

    const conn = await callResolver<{
      nodes: {
        timestamp: number;
        cumulativeVolume: string;
        cumulativeTradeCount: number;
        periodVolume: string;
        periodTradeCount: number;
        openInterest: string;
        escrowBalance: string;
        totalValueLocked: bigint;
      }[];
      totalCount: number;
    }>(Protocol.statsHistory)(null, { interval: 'DAY' }, {}, null);

    expect(conn.totalCount).toBe(2);
    expect(conn.nodes.map((n) => n.timestamp)).toEqual([86400, 172800]);

    // Bucket 86400: stock fields from the last (display 93600) row; flows summed.
    const first = conn.nodes[0];
    expect(first.cumulativeVolume).toBe('1500');
    expect(first.cumulativeTradeCount).toBe(8);
    expect(first.openInterest).toBe('15');
    expect(first.escrowBalance).toBe('55');
    expect(first.periodVolume).toBe('600'); // 100 + 500
    expect(first.periodTradeCount).toBe(5); // 2 + 3
    // TVL = escrow 55 + (150 + 250) available at raw ts 180000 = 455
    expect(first.totalValueLocked).toBe(455n);

    // Bucket 172800: a single snapshot, flows passthrough.
    const second = conn.nodes[1];
    expect(second.cumulativeVolume).toBe('2000');
    expect(second.periodVolume).toBe('500');
    expect(second.periodTradeCount).toBe(1);
    // TVL = escrow 60 + (1 + 2) available at raw ts 262800 = 63
    expect(second.totalValueLocked).toBe(63n);
  });

  it('memoizes the cross-family available-assets read across statsHistory calls (B)', async () => {
    await callResolver(Protocol.statsHistory)(null, {}, {}, null);
    await callResolver(Protocol.statsHistory)(null, {}, {}, null);
    // crossFamilyAvailableByRawTs is the only caller of getProtocolStatsTimeSeries
    // here; memoized, it runs once for both pages within the TTL window.
    expect(mockGetProtocolStatsTimeSeries).toHaveBeenCalledTimes(1);
  });

  it('memoizes the live TVL read across stats calls (C)', async () => {
    await callResolver(Protocol.stats)(null, {}, {}, null);
    await callResolver(Protocol.stats)(null, {}, {}, null);
    // computeProtocolTvl reads the latest snapshot once per configured vault (2);
    // memoized, the second stats call adds none (4 without the cache).
    expect(mockGetLatestProtocolStats).toHaveBeenCalledTimes(2);
  });
});
