import { renderHook } from '@testing-library/react';
import { useCollateralBalance } from './useCollateralBalance';

// Mock wagmi
const mockUseReadContract = jest.fn();
const mockUseBalance = jest.fn();
jest.mock('wagmi', () => ({
  useReadContract: (...args: unknown[]) => mockUseReadContract(...args),
  useBalance: (...args: unknown[]) => mockUseBalance(...args),
}));

// Mock viem - avoid jsdom issues with formatUnits
jest.mock('viem', () => ({
  erc20Abi: [],
  formatUnits: (value: bigint, decimals: number) => {
    return (Number(value) / 10 ** decimals).toString();
  },
}));

// Mock SDK constants
jest.mock('@sapience/sdk/constants', () => ({
  COLLATERAL_SYMBOLS: { 5064014: 'USDe', 13374202: 'USDe', 42161: 'testUSDe' },
  CHAIN_ID_ETHEREAL: 5064014,
  CHAIN_ID_ETHEREAL_TESTNET: 13374202,
  DEFAULT_CHAIN_ID: 5064014,
}));

jest.mock('@sapience/sdk/contracts', () => ({
  collateralToken: {
    42161: { address: '0xCollateral42161' },
  },
}));

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`;

function setupDefaults() {
  mockUseBalance.mockReturnValue({
    data: undefined,
    isLoading: false,
    refetch: jest.fn(),
  });
  mockUseReadContract.mockReturnValue({
    data: undefined,
    isLoading: false,
    refetch: jest.fn(),
  });
}

describe('useCollateralBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaults();
  });

  it('returns zeros when address is missing', () => {
    const { result } = renderHook(() =>
      useCollateralBalance({ chainId: 5064014 })
    );
    expect(result.current.balance).toBe(0);
    expect(result.current.nativeBalance).toBe(0);
    expect(result.current.wrappedBalance).toBe(0);
  });

  it('detects Ethereal chain correctly', () => {
    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 5064014 })
    );
    expect(result.current.isEtherealChain).toBe(true);
    expect(result.current.symbol).toBe('USDe');
  });

  it('detects non-Ethereal chain correctly', () => {
    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 42161 })
    );
    expect(result.current.isEtherealChain).toBe(false);
    expect(result.current.symbol).toBe('testUSDe');
  });

  it('combines native + wrapped USDe on Ethereal chain', () => {
    // Native balance via useBalance
    mockUseBalance.mockReturnValue({
      data: { formatted: '1.5', value: 1500000000000000000n, decimals: 18 },
      isLoading: false,
      refetch: jest.fn(),
    });
    // useReadContract calls: wusde balanceOf, erc20 balanceOf
    mockUseReadContract
      .mockReturnValueOnce({
        data: 2000000000000000000n,
        isLoading: false,
        refetch: jest.fn(),
      }) // wusde balanceOf
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        refetch: jest.fn(),
      }); // erc20 balanceOf (disabled)

    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 5064014 })
    );
    expect(result.current.nativeBalance).toBe(1.5);
    expect(result.current.wrappedBalance).toBe(2);
    expect(result.current.balance).toBe(3.5);
  });

  it('reads ERC20 balance on non-Ethereal chain', () => {
    mockUseBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });
    // useReadContract calls: wusde balanceOf (disabled), erc20 balanceOf
    mockUseReadContract
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        refetch: jest.fn(),
      }) // wusde balanceOf (disabled)
      .mockReturnValueOnce({
        data: 5000000000000000000n,
        isLoading: false,
        refetch: jest.fn(),
      }); // erc20 balanceOf

    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 42161 })
    );
    expect(result.current.balance).toBe(5);
    expect(result.current.nativeBalance).toBe(0);
    expect(result.current.wrappedBalance).toBe(0);
  });

  it('returns isLoading: true when data is loading (Ethereal)', () => {
    mockUseBalance.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 5064014 })
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.balance).toBe(0);
  });

  it('returns isLoading: true when data is loading (non-Ethereal)', () => {
    mockUseBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });
    // useReadContract calls: wusde balanceOf (disabled), erc20 balanceOf (loading)
    mockUseReadContract
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        refetch: jest.fn(),
      }) // wusde balanceOf (disabled)
      .mockReturnValueOnce({
        data: undefined,
        isLoading: true,
        refetch: jest.fn(),
      }); // erc20 balanceOf loading

    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 42161 })
    );
    expect(result.current.isLoading).toBe(true);
  });

  it('defaults to DEFAULT_CHAIN_ID when chainId is omitted', () => {
    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS })
    );
    // DEFAULT_CHAIN_ID is 5064014 (Ethereal)
    expect(result.current.isEtherealChain).toBe(true);
  });

  it('returns formattedBalance string', () => {
    mockUseBalance.mockReturnValue({
      data: { formatted: '1.5', value: 1500000000000000000n, decimals: 18 },
      isLoading: false,
      refetch: jest.fn(),
    });
    // useReadContract calls: wusde balanceOf, erc20 balanceOf
    mockUseReadContract
      .mockReturnValueOnce({
        data: 2000000000000000000n,
        isLoading: false,
        refetch: jest.fn(),
      }) // wusde balanceOf
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        refetch: jest.fn(),
      }); // erc20 balanceOf (disabled)

    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 5064014 })
    );
    expect(result.current.formattedBalance).toBe('3.5 USDe');
  });

  it('refetch() calls the correct underlying refetch fns per chain', () => {
    const refetchNative = jest.fn();
    const refetchWusde = jest.fn();
    const refetchErc20 = jest.fn();

    // Ethereal chain: refetchNative and refetchWusde should be called
    mockUseBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: refetchNative,
    });
    // useReadContract calls: wusde balanceOf, erc20 balanceOf
    mockUseReadContract
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        refetch: refetchWusde,
      }) // wusde balanceOf
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        refetch: refetchErc20,
      }); // erc20 balanceOf (disabled)

    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 5064014 })
    );
    result.current.refetch();
    expect(refetchNative).toHaveBeenCalled();
    expect(refetchWusde).toHaveBeenCalled();
    expect(refetchErc20).not.toHaveBeenCalled();
  });

  it('refetch() calls erc20 refetch on non-Ethereal chain', () => {
    const refetchNative = jest.fn();
    const refetchErc20 = jest.fn();

    mockUseBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: refetchNative,
    });
    // useReadContract calls: wusde balanceOf (disabled), erc20 balanceOf
    mockUseReadContract
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        refetch: jest.fn(),
      }) // wusde balanceOf (disabled)
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        refetch: refetchErc20,
      }); // erc20 balanceOf

    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 42161 })
    );
    result.current.refetch();
    expect(refetchNative).not.toHaveBeenCalled();
    expect(refetchErc20).toHaveBeenCalled();
  });

  it('disables queries when enabled is false', () => {
    const { result } = renderHook(() =>
      useCollateralBalance({
        address: ADDRESS,
        chainId: 5064014,
        enabled: false,
      })
    );
    // With enabled=false, the queries pass enabled:false so no data is fetched
    // The hook should still return default values
    expect(result.current.balance).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });
});
