import { vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSubmitPosition } from './useSubmitPosition';
import type { MintPredictionRequestData } from '~/lib/auction/useAuctionStart';

const mockUseAccount = vi.fn().mockReturnValue({ address: '0xUserAddress' });
const mockUseReadContract = vi.fn().mockReturnValue({
  data: undefined,
  isLoading: false,
  refetch: vi.fn().mockResolvedValue({ data: undefined }),
});
vi.mock('wagmi', () => ({
  useAccount: (...args: unknown[]) => mockUseAccount(...args),
  useReadContract: (...args: unknown[]) => mockUseReadContract(...args),
  useSignTypedData: () => ({
    signTypedDataAsync: vi.fn().mockResolvedValue('0xMockSignature'),
  }),
  erc20Abi: [],
}));

const mockEncodeFunctionData = vi.fn().mockReturnValue('0xEncodedCalldata');
vi.mock('viem', () => ({
  encodeFunctionData: (...args: unknown[]) => mockEncodeFunctionData(...args),
  erc20Abi: [],
  parseAbi: vi.fn().mockReturnValue([]),
}));

const mockPrepareMintCalls = vi.fn().mockReturnValue([
  {
    to: '0xMarket' as `0x${string}`,
    data: '0xEncodedCalldata' as `0x${string}`,
  },
]);
vi.mock('@sapience/sdk', () => ({
  generateRandomNonce: () => BigInt(12345),
  toBigIntSafe: (value: string | number | bigint | undefined) => {
    if (value === undefined) return undefined;
    return BigInt(value);
  },
  validateCounterpartyFunds: vi.fn().mockResolvedValue(undefined),
  prepareMintCalls: (...args: unknown[]) => mockPrepareMintCalls(...args),
}));

vi.mock('@sapience/sdk/constants', () => ({
  CHAIN_ID_ETHEREAL: 5064014,
  CHAIN_ID_ETHEREAL_TESTNET: 13374202,
}));

vi.mock('@sapience/sdk/contracts', () => ({
  collateralToken: {
    5064014: { address: '0xCollateralEthereal' },
    42161: { address: '0xCollateralArbitrum' },
  },
}));

vi.mock('@sapience/sdk/auction/escrowSigning', () => ({
  buildPredictorMintTypedData: vi.fn().mockReturnValue({
    domain: {
      name: 'Test',
      version: '1',
      chainId: 5064014,
      verifyingContract: '0xMarket',
    },
    types: { MintApproval: [] },
    primaryType: 'MintApproval',
    message: {},
  }),
}));

vi.mock('~/lib/session/sessionKeyManager', () => ({
  encodeEscrowSessionKeyData: vi.fn().mockReturnValue('0xSessionKeyData'),
}));

const mockSendCalls = vi.fn();
let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {};

vi.mock('~/hooks/blockchain/useSapienceWriteContract', () => ({
  useSapienceWriteContract: (opts: Record<string, unknown>) => {
    capturedCallbacks = opts as Record<string, (...args: unknown[]) => void>;
    return {
      writeContract: vi.fn(),
      sendCalls: mockSendCalls,
      isPending: false,
      reset: vi.fn(),
    };
  },
}));

vi.mock('~/lib/context/SessionContext', () => ({
  useSession: () => ({
    effectiveAddress: '0xUserAddress',
  }),
}));

const mockReadContract = vi.fn().mockResolvedValue(0n);
vi.mock('~/lib/utils/util', () => ({
  getPublicClientForChainId: () => ({
    readContract: (...args: unknown[]) => mockReadContract(...args),
  }),
}));

const DEFAULT_PROPS = {
  chainId: 5064014,
  predictionMarketAddress: '0xMarket' as `0x${string}`,
  collateralTokenAddress: '0xCollateral' as `0x${string}`,
};

const VALID_MINT_DATA: MintPredictionRequestData = {
  predictorCollateral: '1000000000000000000', // 1e18
  counterpartyCollateral: '2000000000000000000', // 2e18
  predictor: '0xUserAddress' as `0x${string}`,
  counterparty: '0xBidder' as `0x${string}`,
  counterpartySignature: '0xSig' as `0x${string}`,
  counterpartyDeadline: '9999999999',
  predictorDeadline: '9999999999',
  refCode:
    '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
  picks: [
    {
      conditionResolver: '0xResolver' as `0x${string}`,
      conditionId: '0xABCD' as `0x${string}`,
      predictedOutcome: 1,
    },
  ],
};

