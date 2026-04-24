import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const { mockPrisma, mockQueryRaw } = vi.hoisted(() => {
  const mockQueryRaw = vi.fn();
  const mockPrisma = {
    $queryRaw: mockQueryRaw,
    prediction: { findMany: vi.fn() },
    vaultFlowEvent: { findMany: vi.fn() },
    protocolStatsSnapshot: {
      findMany: vi.fn(),
    },
  };
  return { mockPrisma, mockQueryRaw };
});

vi.mock('../../../db', () => ({ default: mockPrisma }));

vi.mock('@sapience/sdk/contracts', () => ({
  contracts: {
    predictionMarketVault: {
      42161: { address: '0xVault' },
    },
    predictionMarketEscrow: {
      42161: { address: '0xEscrow' },
    },
    collateralToken: {
      42161: { address: '0xCollateral' },
    },
  },
  normalizeLegacyEntry: (e: unknown) => e,
}));

vi.mock('@sapience/sdk/constants', () => ({
  DEFAULT_CHAIN_ID: 42161,
}));

vi.mock('../../../helpers/protocolStats', async () => {
  const actual = await vi.importActual<
    typeof import('../../../helpers/protocolStats')
  >('../../../helpers/protocolStats');
  return {
    ...actual,
    getProtocolStatsTimeSeries: vi.fn(),
    fetchVaultTVL: vi.fn().mockResolvedValue(0n),
    fetchVaultAvailableAssets: vi.fn().mockResolvedValue(0n),
    fetchVaultDeployed: vi.fn().mockResolvedValue(0n),
    fetchPredictionMarketEscrowTVL: vi.fn().mockResolvedValue(0n),
    calculateVaultPnL: vi.fn().mockResolvedValue({
      realizedPnL: 0n,
      positionsWon: 0,
      positionsLost: 0,
      totalCollateralWon: 0n,
      totalCollateralLost: 0n,
    }),
    calculateVaultFlows: vi.fn().mockResolvedValue({
      totalDeposits: 0n,
      totalWithdrawals: 0n,
    }),
  };
});

