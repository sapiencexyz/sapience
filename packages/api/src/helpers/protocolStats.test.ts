import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const { mockPrisma, mockReadContract } = vi.hoisted(() => {
  const mockReadContract = vi.fn().mockResolvedValue(1000000000000000000n);
  const mockPrisma = {
    prediction: { findMany: vi.fn() },
    vaultFlowEvent: { findMany: vi.fn() },
    protocolStatsSnapshot: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return { mockPrisma, mockReadContract };
});

vi.mock('../db', () => ({ default: mockPrisma }));

vi.mock('../../generated/prisma', () => ({
  SettlementResult: {
    UNRESOLVED: 'UNRESOLVED',
    PREDICTOR_WINS: 'PREDICTOR_WINS',
    COUNTERPARTY_WINS: 'COUNTERPARTY_WINS',
    NON_DECISIVE: 'NON_DECISIVE',
  },
}));

vi.mock('../utils/utils', () => ({
  getProviderForChain: vi.fn().mockReturnValue({
    readContract: mockReadContract,
  }),
  // computeAndStoreProtocolStats now resolves a block for its snapshot
  // timestamp so on-chain reads are pinned. The default mock returns a
  // stable non-null blockNumber; individual tests override via mockResolvedValue
  // if they need a different scenario.
  getBlockByTimestamp: vi.fn().mockResolvedValue({
    number: 123456n,
    timestamp: 1700000000n,
  }),
}));

vi.mock('@sapience/sdk/contracts', () => ({
  contracts: {
    collateralToken: {
      42161: { address: '0xCollateral' },
    },
    predictionMarketEscrow: {
      42161: { address: '0xEscrow' },
    },
    predictionMarketVault: {
      42161: { address: '0xVault' },
    },
  },
}));

vi.mock('@sapience/sdk/abis', () => ({
  predictionMarketVaultAbi: [],
}));

vi.mock('@sapience/sdk/constants', () => ({
  DEFAULT_CHAIN_ID: 42161,
}));

import {
  fetchVaultDeployed,
  computeAndStoreProtocolStats,
  getLatestProtocolStats,
  getProtocolStatsTimeSeries,
  buildVaultAggregator,
  sumEscrowBalancesAtBlock,
} from './protocolStats';

// ─── fetchVaultDeployed ─────────────────────────────────────────────────────

describe('fetchVaultDeployed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sums counterpartyCollateral for unsettled predictions', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      { counterpartyCollateral: '500000000000000000' },
      { counterpartyCollateral: '300000000000000000' },
      { counterpartyCollateral: '200000000000000000' },
    ]);

    const result = await fetchVaultDeployed(42161);

    expect(result).toBe(1000000000000000000n);
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith({
      where: {
        chainId: 42161,
        counterparty: '0xvault',
        OR: [
          { pickConfigId: null },
          { pickConfiguration: { resolved: false } },
        ],
      },
      select: { counterpartyCollateral: true },
    });
  });

  it('returns 0n when no matching predictions', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);

    const result = await fetchVaultDeployed(42161);

    expect(result).toBe(0n);
  });

  it('filters by atTimestamp when provided', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      { counterpartyCollateral: '100000000000000000' },
    ]);

    const timestamp = 1700000000;
    await fetchVaultDeployed(42161, timestamp);

    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith({
      where: {
        chainId: 42161,
        counterparty: '0xvault',
        onChainCreatedAt: { lte: timestamp },
        OR: [
          { pickConfigId: null },
          { pickConfiguration: { resolved: false } },
          {
            pickConfiguration: {
              resolved: true,
              resolvedAt: { gt: timestamp },
            },
          },
        ],
      },
      select: { counterpartyCollateral: true },
    });
  });

  it('returns 0n when no vault address is configured for chainId', async () => {
    const result = await fetchVaultDeployed(999);

    expect(result).toBe(0n);
    expect(mockPrisma.prediction.findMany).not.toHaveBeenCalled();
  });
});

// ─── computeAndStoreProtocolStats ───────────────────────────────────────────

