import { vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCollateralBalance } from './useCollateralBalance';

// Mock wagmi
const mockUseReadContract = vi.fn();
vi.mock('wagmi', () => ({
  useReadContract: (...args: unknown[]) => mockUseReadContract(...args),
}));

// Mock viem - avoid jsdom issues with formatUnits
vi.mock('viem', () => ({
  erc20Abi: [],
  formatUnits: (value: bigint, decimals: number) => {
    return (Number(value) / 10 ** decimals).toString();
  },
}));

// Mock SDK constants
vi.mock('~/lib/sdk/constants', () => ({
  COLLATERAL_SYMBOLS: { 5064014: 'USDe', 42161: 'testUSDe' },
  DEFAULT_CHAIN_ID: 5064014,
}));

vi.mock('~/lib/sdk/contracts', () => ({
  collateralToken: {
    5064014: { address: '0xCollateral5064014' },
    42161: { address: '0xCollateral42161' },
  },
}));

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`;

function setupDefaults() {
  mockUseReadContract.mockReturnValue({
    data: undefined,
    isLoading: false,
    refetch: vi.fn(),
  });
}

describe('useCollateralBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('returns zero when address is missing', () => {
    const { result } = renderHook(() =>
      useCollateralBalance({ chainId: 5064014 })
    );
    expect(result.current.balance).toBe(0);
    expect(result.current.rawBalance).toBeUndefined();
  });

  it('resolves the collateral symbol for the chain', () => {
    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 42161 })
    );
    expect(result.current.symbol).toBe('testUSDe');
  });

  it('reads the ERC-20 collateral balance', () => {
    mockUseReadContract.mockReturnValue({
      data: 2n * 10n ** 18n,
      isLoading: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 42161 })
    );

    expect(result.current.balance).toBe(2);
    expect(result.current.rawBalance).toBe(2n * 10n ** 18n);
    expect(result.current.decimals).toBe(18);
  });

  it('reads the balance from the chain collateral token address', () => {
    renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 42161 })
    );

    expect(mockUseReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '0xCollateral42161',
        functionName: 'balanceOf',
        args: [ADDRESS],
        chainId: 42161,
      })
    );
  });

  it('is disabled when the enabled flag is false', () => {
    renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 42161, enabled: false })
    );

    expect(mockUseReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ enabled: false }),
      })
    );
  });

  it('returns isLoading: true when data is loading', () => {
    mockUseReadContract.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 42161 })
    );
    expect(result.current.isLoading).toBe(true);
  });

  it('defaults to DEFAULT_CHAIN_ID when chainId is omitted', () => {
    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS })
    );
    expect(result.current.symbol).toBe('USDe');
    expect(mockUseReadContract).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 5064014 })
    );
  });

  it('returns formattedBalance string', () => {
    mockUseReadContract.mockReturnValue({
      data: 5n * 10n ** 18n,
      isLoading: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useCollateralBalance({ address: ADDRESS, chainId: 42161 })
    );
    expect(result.current.formattedBalance).toBe('5 testUSDe');
  });
});