import { AnalyticsResolver } from '../AnalyticsResolver';
import * as protocolStats from '../../../helpers/protocolStats';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    timestamp: 0,
    chainId: 42161,
    vaultAddress: '0xvault',
    vaultBalance: '0',
    vaultAvailableAssets: '0',
    vaultDeployed: '0',
    escrowBalance: '0',
    vaultRealizedPnL: '0',
    vaultAirdropGains: '0',
    vaultDeposits: '0',
    vaultWithdrawals: '0',
    vaultPositionsWon: 0,
    vaultPositionsLost: 0,
    vaultCollateralWon: '0',
    vaultCollateralLost: '0',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AnalyticsResolver.protocolStats', () => {
  let resolver: AnalyticsResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new AnalyticsResolver();
    delete process.env.PROTOCOL_STATS_INTERVAL_SECONDS;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty array when no snapshots exist', async () => {
    vi.mocked(protocolStats.getProtocolStatsTimeSeries).mockResolvedValue([]);

    const result = await resolver.protocolStats();

    expect(result).toEqual([]);
  });

  it('shifts returned timestamps back by one interval so labels reflect the represented period', async () => {
    const t0 = Math.floor(Date.UTC(2026, 3, 20, 0, 0, 0) / 1000);
    const t1 = t0 + 86400;
    const t2 = t0 + 86400 * 2;

    vi.mocked(protocolStats.getProtocolStatsTimeSeries).mockResolvedValue([
      makeSnapshot({ timestamp: t0, vaultRealizedPnL: '0' }),
      makeSnapshot({ timestamp: t1, vaultRealizedPnL: '100' }),
      makeSnapshot({ timestamp: t2, vaultRealizedPnL: '300' }),
    ]);

    mockQueryRaw.mockResolvedValue([]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(t2 * 1000 + 1000));

    const result = await resolver.protocolStats();

    // A snapshot captured at Mar 5 00:00 UTC reflects "state/activity up to and
    // including Mar 4", so it should display under the Mar 4 label → timestamp
    // shifted back by one interval (86400s in this daily case).
    expect(result[0].timestamp).toBe(t0 - 86400);
    expect(result[1].timestamp).toBe(t1 - 86400);
    expect(result[2].timestamp).toBe(t2 - 86400);
  });

  it('computes periodPnL and periodVolume as adjacent deltas at hourly cadence', async () => {
    const t0 = Math.floor(Date.UTC(2026, 3, 23, 10, 0, 0) / 1000);
    const t1 = t0 + 3600;
    const t2 = t0 + 3600 * 2;

    vi.mocked(protocolStats.getProtocolStatsTimeSeries).mockResolvedValue([
      makeSnapshot({ timestamp: t0, vaultRealizedPnL: '100' }),
      makeSnapshot({ timestamp: t1, vaultRealizedPnL: '250' }),
      makeSnapshot({ timestamp: t2, vaultRealizedPnL: '600' }),
    ]);

    // Mock cumulative volume ascending; open interest flat
    mockQueryRaw
      .mockResolvedValueOnce([
        { timestamp: BigInt(t0), cumulative_volume: '1000' },
        { timestamp: BigInt(t1), cumulative_volume: '1500' },
        { timestamp: BigInt(t2), cumulative_volume: '2200' },
      ])
      .mockResolvedValueOnce([]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(t2 * 1000 + 1000));

    const result = await resolver.protocolStats();

    // First row: no previous, deltas are cumVol[0]-0 and pnl[0]-0
    expect(result[0].periodVolume).toBe('1000');
    expect(result[0].periodPnL).toBe('100');

    // Second row: deltas vs first
    expect(result[1].periodVolume).toBe('500');
    expect(result[1].periodPnL).toBe('150');

    // Third row: deltas vs second
    expect(result[2].periodVolume).toBe('700');
    expect(result[2].periodPnL).toBe('350');
  });

  it('preserves correct deltas at daily cadence (rename is the only change)', async () => {
    const t0 = Math.floor(Date.UTC(2026, 3, 20, 0, 0, 0) / 1000);
    const t1 = t0 + 86400;

    vi.mocked(protocolStats.getProtocolStatsTimeSeries).mockResolvedValue([
      makeSnapshot({ timestamp: t0, vaultRealizedPnL: '500' }),
      makeSnapshot({ timestamp: t1, vaultRealizedPnL: '800' }),
    ]);

    mockQueryRaw
      .mockResolvedValueOnce([
        { timestamp: BigInt(t0), cumulative_volume: '2000' },
        { timestamp: BigInt(t1), cumulative_volume: '3500' },
      ])
      .mockResolvedValueOnce([]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(t1 * 1000 + 1000));

    const result = await resolver.protocolStats();

    expect(result[1].periodVolume).toBe('1500');
    expect(result[1].periodPnL).toBe('300');
  });

  it('anchors the live candle to the current interval boundary (hourly)', async () => {
    process.env.PROTOCOL_STATS_INTERVAL_SECONDS = '3600';

    const t0 = Math.floor(Date.UTC(2026, 3, 23, 11, 0, 0) / 1000);
    const t1 = t0 + 3600; // 12:00 UTC

    vi.mocked(protocolStats.getProtocolStatsTimeSeries).mockResolvedValue([
      makeSnapshot({ timestamp: t0 }),
      makeSnapshot({ timestamp: t1 }),
    ]);

    mockQueryRaw.mockResolvedValue([]);

    // Query at 12:37:42 UTC — current interval boundary is 12:00:00 UTC;
    // the live candle represents "the in-progress 12:00–13:00 period" and is
    // labeled with its start-of-period boundary so the FE renders it at that x.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 23, 12, 37, 42)));

    const result = await resolver.protocolStats();

    const expectedCurrentBoundary = Math.floor(
      Date.UTC(2026, 3, 23, 12, 0, 0) / 1000
    );
    // Last entry is the appended live candle
    expect(result[result.length - 1].timestamp).toBe(expectedCurrentBoundary);
  });

  it('anchors the live candle to the current UTC day when interval defaults to daily', async () => {
    // No env var → default 86400
    const t0 = Math.floor(Date.UTC(2026, 3, 22, 0, 0, 0) / 1000);
    const t1 = t0 + 86400; // 2026-04-23 UTC midnight

    vi.mocked(protocolStats.getProtocolStatsTimeSeries).mockResolvedValue([
      makeSnapshot({ timestamp: t0 }),
      makeSnapshot({ timestamp: t1 }),
    ]);

    mockQueryRaw.mockResolvedValue([]);

    // Query at 12:37:42 UTC on 2026-04-23 — the in-progress day is 2026-04-23,
    // labeled with its start-of-day boundary 2026-04-23 00:00 UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 23, 12, 37, 42)));

    const result = await resolver.protocolStats();

    const expectedCurrentBoundary = Math.floor(
      Date.UTC(2026, 3, 23, 0, 0, 0) / 1000
    );
    expect(result[result.length - 1].timestamp).toBe(expectedCurrentBoundary);
  });
});