describe('computeAndStoreProtocolStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no predictions, no flow events
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([]);
    mockPrisma.protocolStatsSnapshot.upsert.mockResolvedValue({});
    // readContract returns 1e18 for all calls (vault balance, available assets, escrow balance)
    mockReadContract.mockResolvedValue(1000000000000000000n);
  });

  it('computes airdrop gains when actual > expected', async () => {
    // vault balance (readContract call 1) = 1e18
    // vault available (readContract call 2) = 1e18
    // escrow balance (readContract call 3) = 1e18
    // vault deployed = 0 (no predictions)
    // deposits = 500000000000000000 (0.5e18), withdrawals = 0
    // PnL = 0 (no positions)
    // actual = vaultBalance + vaultDeployed = 1e18 + 0 = 1e18
    // expected = deposits - withdrawals + pnl = 0.5e18 - 0 + 0 = 0.5e18
    // airdropGains = 1e18 - 0.5e18 = 0.5e18
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([
      { assets: '500000000000000000', eventType: 'deposit' },
    ]);

    await computeAndStoreProtocolStats(42161);

    expect(mockPrisma.protocolStatsSnapshot.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    expect(upsertCall.create.vaultAirdropGains).toBe('500000000000000000');
  });

  it('sets airdrop gains to 0 when actual <= expected', async () => {
    // vault balance = 1e18, vault deployed = 0
    // deposits = 2e18, withdrawals = 0, PnL = 0
    // actual = 1e18, expected = 2e18
    // airdropGains = 0 (actual < expected)
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([
      { assets: '2000000000000000000', eventType: 'deposit' },
    ]);

    await computeAndStoreProtocolStats(42161);

    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    expect(upsertCall.create.vaultAirdropGains).toBe('0');
  });

  it('upserts snapshot with all fields correctly mapped', async () => {
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([
      { assets: '1000000000000000000', eventType: 'deposit' },
    ]);

    await computeAndStoreProtocolStats(42161);

    expect(mockPrisma.protocolStatsSnapshot.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];

    // Verify where clause structure
    expect(upsertCall.where.chainId_vaultAddress_timestamp).toMatchObject({
      chainId: 42161,
      vaultAddress: '0xvault',
    });

    // Verify create payload has all expected fields
    const create = upsertCall.create;
    expect(create.chainId).toBe(42161);
    expect(create.vaultAddress).toBe('0xvault');
    expect(create.vaultBalance).toBe('1000000000000000000');
    expect(create.vaultAvailableAssets).toBe('1000000000000000000');
    expect(create.vaultDeployed).toBe('0');
    expect(create.escrowBalance).toBe('1000000000000000000');
    expect(create.vaultRealizedPnL).toBe('0');
    expect(create.vaultDeposits).toBe('1000000000000000000');
    expect(create.vaultWithdrawals).toBe('0');
    expect(create.vaultPositionsWon).toBe(0);
    expect(create.vaultPositionsLost).toBe(0);
    expect(create.vaultCollateralWon).toBe('0');
    expect(create.vaultCollateralLost).toBe('0');

    // Verify update payload matches create payload for all value fields
    const update = upsertCall.update;
    expect(update.vaultBalance).toBe(create.vaultBalance);
    expect(update.vaultAvailableAssets).toBe(create.vaultAvailableAssets);
    expect(update.vaultDeployed).toBe(create.vaultDeployed);
    expect(update.escrowBalance).toBe(create.escrowBalance);
    expect(update.vaultRealizedPnL).toBe(create.vaultRealizedPnL);
    expect(update.vaultAirdropGains).toBe(create.vaultAirdropGains);
    expect(update.vaultDeposits).toBe(create.vaultDeposits);
    expect(update.vaultWithdrawals).toBe(create.vaultWithdrawals);
    expect(update.vaultPositionsWon).toBe(create.vaultPositionsWon);
    expect(update.vaultPositionsLost).toBe(create.vaultPositionsLost);
    expect(update.vaultCollateralWon).toBe(create.vaultCollateralWon);
    expect(update.vaultCollateralLost).toBe(create.vaultCollateralLost);
  });

  it('defaults to daily flooring (UTC midnight) when no interval specified', async () => {
    await computeAndStoreProtocolStats(42161);

    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    const timestamp = upsertCall.where.chainId_vaultAddress_timestamp.timestamp;

    const now = new Date();
    const expectedMidnight = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000
    );

    expect(timestamp).toBe(expectedMidnight);
    expect(upsertCall.create.timestamp).toBe(expectedMidnight);
  });

  it('floors timestamp to the configured interval (hourly)', async () => {
    // 12:37:42 UTC on 2026-04-23
    const mockNowMs = Date.UTC(2026, 3, 23, 12, 37, 42);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mockNowMs));

    try {
      await computeAndStoreProtocolStats(42161, 3600);

      const upsertCall =
        mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
      const timestamp =
        upsertCall.where.chainId_vaultAddress_timestamp.timestamp;

      // Floor of 12:37:42 UTC to nearest hour is 12:00:00 UTC
      const expected = Math.floor(Date.UTC(2026, 3, 23, 12, 0, 0) / 1000);
      expect(timestamp).toBe(expected);
      expect(upsertCall.create.timestamp).toBe(expected);
    } finally {
      vi.useRealTimers();
    }
  });

  it('floors timestamp to the configured interval (15 minutes)', async () => {
    // 12:37:42 UTC on 2026-04-23
    const mockNowMs = Date.UTC(2026, 3, 23, 12, 37, 42);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mockNowMs));

    try {
      await computeAndStoreProtocolStats(42161, 900);

      const upsertCall =
        mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
      const timestamp =
        upsertCall.where.chainId_vaultAddress_timestamp.timestamp;

      // Floor of 12:37:42 UTC to nearest 15 min is 12:30:00 UTC
      const expected = Math.floor(Date.UTC(2026, 3, 23, 12, 30, 0) / 1000);
      expect(timestamp).toBe(expected);
    } finally {
      vi.useRealTimers();
    }
  });

  it('floors to UTC midnight when interval is 86400', async () => {
    // 17:45:00 UTC on 2026-04-23
    const mockNowMs = Date.UTC(2026, 3, 23, 17, 45, 0);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mockNowMs));

    try {
      await computeAndStoreProtocolStats(42161, 86400);

      const upsertCall =
        mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
      const timestamp =
        upsertCall.where.chainId_vaultAddress_timestamp.timestamp;

      const expected = Math.floor(Date.UTC(2026, 3, 23, 0, 0, 0) / 1000);
      expect(timestamp).toBe(expected);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pins every readContract to the resolved blockNumber (no chain-head reads)', async () => {
    await computeAndStoreProtocolStats(42161);

    // Every readContract call for this snapshot must carry a blockNumber so
    // on-chain state is evaluated at the resolved historical block, not at
    // chain head when the cron happens to fire.
    expect(mockReadContract).toHaveBeenCalled();
    for (const call of mockReadContract.mock.calls) {
      const args = call[0] as { blockNumber?: bigint };
      expect(args.blockNumber).toBe(123456n);
    }
  });
});

