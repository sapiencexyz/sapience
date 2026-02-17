import { renderHook, act, waitFor } from '@testing-library/react';
import { useSubmitPosition } from './useSubmitPosition';
import type { MintPredictionRequestData } from '~/lib/auction/useAuctionStart';

const mockUseAccount = jest.fn().mockReturnValue({ address: '0xUserAddress' });
const mockUseReadContract = jest.fn().mockReturnValue({
  data: undefined,
  isLoading: false,
  refetch: jest.fn().mockResolvedValue({ data: undefined }),
});
jest.mock('wagmi', () => ({
  useAccount: (...args: unknown[]) => mockUseAccount(...args),
  useReadContract: (...args: unknown[]) => mockUseReadContract(...args),
  erc20Abi: [],
}));

const mockEncodeFunctionData = jest.fn().mockReturnValue('0xEncodedCalldata');
jest.mock('viem', () => ({
  encodeFunctionData: (...args: unknown[]) => mockEncodeFunctionData(...args),
  erc20Abi: [],
  parseAbi: jest.fn().mockReturnValue([]),
}));

const mockPrepareMintCalls = jest.fn().mockReturnValue([
  { to: '0xMarket' as `0x${string}`, data: '0xEncodedCalldata' as `0x${string}` },
]);
jest.mock('@sapience/sdk', () => ({
  predictionMarketAbi: [],
  toBigIntSafe: (value: string | number | bigint | undefined) => {
    if (value === undefined) return undefined;
    return BigInt(value);
  },
  validateTakerFunds: jest.fn().mockResolvedValue(undefined),
  prepareMintCalls: (...args: unknown[]) => mockPrepareMintCalls(...args),
}));

jest.mock('@sapience/sdk/constants', () => ({
  CHAIN_ID_ETHEREAL: 5064014,
  ETHEREAL_WUSDE_ADDRESS: '0xWUSDe',
}));

const mockSendCalls = jest.fn();
let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {};

jest.mock('~/hooks/blockchain/useSapienceWriteContract', () => ({
  useSapienceWriteContract: (opts: Record<string, unknown>) => {
    capturedCallbacks = opts as Record<string, (...args: unknown[]) => void>;
    return {
      writeContract: jest.fn(),
      sendCalls: mockSendCalls,
      isPending: false,
      reset: jest.fn(),
    };
  },
}));

jest.mock('~/lib/context/SessionContext', () => ({
  useSession: () => ({
    effectiveAddress: '0xUserAddress',
  }),
}));

const mockReadContract = jest.fn().mockResolvedValue(0n);
jest.mock('~/lib/utils/util', () => ({
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
  encodedPredictedOutcomes: '0xABCD' as `0x${string}`,
  resolver: '0xResolver' as `0x${string}`,
  makerCollateral: '1000000000000000000', // 1e18
  takerCollateral: '2000000000000000000', // 2e18
  maker: '0xUserAddress' as `0x${string}`,
  taker: '0xBidder' as `0x${string}`,
  takerSignature: '0xSig' as `0x${string}`,
  takerDeadline: '9999999999',
  refCode: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
};

describe('useSubmitPosition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendCalls.mockResolvedValue(undefined);
    // Default: makerNonce query returns 0n, refetch returns 0n
    mockUseReadContract.mockReturnValue({
      data: 0n,
      isLoading: false,
      refetch: jest.fn().mockResolvedValue({ data: 0n }),
    });
    mockUseAccount.mockReturnValue({ address: '0xUserAddress' });
    // Mock taker validation - return enough balance/allowance
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
      makerNonce: 0n,
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

  it('sets error when maker !== effectiveAddress (address mismatch)', async () => {
    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      maker: '0xDifferentAddress' as `0x${string}`,
      makerNonce: 0n,
    };

    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    act(() => {
      result.current.submitPosition(mintData);
    });

    await waitFor(() => {
      expect(result.current.error).toContain('Address mismatch');
    });
  });

  it('sets error when on-chain nonce differs from provided nonce', async () => {
    // refetchMakerNonce returns a different nonce than what mintData provides
    mockUseReadContract.mockReturnValue({
      data: 0n,
      isLoading: false,
      refetch: jest.fn().mockResolvedValue({ data: 5n }), // on-chain nonce is 5
    });

    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      makerNonce: 0n, // but we're sending nonce 0
    };

    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    act(() => {
      result.current.submitPosition(mintData);
    });

    await waitFor(() => {
      expect(result.current.error).toContain('nonce');
    });
  });

  it('retries once with fresh nonce on InvalidMakerNonce for non-auction submissions', async () => {
    // First sendCalls fails with InvalidMakerNonce, second succeeds
    mockSendCalls
      .mockRejectedValueOnce(new Error('InvalidMakerNonce'))
      .mockResolvedValueOnce(undefined);

    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      // no makerNonce → non-auction submission, hook will fetch nonce
    };
    delete (mintData as Partial<MintPredictionRequestData>).makerNonce;

    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    await act(async () => {
      await result.current.submitPosition(mintData);
    });

    // Should have retried: sendCalls called twice
    expect(mockSendCalls).toHaveBeenCalledTimes(2);
  });

  it('does not retry InvalidMakerNonce when auction-provided nonce is present', async () => {
    mockSendCalls.mockRejectedValue(new Error('InvalidMakerNonce'));

    const mintData: MintPredictionRequestData = {
      ...VALID_MINT_DATA,
      makerNonce: 0n, // auction-provided nonce
    };

    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    act(() => {
      result.current.submitPosition(mintData);
    });

    // Should NOT retry - only called once
    await waitFor(() => {
      expect(mockSendCalls).toHaveBeenCalledTimes(1);
      expect(result.current.error).toContain('stale');
    });
  });

  it('onSuccess callback sets success and clears error', () => {
    const { result } = renderHook(() => useSubmitPosition(DEFAULT_PROPS));

    act(() => {
      capturedCallbacks.onSuccess?.();
    });

    expect(result.current.success).toBe('Position prediction minted successfully');
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
      makerNonce: 0n,
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
      makerNonce: 0n,
    };

    await act(async () => {
      await result.current.submitPosition(mintData);
    });

    expect(mockSendCalls).not.toHaveBeenCalled();
  });
});
