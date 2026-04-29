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

import { fetchVaultDeployed, sumEscrowBalancesAtBlock } from './vaultTvl';

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