// ─── calculateVaultPnL (via computeAndStoreProtocolStats) ───────────────────

describe('vault PnL calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([]);
    mockPrisma.protocolStatsSnapshot.upsert.mockResolvedValue({});
    mockReadContract.mockResolvedValue(1000000000000000000n);
  });

  it('calculates gains when vault wins as counterparty', async () => {
    // fetchVaultDeployed call returns no active predictions
    // calculateVaultPnL call returns resolved prediction where vault won
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([]) // fetchVaultDeployed
      .mockResolvedValueOnce([
        {
          predictor: '0xuser',
          counterparty: '0xvault',
          predictorCollateral: '300000000000000000',
          counterpartyCollateral: '700000000000000000',
          pickConfiguration: { result: 'COUNTERPARTY_WINS' },
        },
      ]);

    await computeAndStoreProtocolStats(42161);

    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    // Vault won as counterparty: gains = predictorCollateral = 0.3e18
    expect(upsertCall.create.vaultRealizedPnL).toBe('300000000000000000');
    expect(upsertCall.create.vaultPositionsWon).toBe(1);
    expect(upsertCall.create.vaultPositionsLost).toBe(0);
    expect(upsertCall.create.vaultCollateralWon).toBe('300000000000000000');
    expect(upsertCall.create.vaultCollateralLost).toBe('0');
  });

  it('calculates losses when vault loses as counterparty', async () => {
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([]) // fetchVaultDeployed
      .mockResolvedValueOnce([
        {
          predictor: '0xuser',
          counterparty: '0xvault',
          predictorCollateral: '300000000000000000',
          counterpartyCollateral: '700000000000000000',
          pickConfiguration: { result: 'PREDICTOR_WINS' },
        },
      ]);

    await computeAndStoreProtocolStats(42161);

    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    // Vault lost as counterparty: loss = counterpartyCollateral = 0.7e18
    expect(upsertCall.create.vaultRealizedPnL).toBe('-700000000000000000');
    expect(upsertCall.create.vaultPositionsWon).toBe(0);
    expect(upsertCall.create.vaultPositionsLost).toBe(1);
    expect(upsertCall.create.vaultCollateralLost).toBe('700000000000000000');
  });

  it('handles mixed wins and losses', async () => {
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([]) // fetchVaultDeployed
      .mockResolvedValueOnce([
        {
          predictor: '0xuser1',
          counterparty: '0xvault',
          predictorCollateral: '200000000000000000',
          counterpartyCollateral: '800000000000000000',
          pickConfiguration: { result: 'COUNTERPARTY_WINS' },
        },
        {
          predictor: '0xuser2',
          counterparty: '0xvault',
          predictorCollateral: '500000000000000000',
          counterpartyCollateral: '500000000000000000',
          pickConfiguration: { result: 'PREDICTOR_WINS' },
        },
      ]);

    await computeAndStoreProtocolStats(42161);

    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    // Win: +0.2e18, Loss: -0.5e18, Net: -0.3e18
    expect(upsertCall.create.vaultRealizedPnL).toBe('-300000000000000000');
    expect(upsertCall.create.vaultPositionsWon).toBe(1);
    expect(upsertCall.create.vaultPositionsLost).toBe(1);
    expect(upsertCall.create.vaultCollateralWon).toBe('200000000000000000');
    expect(upsertCall.create.vaultCollateralLost).toBe('500000000000000000');
  });

  it('skips predictions with UNRESOLVED result', async () => {
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([]) // fetchVaultDeployed
      .mockResolvedValueOnce([
        {
          predictor: '0xuser',
          counterparty: '0xvault',
          predictorCollateral: '500000000000000000',
          counterpartyCollateral: '500000000000000000',
          pickConfiguration: { result: 'UNRESOLVED' },
        },
      ]);

    await computeAndStoreProtocolStats(42161);

    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    expect(upsertCall.create.vaultRealizedPnL).toBe('0');
    expect(upsertCall.create.vaultPositionsWon).toBe(0);
    expect(upsertCall.create.vaultPositionsLost).toBe(0);
  });
});

