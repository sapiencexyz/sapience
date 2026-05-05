import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const { mockPrisma, mockReadContract } = vi.hoisted(() => {
  const mockReadContract = vi.fn().mockResolvedValue(1000000000000000000n);
  const mockPrisma = {
    prediction: { findMany: vi.fn() },
    vaultFlowEvent: { findMany: vi.fn() },
    close: { findMany: vi.fn() },
    secondaryTrade: { findMany: vi.fn() },
    collateralTransfer: { findMany: vi.fn() },
    claim: { findMany: vi.fn() },
    protocolStatsSnapshot: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return { mockPrisma, mockReadContract };
});

vi.mock('../../core/db', () => ({ default: mockPrisma }));

vi.mock('../../../generated/prisma', () => ({
  SettlementResult: {
    UNRESOLVED: 'UNRESOLVED',
    PREDICTOR_WINS: 'PREDICTOR_WINS',
    COUNTERPARTY_WINS: 'COUNTERPARTY_WINS',
    NON_DECISIVE: 'NON_DECISIVE',
  },
}));

vi.mock('../../lib/utils', () => ({
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
    pythPredictionMarketVault: {},
    singleLegVault: {},
    predictionMarketVaultStrategyB: {},
  },
  normalizeLegacyEntry: (entry: unknown) => entry,
}));

vi.mock('@sapience/sdk/abis', () => ({
  predictionMarketVaultAbi: [],
}));

vi.mock('@sapience/sdk/constants', () => ({
  DEFAULT_CHAIN_ID: 42161,
}));

import {
  computeAndStoreProtocolStats,
  getLatestProtocolStats,
  getProtocolStatsTimeSeries,
} from './snapshots';

// Helper for the default "no settlement, no flow, no trades, no transfers" baseline.
function resetEmptyState() {
  mockPrisma.prediction.findMany.mockResolvedValue([]);
  mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([]);
  mockPrisma.close.findMany.mockResolvedValue([]);
  mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
  mockPrisma.collateralTransfer.findMany.mockResolvedValue([]);
  mockPrisma.claim.findMany.mockResolvedValue([]);
  mockPrisma.protocolStatsSnapshot.upsert.mockResolvedValue({});
  mockReadContract.mockResolvedValue(1000000000000000000n);
}

// ─── computeAndStoreProtocolStats ───────────────────────────────────────────

