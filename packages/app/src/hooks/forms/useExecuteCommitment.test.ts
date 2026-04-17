import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExecuteCommitment } from './useExecuteCommitment';
import type { QuoteBroadcast } from '@sapience/sdk/relayer/committedIntentMessages';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0xUserAddress' }),
  useReadContract: vi.fn().mockReturnValue({
    data: undefined,
    isLoading: false,
    refetch: vi.fn().mockResolvedValue({ data: undefined }),
  }),
  useSignTypedData: () => ({
    signTypedDataAsync: vi.fn(),
  }),
  erc20Abi: [],
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...(actual as object),
    encodeFunctionData: vi.fn().mockReturnValue('0xExecuteCalldata'),
    parseAbi: vi.fn().mockReturnValue([]),
  };
});

const mockPickBestPriceFirst = vi.fn((quotes: unknown[]) => quotes);
const mockEncodeExecuteCalldata = vi.fn().mockReturnValue('0xExecuteCalldata');
vi.mock('@sapience/sdk/auction/committedIntentSigning', () => ({
  encodeExecuteCalldata: (...args: unknown[]) =>
    mockEncodeExecuteCalldata(...args),
  pickBestPriceFirst: (...args: unknown[]) => mockPickBestPriceFirst(...args),
}));

vi.mock('@sapience/sdk/types/committedIntent', () => ({
  quoteFromJson: (q: Record<string, string>) => ({
    counterparty: q.counterparty as `0x${string}`,
    deadline: BigInt(q.deadline || '0'),
    commitmentHash: q.commitmentHash as `0x${string}`,
    maxIn: BigInt(q.maxIn || '0'),
    amountOut: BigInt(q.amountOut || '0'),
    nonce: BigInt(q.nonce || '0'),
  }),
}));

vi.mock('@sapience/sdk/constants', () => ({
  CHAIN_ID_ETHEREAL: 5064014,
  CHAIN_ID_ETHEREAL_TESTNET: 13374202,
}));

vi.mock('~/lib/constants/featureFlags', () => ({
  COMMITTED_INTENT_ENABLED: true,
  COMMITTED_INTENT_EXECUTOR_ADDRESS: '0xExecutor',
}));

vi.mock('~/lib/context/SessionContext', () => ({
  useSession: () => ({
    effectiveAddress: '0xUserAddress',
    isUsingSession: false,
  }),
}));

const mockSendCalls = vi.fn().mockResolvedValue(undefined);
vi.mock('~/hooks/blockchain/useSapienceWriteContract', () => ({
  useSapienceWriteContract: () => ({
    sendCalls: mockSendCalls,
    isPending: false,
    reset: vi.fn(),
  }),
}));

// ============================================================================
// Test data
// ============================================================================

const COMMITMENT = {
  predictor: '0xUserAddress' as `0x${string}`,
  predictorWindowEnd: BigInt(9999999999),
  deadline: BigInt(9999999999),
  pickConfigId:
    '0x1111111111111111111111111111111111111111111111111111111111111111' as `0x${string}`,
  amountIn: BigInt(10e18),
  minFillIn: BigInt(10e18),
  minAmountOut: BigInt(15e18),
  executorTip: BigInt(1e17),
  nonce: BigInt(42),
};

const PREDICTOR_SIG = '0xPredictorSig' as `0x${string}`;

const PICKS = [
  {
    conditionResolver: '0xResolver' as `0x${string}`,
    conditionId: '0xABCD' as `0x${string}`,
    predictedOutcome: 1 as const,
  },
];