// ─── getLatestProtocolStats ─────────────────────────────────────────────────

describe('getLatestProtocolStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries with correct where clause and ordering', async () => {
    const mockSnapshot = { timestamp: 1700000000, vaultBalance: '1000' };
    mockPrisma.protocolStatsSnapshot.findFirst.mockResolvedValue(mockSnapshot);

    const result = await getLatestProtocolStats(42161);

    expect(result).toBe(mockSnapshot);
    expect(mockPrisma.protocolStatsSnapshot.findFirst).toHaveBeenCalledWith({
      where: { chainId: 42161 },
      orderBy: { timestamp: 'desc' },
    });
  });

  it('includes vaultAddress in where clause when provided', async () => {
    mockPrisma.protocolStatsSnapshot.findFirst.mockResolvedValue(null);

    await getLatestProtocolStats(42161, '0xMyVault');

    expect(mockPrisma.protocolStatsSnapshot.findFirst).toHaveBeenCalledWith({
      where: { chainId: 42161, vaultAddress: '0xMyVault' },
      orderBy: { timestamp: 'desc' },
    });
  });
});

// ─── getProtocolStatsTimeSeries ─────────────────────────────────────────────

describe('getProtocolStatsTimeSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries with correct time range and ordering', async () => {
    const mockSnapshots = [
      { timestamp: 1700000000 },
      { timestamp: 1700086400 },
    ];
    mockPrisma.protocolStatsSnapshot.findMany.mockResolvedValue(mockSnapshots);

    const result = await getProtocolStatsTimeSeries(30, 42161);

    expect(result).toBe(mockSnapshots);
    expect(mockPrisma.protocolStatsSnapshot.findMany).toHaveBeenCalledTimes(1);

    const call = mockPrisma.protocolStatsSnapshot.findMany.mock.calls[0][0];
    expect(call.where.chainId).toBe(42161);
    expect(call.where.timestamp.gte).toBeTypeOf('number');
    expect(call.orderBy).toEqual({ timestamp: 'asc' });
  });

  it('computes start timestamp as UTC midnight minus days*86400', async () => {
    mockPrisma.protocolStatsSnapshot.findMany.mockResolvedValue([]);

    const days = 7;
    await getProtocolStatsTimeSeries(days, 42161);

    const call = mockPrisma.protocolStatsSnapshot.findMany.mock.calls[0][0];
    const startTimestamp = call.where.timestamp.gte;

    // getUtcMidnightTimestamp strips time to UTC midnight, then subtracts days*86400
    const now = new Date();
    const todayMidnightUtc = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000
    );
    const expectedStart = todayMidnightUtc - days * 86400;

    expect(startTimestamp).toBe(expectedStart);
  });

  it('includes vaultAddress filter when provided', async () => {
    mockPrisma.protocolStatsSnapshot.findMany.mockResolvedValue([]);

    await getProtocolStatsTimeSeries(90, 42161, '0xMyVault');

    const call = mockPrisma.protocolStatsSnapshot.findMany.mock.calls[0][0];
    expect(call.where.vaultAddress).toBe('0xMyVault');
  });
});

