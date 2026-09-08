import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  generateRandomNonce,
  getMarketAddress,
  createEscrowPublicClient,
  getFullPositionDetails,
} from '../escrow';

// Mock viem
const mockReadContract = vi.fn();
const mockMulticall = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: () => ({
      readContract: mockReadContract,
      multicall: mockMulticall,
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// generateRandomNonce
// ============================================================================

describe('generateRandomNonce', () => {
  test('returns a bigint', () => {
    const nonce = generateRandomNonce();
    expect(typeof nonce).toBe('bigint');
  });

  test('returns value >= 1', () => {
    for (let i = 0; i < 100; i++) {
      const nonce = generateRandomNonce();
      expect(nonce).toBeGreaterThanOrEqual(1n);
    }
  });

  test('returns value <= 2^32', () => {
    const maxValue = 2n ** 32n;
    for (let i = 0; i < 100; i++) {
      const nonce = generateRandomNonce();
      expect(nonce).toBeLessThanOrEqual(maxValue);
    }
  });

  test('produces different values (not all the same)', () => {
    const nonces = new Set<bigint>();
    for (let i = 0; i < 20; i++) {
      nonces.add(generateRandomNonce());
    }
    // With 20 random values in a 2^32 space, duplicates are essentially impossible
    expect(nonces.size).toBeGreaterThan(1);
  });
});

// ============================================================================
// getMarketAddress
// ============================================================================

describe('getMarketAddress', () => {
  test('returns address for known chainId', () => {
    const address = getMarketAddress(5064014);
    expect(address).toBeDefined();
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('returns undefined for unknown chainId', () => {
    const address = getMarketAddress(999999);
    expect(address).toBeUndefined();
  });

  test('returns different addresses for different chains', () => {
    const mainnet = getMarketAddress(5064014);
    const testnet = getMarketAddress(13374202);
    expect(mainnet).toBeDefined();
    expect(testnet).toBeDefined();
    expect(mainnet).not.toBe(testnet);
  });
});

// ============================================================================
// createEscrowPublicClient
// ============================================================================

describe('createEscrowPublicClient', () => {
  test('returns a client object', () => {
    const client = createEscrowPublicClient();
    expect(client).toBeDefined();
  });
});

// ============================================================================
// getFullPositionDetails
// ============================================================================

describe('getFullPositionDetails', () => {
  const predictionId =
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as const;
  const account = '0x1234567890abcdef1234567890abcdef12345678' as const;
  const pickConfigId =
    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as const;

  const mockPrediction = {
    predictionId,
    pickConfigId,
    predictorCollateral: 100n,
    counterpartyCollateral: 100n,
    predictor: account,
    counterparty: '0x0000000000000000000000000000000000000001',
    predictorTokensMinted: 100n,
    counterpartyTokensMinted: 100n,
    settled: false,
  };

  const mockPickConfig = {
    pickConfigId,
    totalPredictorCollateral: 100n,
    totalCounterpartyCollateral: 100n,
    claimedPredictorCollateral: 0n,
    claimedCounterpartyCollateral: 0n,
    resolved: false,
    result: 0,
  };

  const mockTokenPair = {
    predictorToken: '0xaaaa000000000000000000000000000000000001',
    counterpartyToken: '0xbbbb000000000000000000000000000000000002',
  };

  function setupMocks(overrides?: {
    pickConfigStatus?: 'success' | 'failure';
    tokenPairStatus?: 'success' | 'failure';
    canSettleStatus?: 'success' | 'failure';
    canSettleResult?: boolean;
    predictorBalanceStatus?: 'success' | 'failure';
    counterpartyBalanceStatus?: 'success' | 'failure';
  }) {
    const {
      pickConfigStatus = 'success',
      tokenPairStatus = 'success',
      canSettleStatus = 'success',
      canSettleResult = false,
      predictorBalanceStatus = 'success',
      counterpartyBalanceStatus = 'success',
    } = overrides ?? {};

    // getPrediction call
    mockReadContract.mockResolvedValue(mockPrediction);

    // First multicall: pickConfig, tokenPair, canSettle
    mockMulticall.mockResolvedValueOnce([
      {
        status: pickConfigStatus,
        result: pickConfigStatus === 'success' ? mockPickConfig : undefined,
      },
      {
        status: tokenPairStatus,
        result: tokenPairStatus === 'success' ? mockTokenPair : undefined,
      },
      {
        status: canSettleStatus,
        result: canSettleStatus === 'success' ? canSettleResult : undefined,
      },
    ]);

    // Second multicall: token balances
    mockMulticall.mockResolvedValueOnce([
      {
        status: predictorBalanceStatus,
        result: predictorBalanceStatus === 'success' ? 50n : undefined,
      },
      {
        status: counterpartyBalanceStatus,
        result: counterpartyBalanceStatus === 'success' ? 25n : undefined,
      },
    ]);
  }

  test('returns full position details on success', async () => {
    setupMocks();

    const result = await getFullPositionDetails(predictionId, account, {
      chainId: 5064014,
    });

    expect(result.prediction.predictionId).toBe(predictionId);
    expect(result.pickConfig.pickConfigId).toBe(pickConfigId);
    expect(result.tokenPair.predictorToken).toBe(mockTokenPair.predictorToken);
    expect(result.tokenPair.counterpartyToken).toBe(
      mockTokenPair.counterpartyToken
    );
    expect(result.predictorBalance).toBe(50n);
    expect(result.counterpartyBalance).toBe(25n);
    expect(result.canSettle).toBe(false);
  });

  test('returns canSettle=true when contract says so', async () => {
    setupMocks({ canSettleResult: true });

    const result = await getFullPositionDetails(predictionId, account, {
      chainId: 5064014,
    });
    expect(result.canSettle).toBe(true);
  });

  test('falls back to 0n for failed predictor balance', async () => {
    setupMocks({ predictorBalanceStatus: 'failure' });

    const result = await getFullPositionDetails(predictionId, account, {
      chainId: 5064014,
    });
    expect(result.predictorBalance).toBe(0n);
  });

  test('falls back to 0n for failed counterparty balance', async () => {
    setupMocks({ counterpartyBalanceStatus: 'failure' });

    const result = await getFullPositionDetails(predictionId, account, {
      chainId: 5064014,
    });
    expect(result.counterpartyBalance).toBe(0n);
  });

  test('falls back to false for failed canSettle', async () => {
    setupMocks({ canSettleStatus: 'failure' });

    const result = await getFullPositionDetails(predictionId, account, {
      chainId: 5064014,
    });
    expect(result.canSettle).toBe(false);
  });

  test('throws when pickConfig multicall fails', async () => {
    setupMocks({ pickConfigStatus: 'failure' });

    await expect(
      getFullPositionDetails(predictionId, account, { chainId: 5064014 })
    ).rejects.toThrow('Failed to fetch position details');
  });

  test('throws when tokenPair multicall fails', async () => {
    setupMocks({ tokenPairStatus: 'failure' });

    await expect(
      getFullPositionDetails(predictionId, account, { chainId: 5064014 })
    ).rejects.toThrow();
  });

  test('throws for unknown chainId with no market address', async () => {
    await expect(
      getFullPositionDetails(predictionId, account, { chainId: 999999 })
    ).rejects.toThrow('No escrow market address for chain 999999');
  });
});
