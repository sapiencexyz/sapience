import { renderHook, act } from '@testing-library/react';
import { useSubmitPrediction } from './useSubmitPrediction';

const mockUseAccount = jest.fn().mockReturnValue({ address: '0xUserAddress' });
jest.mock('wagmi', () => ({
  useAccount: (...args: unknown[]) => mockUseAccount(...args),
}));

// Mock viem to avoid jsdom issues with encoding
const mockEncodeAbiParameters = jest.fn().mockReturnValue('0xEncodedData');
const mockParseAbiParameters = jest.fn().mockReturnValue([]);
jest.mock('viem', () => ({
  encodeAbiParameters: (...args: unknown[]) => mockEncodeAbiParameters(...args),
  parseAbiParameters: (...args: unknown[]) => mockParseAbiParameters(...args),
}));

const mockWriteContract = jest.fn();
const mockReset = jest.fn();
let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {};

jest.mock('~/hooks/blockchain/useSapienceWriteContract', () => ({
  useSapienceWriteContract: (opts: Record<string, unknown>) => {
    capturedCallbacks = opts as Record<string, (...args: unknown[]) => void>;
    return {
      writeContract: mockWriteContract,
      isPending: false,
      reset: mockReset,
    };
  },
}));

jest.mock('~/hooks/contract/EAS', () => ({
  getEASContractAddress: () => '0xEASContract',
  EAS_ATTEST_ABI: [{ name: 'attest', type: 'function' }],
}));

jest.mock('~/lib/constants', () => ({
  SCHEMA_UID: '0xSchemaUID',
}));

const DEFAULT_PROPS = {
  submissionValue: '75',
  comment: 'test comment',
  resolver: '0xResolver' as `0x${string}`,
  condition: '0xCondition' as `0x${string}`,
};

describe('useSubmitPrediction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteContract.mockResolvedValue(undefined);
    mockUseAccount.mockReturnValue({ address: '0xUserAddress' });
  });

  it('calls writeContract with EAS attestation params on submit', async () => {
    const { result } = renderHook(() => useSubmitPrediction(DEFAULT_PROPS));

    await act(async () => {
      await result.current.submitPrediction();
    });

    // If encoding failed, attestationError would be set
    expect(result.current.attestationError).toBeNull();
    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 42161,
        address: '0xEASContract',
        functionName: 'attest',
      })
    );
  });

  it('sets error when wallet not connected', async () => {
    mockUseAccount.mockReturnValue({ address: undefined });

    const { result } = renderHook(() => useSubmitPrediction(DEFAULT_PROPS));

    await act(async () => {
      await result.current.submitPrediction();
    });

    expect(result.current.attestationError).toContain('Wallet not connected');
  });

  it('onSuccess callback sets attestationSuccess and calls external onSuccess', () => {
    const onSuccess = jest.fn();
    const { result } = renderHook(() =>
      useSubmitPrediction({ ...DEFAULT_PROPS, onSuccess })
    );

    act(() => {
      capturedCallbacks.onSuccess?.();
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.attestationSuccess).toContain(
      'Prediction submitted successfully'
    );
  });

  it('onError callback sets attestationError', () => {
    const { result } = renderHook(() => useSubmitPrediction(DEFAULT_PROPS));

    act(() => {
      capturedCallbacks.onError?.({ message: 'tx failed' });
    });

    expect(result.current.attestationError).toBe('tx failed');
  });

  it('encodes prediction value as D18 bigint', async () => {
    const { result } = renderHook(() =>
      useSubmitPrediction({
        ...DEFAULT_PROPS,
        submissionValue: '42.5',
      })
    );

    await act(async () => {
      await result.current.submitPrediction();
    });

    expect(result.current.attestationError).toBeNull();
    expect(mockEncodeAbiParameters).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        '0xResolver',
        '0xCondition',
        BigInt(Math.round(42.5 * 1e18)),
        'test comment',
      ])
    );
  });

  it('resetAttestationStatus clears error and success', async () => {
    mockUseAccount.mockReturnValue({ address: undefined });

    const { result } = renderHook(() => useSubmitPrediction(DEFAULT_PROPS));

    await act(async () => {
      await result.current.submitPrediction();
    });
    expect(result.current.attestationError).toBeTruthy();

    act(() => {
      result.current.resetAttestationStatus();
    });
    expect(result.current.attestationError).toBeNull();
  });
});
