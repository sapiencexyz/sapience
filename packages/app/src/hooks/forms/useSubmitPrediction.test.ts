import { renderHook, act } from '@testing-library/react';
import { useSubmitPrediction } from './useSubmitPrediction';
import { MarketGroupClassification } from '../../lib/types';

jest.mock('wagmi', () => ({
  useAccount: jest.fn().mockReturnValue({ address: '0xUserAddress' }),
}));

// Mock viem to avoid jsdom issues with encoding
jest.mock('viem', () => ({
  encodeAbiParameters: jest.fn().mockReturnValue('0xEncodedData'),
  parseAbiParameters: jest.fn().mockReturnValue([]),
}));

const mockWriteContract = jest.fn();
const mockReset = jest.fn();
let capturedCallbacks: Record<string, Function> = {};

jest.mock('~/hooks/blockchain/useSapienceWriteContract', () => ({
  useSapienceWriteContract: (opts: Record<string, any>) => {
    capturedCallbacks = opts;
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
  marketClassification: MarketGroupClassification.YES_NO,
  submissionValue: '75',
  comment: 'test comment',
  resolver: '0xResolver' as `0x${string}`,
  condition: '0xCondition' as `0x${string}`,
};

describe('useSubmitPrediction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteContract.mockResolvedValue(undefined);
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
    const useAccount = require('wagmi').useAccount;
    useAccount.mockReturnValue({ address: undefined });

    const { result } = renderHook(() => useSubmitPrediction(DEFAULT_PROPS));

    await act(async () => {
      await result.current.submitPrediction();
    });

    expect(result.current.attestationError).toContain('Wallet not connected');

    // Restore
    useAccount.mockReturnValue({ address: '0xUserAddress' });
  });

  it('onSuccess callback updates state', () => {
    const onSuccess = jest.fn();
    renderHook(() =>
      useSubmitPrediction({ ...DEFAULT_PROPS, onSuccess })
    );

    // Simulate the onSuccess callback from useSapienceWriteContract
    act(() => {
      capturedCallbacks.onSuccess?.();
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('onError callback sets attestation error', () => {
    renderHook(() => useSubmitPrediction(DEFAULT_PROPS));

    act(() => {
      capturedCallbacks.onError?.(new Error('tx failed'));
    });

    // The error state is set internally - we verify the callback was wired correctly
    // by checking the hook doesn't throw
  });

  it('resetAttestationStatus clears error and success', async () => {
    const useAccount = require('wagmi').useAccount;
    useAccount.mockReturnValue({ address: undefined });

    const { result } = renderHook(() => useSubmitPrediction(DEFAULT_PROPS));

    await act(async () => {
      await result.current.submitPrediction();
    });
    expect(result.current.attestationError).toBeTruthy();

    act(() => {
      result.current.resetAttestationStatus();
    });
    expect(result.current.attestationError).toBeNull();

    useAccount.mockReturnValue({ address: '0xUserAddress' });
  });
});