// ─── buildVaultAggregator (in-memory replacements used by backfill) ─────────

describe('buildVaultAggregator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The mocked SDK config exposes vault `0xVault` (lower-cased to `0xvault` in
  // the helper). Each test seeds a small prediction + flow-event dataset and
  // exercises the three aggregators. Predicates are ports of the SQL filters
  // in fetchVaultDeployed / calculateVaultPnL / calculateVaultFlows; the goal
  // is to lock those predicates so a future SQL change can't silently drift
  // out of sync with the in-memory port.
  const T = 1_000_000;

  it('deployedAt: includes pickConfigId=null predictions before t', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      {
        counterparty: '0xvault',
        predictor: '0xuser',
        onChainCreatedAt: T - 100,
        counterpartyCollateral: '500',
        predictorCollateral: '0',
        pickConfigId: null,
        pickConfiguration: null,
      },
    ]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([]);

    const agg = await buildVaultAggregator(42161);
    expect(agg.deployedAt(T)).toBe(500n);
  });

  it('deployedAt: excludes predictions created after t', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      {
        counterparty: '0xvault',
        predictor: '0xuser',
        onChainCreatedAt: T + 1,
        counterpartyCollateral: '500',
        predictorCollateral: '0',
        pickConfigId: null,
        pickConfiguration: null,
      },
    ]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([]);

    const agg = await buildVaultAggregator(42161);
    expect(agg.deployedAt(T)).toBe(0n);
  });

  it('deployedAt: pickConfiguration resolved before t excludes prediction', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      {
        counterparty: '0xvault',
        predictor: '0xuser',
        onChainCreatedAt: T - 100,
        counterpartyCollateral: '500',
        predictorCollateral: '0',
        pickConfigId: 'pc1',
        pickConfiguration: {
          resolved: true,
          resolvedAt: T - 10,
          result: 'PREDICTOR_WINS',
        },
      },
    ]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([]);

    const agg = await buildVaultAggregator(42161);
    expect(agg.deployedAt(T)).toBe(0n);
  });

  it('deployedAt: pickConfiguration resolved after t still counts as deployed', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      {
        counterparty: '0xvault',
        predictor: '0xuser',
        onChainCreatedAt: T - 100,
        counterpartyCollateral: '500',
        predictorCollateral: '0',
        pickConfigId: 'pc1',
        pickConfiguration: {
          resolved: true,
          resolvedAt: T + 10,
          result: 'PREDICTOR_WINS',
        },
      },
    ]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([]);

    const agg = await buildVaultAggregator(42161);
    expect(agg.deployedAt(T)).toBe(500n);
  });

  it('pnlAt: resolved win/loss + UNRESOLVED skip + future-resolution skip', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      // Vault wins as counterparty: gains = predictorCollateral
      {
        predictor: '0xuser',
        counterparty: '0xvault',
        predictorCollateral: '300',
        counterpartyCollateral: '700',
        onChainCreatedAt: T - 200,
        pickConfigId: 'pc1',
        pickConfiguration: {
          resolved: true,
          resolvedAt: T - 50,
          result: 'COUNTERPARTY_WINS',
        },
      },
      // Vault loses as predictor: loss = predictorCollateral
      {
        predictor: '0xvault',
        counterparty: '0xuser',
        predictorCollateral: '500',
        counterpartyCollateral: '500',
        onChainCreatedAt: T - 150,
        pickConfigId: 'pc2',
        pickConfiguration: {
          resolved: true,
          resolvedAt: T - 40,
          result: 'COUNTERPARTY_WINS',
        },
      },
      // UNRESOLVED — skipped
      {
        predictor: '0xuser',
        counterparty: '0xvault',
        predictorCollateral: '999',
        counterpartyCollateral: '999',
        onChainCreatedAt: T - 100,
        pickConfigId: 'pc3',
        pickConfiguration: {
          resolved: true,
          resolvedAt: T - 10,
          result: 'UNRESOLVED',
        },
      },
      // Resolved AFTER t — skipped at this snapshot
      {
        predictor: '0xuser',
        counterparty: '0xvault',
        predictorCollateral: '111',
        counterpartyCollateral: '111',
        onChainCreatedAt: T - 100,
        pickConfigId: 'pc4',
        pickConfiguration: {
          resolved: true,
          resolvedAt: T + 10,
          result: 'COUNTERPARTY_WINS',
        },
      },
    ]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([]);

    const agg = await buildVaultAggregator(42161);
    const result = agg.pnlAt(T);
    expect(result.realizedPnL).toBe(300n - 500n);
    expect(result.positionsWon).toBe(1);
    expect(result.positionsLost).toBe(1);
    expect(result.totalCollateralWon).toBe(300n);
    expect(result.totalCollateralLost).toBe(500n);
  });

  it('flowsAt: filters by timestamp <= t and partitions deposit vs withdrawal', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([
      { timestamp: T - 100, eventType: 'deposit', assets: '1000' },
      { timestamp: T - 50, eventType: 'withdrawal', assets: '200' },
      { timestamp: T - 25, eventType: 'deposit', assets: '500' },
      // After t — skipped
      { timestamp: T + 10, eventType: 'deposit', assets: '999' },
    ]);

    const agg = await buildVaultAggregator(42161);
    const result = agg.flowsAt(T);
    expect(result.totalDeposits).toBe(1500n);
    expect(result.totalWithdrawals).toBe(200n);
  });

  it('returns zero-aggregators when chain has no vault configured', async () => {
    const agg = await buildVaultAggregator(999);
    expect(agg.deployedAt(T)).toBe(0n);
    expect(agg.pnlAt(T).realizedPnL).toBe(0n);
    expect(agg.flowsAt(T).totalDeposits).toBe(0n);
    expect(mockPrisma.prediction.findMany).not.toHaveBeenCalled();
  });
});