function makeQuoteBroadcast(
  counterparty: string,
  maxIn: string,
  amountOut: string,
  nonce: string
): QuoteBroadcast {
  return {
    quote: {
      counterparty,
      deadline: '9999999999',
      commitmentHash: '0xCommitmentHash',
      maxIn,
      amountOut,
      nonce,
    },
    signature: `0xSig_${counterparty}`,
    receivedAt: new Date().toISOString(),
    quoteHash: `0xQuoteHash_${counterparty}_${nonce}`,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('useExecuteCommitment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendCalls.mockResolvedValue(undefined);
    // Reset pickBestPriceFirst to identity (already sorted)
    mockPickBestPriceFirst.mockImplementation((q: unknown[]) => q);
  });

  it('returns expected shape', () => {
    const { result } = renderHook(() =>
      useExecuteCommitment({
        chainId: 5064014,
        commitment: COMMITMENT,
        predictorSignature: PREDICTOR_SIG,
        picks: PICKS,
      })
    );
    expect(result.current).toHaveProperty('executeCommitment');
    expect(result.current).toHaveProperty('isExecuting');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('reset');
  });

  it('sorts quotes best-price-first before building calldata', async () => {
    // Quote A: worse price (100 in / 150 out = 1.5x)
    // Quote B: better price (100 in / 200 out = 2.0x)
    const quoteA = makeQuoteBroadcast(
      '0xCounterpartyA',
      '100000000000000000000',
      '150000000000000000000',
      '1'
    );
    const quoteB = makeQuoteBroadcast(
      '0xCounterpartyB',
      '100000000000000000000',
      '200000000000000000000',
      '2'
    );

    const { result } = renderHook(() =>
      useExecuteCommitment({
        chainId: 5064014,
        commitment: COMMITMENT,
        predictorSignature: PREDICTOR_SIG,
        picks: PICKS,
      })
    );

    await act(async () => {
      await result.current.executeCommitment([quoteA, quoteB]);
    });

    // pickBestPriceFirst should have been called
    expect(mockPickBestPriceFirst).toHaveBeenCalled();

    // encodeExecuteCalldata should have been called
    expect(mockEncodeExecuteCalldata).toHaveBeenCalledWith(
      expect.objectContaining({
        c: COMMITMENT,
        predictorSig: PREDICTOR_SIG,
        picks: PICKS,
      })
    );

    // sendCalls should have been called with the executor address
    expect(mockSendCalls).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 5064014,
        calls: expect.arrayContaining([
          expect.objectContaining({
            to: '0xExecutor',
          }),
        ]),
      })
    );
  });

  it('builds correct execute calldata with sorted quotes', async () => {
    const quote = makeQuoteBroadcast(
      '0xCounterparty',
      '100000000000000000000',
      '200000000000000000000',
      '7'
    );

    const { result } = renderHook(() =>
      useExecuteCommitment({
        chainId: 5064014,
        commitment: COMMITMENT,
        predictorSignature: PREDICTOR_SIG,
        picks: PICKS,
      })
    );

    await act(async () => {
      const ok = await result.current.executeCommitment([quote]);
      expect(ok).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });

  it('handles tx revert', async () => {
    mockSendCalls.mockRejectedValue(new Error('execution reverted'));

    const quote = makeQuoteBroadcast(
      '0xCounterparty',
      '100000000000000000000',
      '200000000000000000000',
      '7'
    );

    const onError = vi.fn();
    const { result } = renderHook(() =>
      useExecuteCommitment({
        chainId: 5064014,
        commitment: COMMITMENT,
        predictorSignature: PREDICTOR_SIG,
        picks: PICKS,
        onError,
      })
    );

    await act(async () => {
      const ok = await result.current.executeCommitment([quote]);
      expect(ok).toBe(false);
    });

    expect(result.current.error).toBe('execution reverted');
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'execution reverted' })
    );
  });

  it('returns false when no quotes are provided', async () => {
    const { result } = renderHook(() =>
      useExecuteCommitment({
        chainId: 5064014,
        commitment: COMMITMENT,
        predictorSignature: PREDICTOR_SIG,
        picks: PICKS,
      })
    );

    await act(async () => {
      const ok = await result.current.executeCommitment([]);
      expect(ok).toBe(false);
    });
  });
});
