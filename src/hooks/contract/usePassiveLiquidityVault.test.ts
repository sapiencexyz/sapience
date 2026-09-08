import { vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock wagmi
const mockUseReadContracts = vi.fn();
const mockUseReadContract = vi.fn();
const mockUseBalance = vi.fn();
vi.mock('wagmi', () => ({
  useReadContracts: (...args: unknown[]) => mockUseReadContracts(...args),
  useReadContract: (...args: unknown[]) => mockUseReadContract(...args),
  useBalance: (...args: unknown[]) => mockUseBalance(...args),
}));

// Mock viem - avoid jsdom issues
vi.mock('viem', () => ({
  erc20Abi: [],
  verifyMessage: vi.fn(async () => true),
}));

vi.mock('~/lib/sdk/contracts', () => ({
  predictionMarketVault: { 5064014: { address: '0xVau1t' } },
  collateralToken: { 5064014: { address: '0xC011ateral' } },
}));
vi.mock('~/lib/sdk/constants', () => ({
  DEFAULT_CHAIN_ID: 5064014,
  CHAIN_ID_ETHEREAL: 5064014,
  CHAIN_ID_ETHEREAL_TESTNET: 13374202,
}));
vi.mock('~/lib/sdk/abis', () => ({
  predictionMarketVaultAbi: [],
}));

const mockParsePendingRequest = vi.fn(() => null);
vi.mock('~/lib/sdk', () => ({
  formatVaultAssetAmount: vi.fn(() => '0'),
  formatVaultSharesAmount: vi.fn(() => '0'),
  formatUtilizationRate: vi.fn(() => '0'),
  formatInteractionDelay: vi.fn(() => ''),
  buildDepositCalls: vi.fn(() => []),
  buildWithdrawalCall: vi.fn(() => ({})),
  parsePendingRequest: (...args: unknown[]) => mockParsePendingRequest(...args),
  computeInteractionDelayRemaining: vi.fn(() => 0),
  buildVaultQuoteMessage: vi.fn(() => ''),
}));

vi.mock('~/hooks/blockchain/useSapienceWriteContract', () => ({
  useSapienceWriteContract: () => ({
    writeContract: vi.fn(),
    sendCalls: vi.fn(),
    isPending: false,
  }),
}));
vi.mock('~/hooks/blockchain/useCurrentAddress', () => ({
  useCurrentAddress: () => ({
    currentAddress: '0x1234567890abcdef1234567890abcdef12345678',
    isCalculating: false,
  }),
}));
vi.mock('~/hooks/ws/useVaultShareQuoteWs', () => ({
  useVaultShareQuoteWs: () => ({ vaultCollateralPerShare: '1.0', raw: null }),
}));

import { usePassiveLiquidityVault } from './usePassiveLiquidityVault';

const VAULT_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const;
const MANAGER = '0x1111111111111111111111111111111111111111';
const ASSET = '0x2222222222222222222222222222222222222222';

// Raw values as returned by useReadContracts with allowFailure: false,
// in the same order as the contracts array in the hook.
const VAULT_VALUES: unknown[] = [
  100n, // availableAssets
  200n, // totalSupply
  2000n * 10n ** 18n, // getTotalLiquidValue
  false, // paused
  MANAGER, // manager
  ASSET, // asset
  60n, // depositInteractionDelay
  0n, // expirationTime
];

const PENDING_TUPLE = [1n, 2n, 3n, MANAGER, true, false];

function setupReadContracts(
  overrides: { vaultValues?: unknown[]; vaultData?: unknown } = {}
) {
  mockUseReadContracts.mockImplementation((params: unknown) => {
    const { contracts } = params as {
      contracts?: { functionName?: string }[];
    };
    const fn = contracts?.[0]?.functionName;
    if (fn === 'availableAssets') {
      return {
        data:
          'vaultData' in overrides
            ? overrides.vaultData
            : (overrides.vaultValues ?? VAULT_VALUES),
        isLoading: false,
        refetch: vi.fn(),
      };
    }
    if (fn === 'balanceOf') {
      return { data: [42n], isLoading: false, refetch: vi.fn() };
    }
    if (fn === 'pendingRequests') {
      return { data: [PENDING_TUPLE], isLoading: false, refetch: vi.fn() };
    }
    if (fn === 'lastUserInteractionTimestamp') {
      return { data: [0n], isPending: false };
    }
    return { data: undefined, isLoading: false, refetch: vi.fn() };
  });
}

function setupDefaults() {
  setupReadContracts();
  mockUseBalance.mockReturnValue({
    data: undefined,
    isLoading: false,
    refetch: vi.fn(),
  });
  mockUseReadContract.mockReturnValue({
    data: undefined,
    isLoading: false,
    refetch: vi.fn(),
  });
}

function render() {
  return renderHook(() =>
    usePassiveLiquidityVault({ vaultAddress: VAULT_ADDRESS, chainId: 5064014 })
  );
}

describe('usePassiveLiquidityVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('uses all-or-nothing reads (allowFailure: false) so a flaky RPC call fails and retries the whole query instead of rendering zeros', () => {
    render();

    const callsWithContracts = mockUseReadContracts.mock.calls.filter(
      ([params]) => (params as { contracts?: unknown[] }).contracts?.length
    );
    expect(callsWithContracts.length).toBeGreaterThan(0);
    for (const [params] of callsWithContracts) {
      expect((params as { allowFailure?: boolean }).allowFailure).toBe(false);
    }
  });

  it('parses vault data from raw all-or-nothing results', () => {
    const { result } = render();

    expect(result.current.vaultData).toEqual({
      availableAssets: 100n,
      totalSupply: 200n,
      totalLiquidValue: 2000n * 10n ** 18n,
      paused: false,
      manager: MANAGER,
      asset: ASSET,
      depositInteractionDelay: 60n,
      expirationTime: 0n,
    });
  });

  it('handles tuple-shaped getTotalLiquidValue results', () => {
    const values = [...VAULT_VALUES];
    values[2] = [555n];
    setupReadContracts({ vaultValues: values });

    const { result } = render();

    expect(result.current.vaultData?.totalLiquidValue).toBe(555n);
  });

  it('returns null vault data while the query has no data (failed or loading)', () => {
    setupReadContracts({ vaultData: undefined });

    const { result } = render();

    expect(result.current.vaultData).toBeNull();
  });

  it('parses the user balance from raw results', () => {
    const { result } = render();

    expect(result.current.userData).toEqual({ balance: 42n });
  });

  it('passes the raw pending request struct to parsePendingRequest', () => {
    render();

    expect(mockParsePendingRequest).toHaveBeenCalledWith(PENDING_TUPLE);
  });
});