describe('computeAndStoreProtocolStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmptyState();
  });

  it('computes airdrop gains from the direct CollateralTransfer query, not a residual', async () => {
    // 1.5e18 arrived in the vault, 0.5e18 was a deposit → airdrop = 1e18.
    // Note: residual would be 1e18 (vaultBalance) − 0.5e18 (deposit) = 0.5e18.
    // The new direct calc reports the actual external inflow regardless.
    mockPrisma.collateralTransfer.findMany.mockResolvedValue([
      { value: '1500000000000000000' },
    ]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([
      {
        assets: '500000000000000000',
        eventType: 'deposit',
        vaultAddress: '0xvault',
      },
    ]);

    await computeAndStoreProtocolStats(42161);

    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    expect(upsertCall.create.vaultAirdropGains).toBe('1000000000000000000');
  });

  it('persists secondary-market trade flow on the snapshot', async () => {
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      { buyer: '0xvault', seller: '0xother', price: '300000000000000000' },
      { buyer: '0xother', seller: '0xvault', price: '900000000000000000' },
    ]);

    await computeAndStoreProtocolStats(42161);

    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    expect(upsertCall.create.vaultSecondaryBought).toBe('300000000000000000');
    expect(upsertCall.create.vaultSecondarySold).toBe('900000000000000000');
  });

  it('upserts snapshot with all fields correctly mapped', async () => {
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([
      {
        assets: '1000000000000000000',
        eventType: 'deposit',
        vaultAddress: '0xvault',
      },
    ]);

    await computeAndStoreProtocolStats(42161);

    expect(mockPrisma.protocolStatsSnapshot.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];

    expect(upsertCall.where.chainId_vaultAddress_timestamp).toMatchObject({
      chainId: 42161,
      vaultAddress: '0xvault',
    });

    const create = upsertCall.create;
    expect(create.chainId).toBe(42161);
    expect(create.vaultAddress).toBe('0xvault');
    expect(create.vaultBalance).toBe('1000000000000000000');
    expect(create.vaultAvailableAssets).toBe('1000000000000000000');
    expect(create.vaultDeployed).toBe('0');
    expect(create.escrowBalance).toBe('1000000000000000000');
    expect(create.vaultRealizedPnL).toBe('0');
    expect(create.vaultSecondaryBought).toBe('0');
    expect(create.vaultSecondarySold).toBe('0');
    expect(create.vaultDeposits).toBe('1000000000000000000');
    expect(create.vaultWithdrawals).toBe('0');
    expect(create.vaultPositionsWon).toBe(0);
    expect(create.vaultPositionsLost).toBe(0);
    expect(create.vaultCollateralWon).toBe('0');
    expect(create.vaultCollateralLost).toBe('0');

    const update = upsertCall.update;
    expect(update.vaultBalance).toBe(create.vaultBalance);
    expect(update.vaultAvailableAssets).toBe(create.vaultAvailableAssets);
    expect(update.vaultDeployed).toBe(create.vaultDeployed);
    expect(update.escrowBalance).toBe(create.escrowBalance);
    expect(update.vaultRealizedPnL).toBe(create.vaultRealizedPnL);
    expect(update.vaultAirdropGains).toBe(create.vaultAirdropGains);
    expect(update.vaultSecondaryBought).toBe(create.vaultSecondaryBought);
    expect(update.vaultSecondarySold).toBe(create.vaultSecondarySold);
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
//
// New semantics: realized PnL = sum(payout to vault holder via Close)
//                              − sum(vault primary collateral on resolved
//                                     predictions). The Prediction record
//                              still drives cost basis; Close drives gross
//                              payouts the vault actually received.

describe('vault PnL calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmptyState();
  });

  it('credits gross settlement payout and subtracts primary collateral when vault held the winning side', async () => {
    // Vault was original counterparty with 0.7e18 collateral, held til
    // settlement, redeemed for the full pot of 1e18 (TokensRedeemed event
    // → Claim row with holder=vault, collateralPaid=1e18).
    mockPrisma.claim.findMany.mockResolvedValue([
      {
        holder: '0xvault',
        collateralPaid: '1000000000000000000',
        redeemedAt: 1700000000,
      },
    ]);
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
    expect(upsertCall.create.vaultRealizedPnL).toBe('300000000000000000');
    expect(upsertCall.create.vaultPositionsWon).toBe(1);
    expect(upsertCall.create.vaultPositionsLost).toBe(0);
  });

  it('records a loss when vault held the losing side and got zero payout', async () => {
    // Vault lost — no TokensRedeemed for vault, no Claim row.
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([])
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
    // 0 payout − 0.7e18 cost basis = −0.7e18
    expect(upsertCall.create.vaultRealizedPnL).toBe('-700000000000000000');
    expect(upsertCall.create.vaultPositionsWon).toBe(0);
    expect(upsertCall.create.vaultPositionsLost).toBe(1);
    expect(upsertCall.create.vaultCollateralLost).toBe('700000000000000000');
  });

  it('does NOT credit settlement payout for positions vault sold before close (only primary collateral remains as cost)', async () => {
    // Vault was original counterparty for 0.7e18, sold the token on
    // secondary before redemption. The buyer redeems and gets the pot — no
    // Claim row for vault. Vault keeps its primary cost basis (-0.7e18 PnL)
    // and the sale proceeds get tracked via vaultSecondarySold.
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          predictor: '0xother',
          counterparty: '0xvault',
          predictorCollateral: '300000000000000000',
          counterpartyCollateral: '700000000000000000',
          pickConfiguration: { result: 'COUNTERPARTY_WINS' },
        },
      ]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      { buyer: '0xbuyer', seller: '0xvault', price: '900000000000000000' },
    ]);

    await computeAndStoreProtocolStats(42161);

    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    // Settlement PnL: 0 payout − 0.7e18 collateral = −0.7e18
    // Net realized including sale: −0.7e18 + 0.9e18 = +0.2e18 (split across
    // the two snapshot fields).
    expect(upsertCall.create.vaultRealizedPnL).toBe('-700000000000000000');
    expect(upsertCall.create.vaultSecondarySold).toBe('900000000000000000');
    expect(upsertCall.create.vaultSecondaryBought).toBe('0');
  });

  it('credits gross payout (no cost basis) when vault bought the position on secondary', async () => {
    // Vault was not original counterparty/predictor; bought the winning
    // token on secondary for 0.6e18. Vault redeemed for 1e18 (Claim row).
    // No primary cost basis (vault wasn't on the prediction's creation
    // sides); cost sits in vaultSecondaryBought.
    mockPrisma.claim.findMany.mockResolvedValue([
      {
        holder: '0xvault',
        collateralPaid: '1000000000000000000',
        redeemedAt: 1700000000,
      },
    ]);
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([]) // fetchVaultDeployed
      .mockResolvedValueOnce([]); // calculateVaultPnL primary lookup
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      { buyer: '0xvault', seller: '0xother', price: '600000000000000000' },
    ]);

    await computeAndStoreProtocolStats(42161);

    const upsertCall = mockPrisma.protocolStatsSnapshot.upsert.mock.calls[0][0];
    expect(upsertCall.create.vaultRealizedPnL).toBe('1000000000000000000');
    expect(upsertCall.create.vaultSecondaryBought).toBe('600000000000000000');
    expect(upsertCall.create.vaultPositionsWon).toBe(1);
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