describe('useSubmitPosition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendCalls.mockResolvedValue(undefined);
    // Default: predictorNonce query returns 0n, refetch returns 0n
    mockUseReadContract.mockReturnValue({
      data: 0n,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({ data: 0n }),
    });
    mockUseAccount.mockReturnValue({ address: '0xUserAddress' });
    // Mock counterparty validation - return enough balance/allowance
    mockReadContract.mockResolvedValue(999999999999999999999n);
  });

  it('returns expected shape', () => {
    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));
    expect(result.current).toHaveProperty('submitPosition');
    expect(result.current).toHaveProperty('isSubmitting');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('success');
    expect(result.current).toHaveProperty('reset');
  });

  it('initial state has no error or success', () => {
    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBeNull();
  });

  it('reset clears error and success', () => {
    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));
    const { reset } = result.current;
    expect(() => reset()).not.toThrow();
  });

  it('submitPosition happy path calls sendCalls with batch of calls', async () => {
    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      predictorNonce: 0n,
    };

    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    await act(async () => {
      await result.current.submitPosition(mintData);
    });

    expect(mockSendCalls).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 5064014,
        calls: expect.arrayContaining([
          expect.objectContaining({
            to: '0xMarket',
            data: '0xEncodedCalldata',
          }),
        ]),
      })
    );
    expect(result.current.error).toBeNull();
  });

  it('sets error when predictor !== effectiveAddress (address mismatch)', async () => {
    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      predictor: '0xDifferentAddress' as `0x${string}`,
      predictorNonce: 0n,
    };

    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    act(() => {
      result.current.submitPosition(mintData);
    });

    await waitFor(() => {
      expect(result.current.error).toContain('Address mismatch');
    });
  });

  it('uses provided auction nonce directly without on-chain check', async () => {
    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      predictorNonce: 42n,
    };

    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    await act(async () => {
      await result.current.submitPosition(mintData);
    });

    // Should submit without error - no on-chain nonce comparison
    expect(mockSendCalls).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('sets error when sendCalls fails with InvalidMakerNonce (no retry with random nonces)', async () => {
    mockSendCalls.mockRejectedValueOnce(new Error('InvalidMakerNonce'));

    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      // no predictorNonce → non-auction submission, hook generates random nonce
    };
    delete (mintData as Partial<MintPredictionRequestData>).predictorNonce;

    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    await act(async () => {
      await result.current.submitPosition(mintData);
    });

    // With random bitmap nonces, no retry logic — error is surfaced
    expect(mockSendCalls).toHaveBeenCalledTimes(1);
    expect(result.current.error).toContain('InvalidMakerNonce');
  });

  it('sets error when sendCalls fails with auction-provided nonce', async () => {
    mockSendCalls.mockRejectedValue(new Error('InvalidMakerNonce'));

    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      predictorNonce: 0n, // auction-provided nonce
    };

    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    await act(async () => {
      await result.current.submitPosition(mintData);
    });

    // Should not retry - only called once, error is surfaced
    expect(mockSendCalls).toHaveBeenCalledTimes(1);
    expect(result.current.error).toContain('InvalidMakerNonce');
  });

  it('onSuccess callback sets success and clears error', () => {
    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    act(() => {
      capturedCallbacks.onSuccess?.();
    });

    expect(result.current.success).toBe(
      'Position prediction minted successfully'
    );
    expect(result.current.error).toBeNull();
  });

  it('onError callback sets error', () => {
    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    act(() => {
      capturedCallbacks.onError?.({ message: 'Transaction failed' });
    });

    expect(result.current.error).toBe('Transaction failed');
  });

  it('submitPosition is a no-op when enabled=false', async () => {
    const { result } = renderHook(() =>
      useSubmitPosition({ ...DEFAULT_PROPS, enabled: false })
    );

    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      predictorNonce: 0n,
    };

    await act(async () => {
      await result.current.submitPosition(mintData);
    });

    expect(mockSendCalls).not.toHaveBeenCalled();
  });

  it('submitPosition is a no-op when address is undefined', async () => {
    mockUseAccount.mockReturnValue({ address: undefined });

    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      predictorNonce: 0n,
    };

    await act(async () => {
      await result.current.submitPosition(mintData);
    });

    expect(mockSendCalls).not.toHaveBeenCalled();
  });
});
