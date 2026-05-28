import { describe, expect, it, vi } from 'vitest';

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

import { Protocol } from './Protocol';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult>;

describe('Protocol (v2)', () => {
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
});
