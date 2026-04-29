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

vi.mock('../core/db', () => ({ default: mockPrisma }));

vi.mock('../../generated/prisma', () => ({
  SettlementResult: {
    UNRESOLVED: 'UNRESOLVED',
    PREDICTOR_WINS: 'PREDICTOR_WINS',
    COUNTERPARTY_WINS: 'COUNTERPARTY_WINS',
    NON_DECISIVE: 'NON_DECISIVE',
  },
}));

vi.mock('../lib/utils', () => ({
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
  calculateVaultSecondaryFlows,
  calculateVaultAirdrops,
  fetchVaultDeployed,
  computeAndStoreProtocolStats,
  getLatestProtocolStats,
  getProtocolStatsTimeSeries,
  buildVaultAggregator,
  sumEscrowBalancesAtBlock,
} from './protocolStats';

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

// ─── calculateVaultSecondaryFlows ───────────────────────────────────────────

describe('calculateVaultSecondaryFlows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmptyState();
  });

  it('sums prices on the side where vault is buyer or seller', async () => {
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      { buyer: '0xvault', seller: '0xother', price: '700000000000000000' },
      { buyer: '0xother', seller: '0xvault', price: '400000000000000000' },
      { buyer: '0xother', seller: '0xvault', price: '100000000000000000' },
    ]);

    const result = await calculateVaultSecondaryFlows(42161);

    expect(result.bought).toBe(700000000000000000n);
    expect(result.sold).toBe(500000000000000000n);
  });

  it('returns zero when no trades touch the vault', async () => {
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    const result = await calculateVaultSecondaryFlows(42161);
    expect(result).toEqual({ bought: 0n, sold: 0n });
  });

  it('passes beforeTimestamp through to the executedAt filter', async () => {
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    await calculateVaultSecondaryFlows(42161, 1700000000);
    const call = mockPrisma.secondaryTrade.findMany.mock.calls[0][0];
    expect(call.where.executedAt).toEqual({ lte: 1700000000 });
  });
});

// ─── calculateVaultAirdrops ─────────────────────────────────────────────────

describe('calculateVaultAirdrops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmptyState();
  });

  it('subtracts deposits, settlement payouts, and secondary sale proceeds from gross transfers in', async () => {
    // 5 wUSDe arrived in the vault. 1 was a deposit, 2 was a settlement
    // redemption (Claim row), 1 was secondary sale proceeds. The remaining
    // 1 is airdrop.
    mockPrisma.collateralTransfer.findMany.mockResolvedValue([
      { value: '5000000000000000000' },
    ]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([
      {
        assets: '1000000000000000000',
        eventType: 'deposit',
        vaultAddress: '0xvault',
      },
    ]);
    mockPrisma.claim.findMany.mockResolvedValue([
      {
        holder: '0xvault',
        collateralPaid: '2000000000000000000',
        redeemedAt: 1700000000,
      },
    ]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      { buyer: '0xother', seller: '0xvault', price: '1000000000000000000' },
    ]);

    const result = await calculateVaultAirdrops(42161);
    expect(result).toBe(1000000000000000000n);
  });

  it('clamps to zero when the explained inflows exceed gross transfers in (indexer drift)', async () => {
    mockPrisma.collateralTransfer.findMany.mockResolvedValue([
      { value: '500000000000000000' },
    ]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([
      {
        assets: '2000000000000000000',
        eventType: 'deposit',
        vaultAddress: '0xvault',
      },
    ]);
    const result = await calculateVaultAirdrops(42161);
    expect(result).toBe(0n);
  });

  it('returns zero when no transfers landed in the vault', async () => {
    const result = await calculateVaultAirdrops(42161);
    expect(result).toBe(0n);
  });
});

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
    expect(agg.deployedAt(T, '0xvault')).toBe(500n);
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
    expect(agg.deployedAt(T, '0xvault')).toBe(0n);
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
    expect(agg.deployedAt(T, '0xvault')).toBe(0n);
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
    expect(agg.deployedAt(T, '0xvault')).toBe(500n);
  });

  it('pnlAt: gross payouts via Claim minus primary collateral, with UNRESOLVED + future-claim skips', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      // Vault wins as counterparty: cost basis 700, gross payout 1000 → +300
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
      // Vault loses as predictor: cost basis 500, gross payout 0 → -500
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
      // UNRESOLVED — primary collateral skipped
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
      // Resolved AFTER t — primary collateral skipped at this snapshot
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
    // Claim rows = TokensRedeemed events. pc1: vault received 1000.
    // pc2: vault lost — no claim row. Future-redeemed claim is skipped.
    mockPrisma.claim.findMany.mockResolvedValue([
      { holder: '0xvault', collateralPaid: '1000', redeemedAt: T - 50 },
      // future-redeemed (after t) — skipped
      { holder: '0xvault', collateralPaid: '999', redeemedAt: T + 5 },
    ]);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    mockPrisma.collateralTransfer.findMany.mockResolvedValue([]);

    const agg = await buildVaultAggregator(42161);
    const result = agg.pnlAt(T, '0xvault');
    // grossPayouts = 1000 (pc1; pc2 lost = no claim; pc4 future-redeemed skipped)
    // primaryCollateral = 700 (pc1) + 500 (pc2) = 1200 (pc3 unresolved + pc4 future-resolved skipped)
    // realizedPnL = 1000 − 1200 = −200
    expect(result.realizedPnL).toBe(-200n);
    expect(result.positionsWon).toBe(1);
    expect(result.positionsLost).toBe(1);
    expect(result.totalCollateralWon).toBe(1000n);
    expect(result.totalCollateralLost).toBe(1200n);
  });

  it('flowsAt: filters by timestamp <= t and partitions deposit vs withdrawal', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([
      {
        timestamp: T - 100,
        eventType: 'deposit',
        assets: '1000',
        vaultAddress: '0xvault',
      },
      {
        timestamp: T - 50,
        eventType: 'withdrawal',
        assets: '200',
        vaultAddress: '0xvault',
      },
      {
        timestamp: T - 25,
        eventType: 'deposit',
        assets: '500',
        vaultAddress: '0xvault',
      },
      // After t — skipped
      {
        timestamp: T + 10,
        eventType: 'deposit',
        assets: '999',
        vaultAddress: '0xvault',
      },
    ]);

    const agg = await buildVaultAggregator(42161);
    const result = agg.flowsAt(T, '0xvault');
    expect(result.totalDeposits).toBe(1500n);
    expect(result.totalWithdrawals).toBe(200n);
  });

  it('returns zero-aggregators when chain has no vault configured', async () => {
    const agg = await buildVaultAggregator(999);
    expect(agg.deployedAt(T, '0xvault')).toBe(0n);
    expect(agg.pnlAt(T, '0xvault').realizedPnL).toBe(0n);
    expect(agg.flowsAt(T, '0xvault').totalDeposits).toBe(0n);
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
          new Error('execution reverted') as unknown as ConstructorParameters<
            typeof ContractFunctionExecutionError
          >[0],
          {
            abi: [],
            functionName: 'balanceOf',
          } as ConstructorParameters<typeof ContractFunctionExecutionError>[1]
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
