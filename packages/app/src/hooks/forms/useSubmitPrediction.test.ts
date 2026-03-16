import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSubmitPrediction } from './useSubmitPrediction';

const mockUseAccount = vi.fn().mockReturnValue({ address: '0xUserAddress' });
vi.mock('wagmi', () => ({
  useAccount: (...args: unknown[]) => mockUseAccount(...args),
}));

// Mock viem to avoid jsdom issues with encoding
const mockEncodeAbiParameters = vi.fn().mockReturnValue('0xEncodedData');
const mockParseAbiParameters = vi.fn().mockReturnValue([]);
vi.mock('viem', () => ({
  encodeAbiParameters: (...args: unknown[]) => mockEncodeAbiParameters(...args),
  parseAbiParameters: (...args: unknown[]) => mockParseAbiParameters(...args),
}));

const mockWriteContract = vi.fn();
const mockReset = vi.fn();
let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {};

vi.mock('~/hooks/blockchain/useSapienceWriteContract', () => ({
  useSapienceWriteContract: (opts: Record<string, unknown>) => {
    capturedCallbacks = opts as Record<string, (...args: unknown[]) => void>;
    return {
      writeContract: mockWriteContract,
      isPending: false,
      reset: mockReset,
    };
  },
}));

vi.mock('~/hooks/contract/EAS', () => ({
  EAS_CONTRACT_ADDRESS: '0xEASContract',
  EAS_ATTEST_ABI: [{ name: 'attest', type: 'function' }],
}));

vi.mock('~/lib/constants', () => ({
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
    vi.clearAllMocks();
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
    const onSuccess = vi.fn();
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

  it('different submission value works', async () => {
    const { result } = renderHook(() =>
      useSubmitPrediction({
        ...DEFAULT_PROPS,
        submissionValue: '60',
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
        BigInt(Math.round(60 * 1e18)),
        'test comment',
      ])
    );
  });

  it('negative numeric input still submits (no client-side validation)', async () => {
    const { result } = renderHook(() =>
      useSubmitPrediction({
        ...DEFAULT_PROPS,
        submissionValue: '-5',
      })
    );

    await act(async () => {
      await result.current.submitPrediction();
    });

    // Negative values are encoded and submitted without client-side validation
    expect(result.current.attestationError).toBeNull();
    expect(mockWriteContract).toHaveBeenCalled();
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
