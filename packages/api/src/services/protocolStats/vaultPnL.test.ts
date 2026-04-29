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

import {
  calculateVaultSecondaryFlows,
  calculateVaultAirdrops,
} from './vaultPnL';

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
