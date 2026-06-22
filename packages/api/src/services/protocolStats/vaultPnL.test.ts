import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const { mockPrisma, mockReadContract } = vi.hoisted(() => {
  const mockReadContract = vi.fn().mockResolvedValue(1000000000000000000n);
  const mockPrisma = {
    prediction: { findMany: vi.fn() },
    vaultFlowEvent: { findMany: vi.fn() },
    close: { findMany: vi.fn() },
    secondaryTrade: { findMany: vi.fn() },
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
  computeAirdropResidual,
} from './vaultPnL';

// Helper for the default "no settlement, no flow, no trades, no transfers" baseline.
function resetEmptyState() {
  mockPrisma.prediction.findMany.mockResolvedValue([]);
  mockPrisma.vaultFlowEvent.findMany.mockResolvedValue([]);
  mockPrisma.close.findMany.mockResolvedValue([]);
  mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
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

// ─── computeAirdropResidual ─────────────────────────────────────────────────

describe('computeAirdropResidual', () => {
  // airdrop = (balance + deployed) − (deposits − withdrawals)
  //           − realizedPnL − secondarySold + secondaryBought
  const base = {
    vaultBalance: 0n,
    vaultDeployed: 0n,
    totalDeposits: 0n,
    totalWithdrawals: 0n,
    realizedPnL: 0n,
    secondarySold: 0n,
    secondaryBought: 0n,
  };

  it('is the unexplained portion of AUM (a real direct donation)', () => {
    // AUM 35, deposits 30, pnl 4 → 1 of AUM is unexplained (donated in).
    expect(
      computeAirdropResidual({
        ...base,
        vaultBalance: 33n,
        vaultDeployed: 2n,
        totalDeposits: 30n,
        realizedPnL: 4n,
      })
    ).toBe(1n);
  });

  it('is ~zero when deposits + PnL fully explain AUM (the prod single-LP vault)', () => {
    // The real Ethereal vault: AUM = deposits + pnl, nothing donated.
    expect(
      computeAirdropResidual({
        ...base,
        vaultBalance: 35365n,
        totalDeposits: 33493n,
        realizedPnL: 1872n,
      })
    ).toBe(0n);
  });

  it('clamps to zero when AUM is over-explained (indexer drift)', () => {
    expect(
      computeAirdropResidual({
        ...base,
        vaultBalance: 10n,
        totalDeposits: 20n,
      })
    ).toBe(0n);
  });

  it('credits net secondary flow back into the explained side', () => {
    // Bought 3 of secondary tokens, sold 1; net 2 spent that is not in
    // balance/deployed, so it must not inflate the airdrop residual.
    expect(
      computeAirdropResidual({
        ...base,
        vaultBalance: 8n,
        totalDeposits: 10n,
        secondaryBought: 3n,
        secondarySold: 1n,
      })
    ).toBe(0n);
  });
});
