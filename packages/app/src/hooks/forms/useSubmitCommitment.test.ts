import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSubmitCommitment } from './useSubmitCommitment';

// ============================================================================
// Mocks
// ============================================================================

const mockUseAccount = vi.fn().mockReturnValue({ address: '0xUserAddress' });
const mockUseReadContract = vi.fn().mockReturnValue({
  data: undefined,
  isLoading: false,
  refetch: vi.fn().mockResolvedValue({ data: undefined }),
});
const mockSignTypedDataAsync = vi.fn().mockResolvedValue('0xMockSignature');
vi.mock('wagmi', () => ({
  useAccount: (...args: unknown[]) => mockUseAccount(...args),
  useReadContract: (...args: unknown[]) => mockUseReadContract(...args),
  useSignTypedData: () => ({
    signTypedDataAsync: mockSignTypedDataAsync,
  }),
  erc20Abi: [],
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...(actual as object),
    encodeFunctionData: vi.fn().mockReturnValue('0xEncodedCalldata'),
    parseAbi: vi.fn().mockReturnValue([]),
  };
});

vi.mock('@sapience/sdk', () => ({
  generateRandomNonce: () => BigInt(12345),
}));

vi.mock('@sapience/sdk/auction/escrowEncoding', () => ({
  computePickConfigId: vi.fn().mockReturnValue('0xPickConfigId'),
  canonicalizePicks: (picks: unknown[]) => picks,
}));

const mockBuildCommitmentTypedData = vi.fn().mockReturnValue({
  domain: {
    name: 'SapienceCommittedIntent',
    version: '1',
    chainId: 5064014,
    verifyingContract: '0xExecutor',
  },
  types: { Commitment: [] },
  primaryType: 'Commitment',
  message: {},
});
const mockEncodeCommitCalldata = vi.fn().mockReturnValue('0xCommitCalldata');
vi.mock('@sapience/sdk/auction/committedIntentSigning', () => ({
  buildCommitmentTypedData: (...args: unknown[]) =>
    mockBuildCommitmentTypedData(...args),
  encodeCommitCalldata: (...args: unknown[]) =>
    mockEncodeCommitCalldata(...args),
  encodeExecuteCalldata: vi.fn().mockReturnValue('0xExecuteCalldata'),
  pickBestPriceFirst: (q: unknown[]) => q,
}));

const mockComputeCommitmentHash = vi.fn().mockReturnValue('0xCommitmentHash');
vi.mock('@sapience/sdk/auction/committedIntentEncoding', () => ({
  computeCommitmentHash: (...args: unknown[]) =>
    mockComputeCommitmentHash(...args),
}));

vi.mock('@sapience/sdk/types/committedIntent', () => ({
  commitmentToJson: (c: unknown) => c,
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
    signTypedData: undefined,
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

const mockSubmitCommitment = vi
  .fn()
  .mockResolvedValue({ commitmentHash: '0xCommitmentHash' });
const mockSubscribeToCommitment = vi.fn();
const mockOnQuote = vi.fn();
const mockClose = vi.fn();

vi.mock('~/lib/ws/CommitmentWsClient', () => ({
  CommitmentWsClient: vi.fn().mockImplementation(() => ({
    submitCommitment: mockSubmitCommitment,
    subscribeToCommitment: mockSubscribeToCommitment,
    onQuote: mockOnQuote,
    onExecuted: vi.fn(),
    onExpired: vi.fn(),
    onSlashed: vi.fn(),
    close: mockClose,
  })),
}));

vi.mock('~/lib/ws/signalUrl', () => ({
  getSignalUrl: () => 'ws://localhost:3001/signal',
}));

// ============================================================================
// Tests
// ============================================================================

const DEFAULT_PARAMS = {
  picks: [
    {
      conditionResolver: '0xResolver' as `0x${string}`,
      conditionId: '0xABCD' as `0x${string}`,
      predictedOutcome: 1 as const,
    },
  ],
  amountIn: BigInt(10e18),
  minFillIn: BigInt(10e18),
  minAmountOut: BigInt(15e18),
  executorTip: BigInt(1e17),
  predictorWindowEnd: BigInt(Math.floor(Date.now() / 1000) + 30),
  deadline: BigInt(Math.floor(Date.now() / 1000) + 60),
};

describe('useSubmitCommitment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendCalls.mockResolvedValue(undefined);
    mockSubmitCommitment.mockResolvedValue({
      commitmentHash: '0xCommitmentHash',
    });
    mockUseAccount.mockReturnValue({ address: '0xUserAddress' });
  });

  it('returns expected shape', () => {
    const { result } = renderHook(() =>
      useSubmitCommitment({ chainId: 5064014 })
    );
    expect(result.current).toHaveProperty('submitCommitment');
    expect(result.current).toHaveProperty('isSubmitting');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('commitmentHash');
    expect(result.current).toHaveProperty('reset');
  });

  it('initial state has no error', () => {
    const { result } = renderHook(() =>
      useSubmitCommitment({ chainId: 5064014 })
    );
    expect(result.current.error).toBeNull();
    expect(result.current.commitmentHash).toBeNull();
  });

  it('signs commitment and calls executor.commit() with correct calldata', async () => {
    const { result } = renderHook(() =>
      useSubmitCommitment({ chainId: 5064014 })
    );

    await act(async () => {
      await result.current.submitCommitment(DEFAULT_PARAMS);
    });

    // Verify signTypedDataAsync was called
    expect(mockSignTypedDataAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryType: 'Commitment',
      })
    );

    // Verify encodeCommitCalldata was called with commitment + signature
    expect(mockEncodeCommitCalldata).toHaveBeenCalled();

    // Verify sendCalls was called with the commit calldata
    expect(mockSendCalls).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 5064014,
        calls: expect.arrayContaining([
          expect.objectContaining({
            to: '0xExecutor',
            data: '0xCommitCalldata',
          }),
        ]),
      })
    );
  });

  it('submits to relayer after on-chain commit', async () => {
    const { result } = renderHook(() =>
      useSubmitCommitment({ chainId: 5064014 })
    );

    await act(async () => {
      await result.current.submitCommitment(DEFAULT_PARAMS);
    });

    // Verify WS client was created and submitCommitment called
    expect(mockSubmitCommitment).toHaveBeenCalled();
    expect(mockSubscribeToCommitment).toHaveBeenCalledWith('0xCommitmentHash');
  });

  it('handles errors gracefully', async () => {
    mockSendCalls.mockRejectedValue(new Error('tx reverted'));

    const { result } = renderHook(() =>
      useSubmitCommitment({ chainId: 5064014 })
    );

    await act(async () => {
      const res = await result.current.submitCommitment(DEFAULT_PARAMS);
      expect(res).toBeNull();
    });

    expect(result.current.error).toBe('tx reverted');
  });

  it('reset clears error and hash', () => {
    const { result } = renderHook(() =>
      useSubmitCommitment({ chainId: 5064014 })
    );
    act(() => {
      result.current.reset();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.commitmentHash).toBeNull();
  });
});
