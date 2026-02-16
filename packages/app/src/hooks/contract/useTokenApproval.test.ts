import { renderHook, act } from '@testing-library/react';
import { useTokenApproval } from './useTokenApproval';

const mockUseReadContract = jest.fn();
jest.mock('wagmi', () => ({
  useReadContract: (...args: unknown[]) => mockUseReadContract(...args),
}));

jest.mock('viem', () => ({
  parseUnits: (value: string, decimals: number) => BigInt(Math.round(Number(value) * 10 ** decimals)),
  zeroAddress: '0x0000000000000000000000000000000000000000',
}));

jest.mock('@sapience/sdk/queries/abis/erc20abi.json', () => [], { virtual: true });

const mockWriteContract = jest.fn();
const mockResetWrite = jest.fn();
let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {};

jest.mock('~/hooks/blockchain/useSapienceWriteContract', () => ({
  useSapienceWriteContract: (opts: Record<string, unknown>) => {
    capturedCallbacks = opts as Record<string, (...args: unknown[]) => void>;
    return {
      writeContract: mockWriteContract,
      isPending: false,
      reset: mockResetWrite,
    };
  },
}));

jest.mock('~/hooks/blockchain/useCurrentAddress', () => ({
  useCurrentAddress: () => ({
    currentAddress: '0xUser' as `0x${string}`,
    isConnected: true,
  }),
}));

const TOKEN = '0xToken' as `0x${string}`;
const SPENDER = '0xSpender' as `0x${string}`;

describe('useTokenApproval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseReadContract.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });
    mockWriteContract.mockResolvedValue(undefined);
  });

  it('hasAllowance is true when allowance >= amount', () => {
    mockUseReadContract.mockReturnValue({
      data: 2000000000000000000n, // 2e18
      isLoading: false,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useTokenApproval({
        tokenAddress: TOKEN,
        spenderAddress: SPENDER,
        amount: '1',
        chainId: 42161,
        decimals: 18,
      })
    );
    expect(result.current.hasAllowance).toBe(true);
  });

  it('hasAllowance is false when allowance < amount', () => {
    mockUseReadContract.mockReturnValue({
      data: 500000000000000000n, // 0.5e18
      isLoading: false,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useTokenApproval({
        tokenAddress: TOKEN,
        spenderAddress: SPENDER,
        amount: '1',
        chainId: 42161,
        decimals: 18,
      })
    );
    expect(result.current.hasAllowance).toBe(false);
  });

  it('hasAllowance is false when allowance is undefined', () => {
    const { result } = renderHook(() =>
      useTokenApproval({
        tokenAddress: TOKEN,
        spenderAddress: SPENDER,
        amount: '1',
        chainId: 42161,
      })
    );
    expect(result.current.hasAllowance).toBe(false);
  });

  it('approve() calls writeContract with correct params', async () => {
    mockUseReadContract.mockReturnValue({
      data: 0n,
      isLoading: false,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useTokenApproval({
        tokenAddress: TOKEN,
        spenderAddress: SPENDER,
        amount: '1',
        chainId: 42161,
        decimals: 18,
      })
    );

    await act(async () => {
      await result.current.approve();
    });

    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN,
        functionName: 'approve',
        args: [SPENDER, 1000000000000000000n],
        chainId: 42161,
      })
    );
  });

  it('approve() sets error when missing required params (no tokenAddress)', async () => {
    const { result } = renderHook(() =>
      useTokenApproval({
        // no tokenAddress
        spenderAddress: SPENDER,
        amount: '1',
        chainId: 42161,
      })
    );

    // approve() throws and sets error state
    await act(async () => {
      try {
        await result.current.approve();
      } catch {
        // expected - throws "Missing required parameters"
      }
    });

    expect(result.current.error?.message).toMatch('Missing required parameters');
  });

  it('approve() sets error when amount is 0', async () => {
    // Suppress expected console.error from the hook
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useTokenApproval({
        tokenAddress: TOKEN,
        spenderAddress: SPENDER,
        amount: '0',
        chainId: 42161,
      })
    );

    await act(async () => {
      try {
        await result.current.approve();
      } catch {
        // expected - throws "Missing required parameters"
      }
    });

    expect(result.current.error?.message).toMatch('Missing required parameters');
    spy.mockRestore();
  });

  it('onSuccess callback sets isApproveSuccess and clears error', () => {
    const { result } = renderHook(() =>
      useTokenApproval({
        tokenAddress: TOKEN,
        spenderAddress: SPENDER,
        amount: '1',
        chainId: 42161,
        decimals: 18,
      })
    );

    // First trigger an error via onError
    act(() => {
      capturedCallbacks.onError?.(new Error('some error'));
    });
    expect(result.current.error?.message).toBe('some error');

    // Now trigger onSuccess
    act(() => {
      capturedCallbacks.onSuccess?.();
    });
    expect(result.current.isApproveSuccess).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('onError callback sets error state', () => {
    const { result } = renderHook(() =>
      useTokenApproval({
        tokenAddress: TOKEN,
        spenderAddress: SPENDER,
        amount: '1',
        chainId: 42161,
        decimals: 18,
      })
    );

    act(() => {
      capturedCallbacks.onError?.(new Error('tx reverted'));
    });

    expect(result.current.error?.message).toBe('tx reverted');
    expect(result.current.isApproveSuccess).toBe(false);
  });

  it('onTxHash callback clears error', () => {
    const { result } = renderHook(() =>
      useTokenApproval({
        tokenAddress: TOKEN,
        spenderAddress: SPENDER,
        amount: '1',
        chainId: 42161,
        decimals: 18,
      })
    );

    // First set an error
    act(() => {
      capturedCallbacks.onError?.(new Error('some error'));
    });
    expect(result.current.error).toBeDefined();

    // onTxHash should clear it
    act(() => {
      capturedCallbacks.onTxHash?.();
    });
    expect(result.current.error).toBeUndefined();
  });

  it('reset clears error state after an error was set', async () => {
    const { result } = renderHook(() =>
      useTokenApproval({
        // missing tokenAddress to trigger error on approve
        spenderAddress: SPENDER,
        amount: '1',
        chainId: 42161,
      })
    );

    // First trigger an error
    await act(async () => {
      try {
        await result.current.approve();
      } catch {
        // expected
      }
    });
    expect(result.current.error).toBeDefined();

    // Now reset should clear it
    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeUndefined();
    expect(result.current.isApproveSuccess).toBe(false);
  });

  it('approve() propagates writeContract rejection to error state', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockWriteContract.mockRejectedValue(new Error('user rejected'));

    mockUseReadContract.mockReturnValue({
      data: 0n,
      isLoading: false,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useTokenApproval({
        tokenAddress: TOKEN,
        spenderAddress: SPENDER,
        amount: '1',
        chainId: 42161,
        decimals: 18,
      })
    );

    await act(async () => {
      try {
        await result.current.approve();
      } catch {
        // expected
      }
    });

    expect(result.current.error?.message).toBe('user rejected');
    spy.mockRestore();
  });
});
