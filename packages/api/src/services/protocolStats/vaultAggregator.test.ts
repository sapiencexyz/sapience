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

import { buildVaultAggregator } from './vaultAggregator';

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