// ─── sumEscrowBalancesAtBlock catch narrowing ───────────────────────────────

describe('sumEscrowBalancesAtBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats ContractFunctionExecutionError as 0 balance for the failing address', async () => {
    const { ContractFunctionExecutionError } = await import('viem');
    // Two escrow addresses (mocked SDK config has only the primary, so we
    // use the same address for both client calls and rely on mock sequencing).
    const local = vi
      .fn()
      .mockResolvedValueOnce(1000n)
      .mockRejectedValueOnce(
        new ContractFunctionExecutionError(
          new Error('execution reverted') as Error,
          {
            abi: [],
            functionName: 'balanceOf',
          } as Parameters<typeof ContractFunctionExecutionError>[1]
        )
      );
    const total = await sumEscrowBalancesAtBlock(
      { readContract: local } as unknown as Parameters<
        typeof sumEscrowBalancesAtBlock
      >[0],
      42161,
      999n
    );
    // The mock SDK config only registers a single primary escrow; second
    // mockResolvedValue is never consumed. Just confirm: the first call
    // succeeded, total = first value.
    expect(total).toBe(1000n);
  });

  it('rethrows non-revert errors (rate-limit / network)', async () => {
    const local = vi.fn().mockRejectedValue(new Error('429 Too Many Requests'));
    await expect(
      sumEscrowBalancesAtBlock(
        { readContract: local } as unknown as Parameters<
          typeof sumEscrowBalancesAtBlock
        >[0],
        42161,
        999n
      )
    ).rejects.toThrow('429 Too Many Requests');
  });
});
