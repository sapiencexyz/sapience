import { vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockUseRestrictedJurisdiction,
  mockUsePassiveLiquidityVault,
  mockUseCurrentAddress,
  mockUseVaultStats,
  mockUseVaultAccountValue,
  mockUseProtocolStats,
  mockRouterReplace,
  mockSearchParamsToString,
  mockVaultPnlChart,
} = vi.hoisted(() => ({
  mockUseRestrictedJurisdiction: vi.fn(),
  mockUsePassiveLiquidityVault: vi.fn(),
  mockUseCurrentAddress: vi.fn(),
  mockUseVaultStats: vi.fn(),
  mockUseVaultAccountValue: vi.fn(),
  mockUseProtocolStats: vi.fn(),
  mockRouterReplace: vi.fn(),
  mockSearchParamsToString: vi.fn(() => ''),
  mockVaultPnlChart: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('~/hooks/useRestrictedJurisdiction', () => ({
  useRestrictedJurisdiction: () => mockUseRestrictedJurisdiction(),
}));

vi.mock('~/hooks/contract/usePassiveLiquidityVault', () => ({
  usePassiveLiquidityVault: (args: unknown) =>
    mockUsePassiveLiquidityVault(args),
}));

vi.mock('~/hooks/blockchain/useCurrentAddress', () => ({
  useCurrentAddress: () => mockUseCurrentAddress(),
}));

vi.mock('~/hooks/graphql/useAnalytics', () => ({
  useVaultStats: (vaultAddress: string | undefined) =>
    mockUseVaultStats(vaultAddress),
  useProtocolStats: () => mockUseProtocolStats(),
  useVaultAccountValue: (vaultAddress: string | undefined) =>
    mockUseVaultAccountValue(vaultAddress),
}));

vi.mock('~/lib/context/ConnectDialogContext', () => ({
  useConnectDialog: () => ({ openConnectDialog: vi.fn() }),
}));

vi.mock('~/components/shared/RestrictedJurisdictionBanner', () => {
  const Banner = (props: Record<string, unknown>) => (
    <div data-testid="restricted-banner" data-show={String(props.show)} />
  );
  Banner.displayName = 'RestrictedJurisdictionBanner';
  return { __esModule: true, default: Banner };
});

// SDK mocks
vi.mock('@sapience/sdk/contracts', () => ({
  predictionMarketVault: { 42161: { address: '0xVault' } },
  pythPredictionMarketVault: { 42161: { address: '0xOptionsVault' } },
  predictionMarketVaultStrategyB: {
    42161: { address: '0xStrategyBVault' },
  },
  singleLegVault: { 42161: { address: '0xSingleLegVault' } },
}));

vi.mock('@sapience/sdk/constants', () => ({
  DEFAULT_CHAIN_ID: 42161,
  COLLATERAL_SYMBOLS: { 42161: 'USDe' },
}));

// UI component mocks
vi.mock('@sapience/ui/components/ui/button', () => ({
  Button: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      children: React.ReactNode;
      variant?: string;
      size?: string;
    }
  ) => (
    <button
      disabled={props.disabled}
      onClick={props.onClick}
      className={props.className}
    >
      {props.children}
    </button>
  ),
}));

vi.mock('@sapience/ui/components/ui/card', () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  CardContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock('@sapience/ui/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@sapience/ui/components/ui/tabs', () => ({
  Tabs: ({
    children,
  }: {
    children: React.ReactNode;
    defaultValue?: string;
  }) => <div>{children}</div>,
  TabsList: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div>{children}</div>,
  TabsContent: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <div data-tab-content={value}>{children}</div>,
  TabsTrigger: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
    className?: string;
  }) => <button data-tab-trigger={value}>{children}</button>,
}));

vi.mock('@sapience/ui/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('lucide-react', () => ({
  Vault: () => <span />,
  Clock: () => <span />,
}));

vi.mock('viem', () => ({
  parseUnits: (value: string, decimals: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0n;
    return BigInt(Math.floor(n)) * 10n ** BigInt(decimals);
  },
  isAddress: (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value),
}));

vi.mock('date-fns', () => ({
  formatDuration: () => '',
  intervalToDuration: () => ({}),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
  usePathname: () => '/vaults',
  useSearchParams: () => ({
    get: (key: string) =>
      new URLSearchParams(mockSearchParamsToString()).get(key),
    toString: () => mockSearchParamsToString(),
  }),
}));

vi.mock('next/link', () => {
  const Link = ({
    children,
  }: {
    children: React.ReactNode;
    href?: string;
    className?: string;
  }) => <>{children}</>;
  Link.displayName = 'Link';
  return { __esModule: true, default: Link };
});

vi.mock('~/components/shared/NumberDisplay', () => {
  const NumberDisplay = () => <span>0</span>;
  NumberDisplay.displayName = 'NumberDisplay';
  return { __esModule: true, default: NumberDisplay };
});

vi.mock('~/components/shared/AddressDisplay', () => ({
  AddressDisplay: () => <span />,
}));

vi.mock('~/components/shared/EnsAvatar', () => {
  const EnsAvatar = () => <span />;
  EnsAvatar.displayName = 'EnsAvatar';
  return { __esModule: true, default: EnsAvatar };
});

vi.mock('~/lib/constants/focusAreas', () => ({
  FOCUS_AREAS: [],
}));

vi.mock('~/components/markets/forms/shared/RiskDisclaimer', () => {
  const RiskDisclaimer = () => <div />;
  RiskDisclaimer.displayName = 'RiskDisclaimer';
  return { __esModule: true, default: RiskDisclaimer };
});

vi.mock('~/components/shared/Loader', () => {
  const Loader = () => <div />;
  Loader.displayName = 'Loader';
  return { __esModule: true, default: Loader };
});

vi.mock('~/components/vaults/VaultPnlChart', () => {
  const VaultPnlChart = (props: { isLoading?: boolean }) => {
    mockVaultPnlChart(props);
    return <div />;
  };
  VaultPnlChart.displayName = 'VaultPnlChart';
  return { __esModule: true, default: VaultPnlChart };
});

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------
import VaultsPageContent from '../VaultsPageContent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use one of the hardcoded DEPOSIT_WHITELIST addresses so the button is not
// blocked by the whitelist check.
const WHITELISTED_ADDRESS = '0xdb5af497a73620d881561edb508012a5f84e9ba2';

function passiveVaultDefaults() {
  return {
    vaultData: { totalLiquidValue: 1000n * 10n ** 18n, paused: false },
    userData: { balance: 100n * 10n ** 18n },
    pendingRequest: null,
    userAssetBalance: 100n * 10n ** 18n,
    assetDecimals: 18,
    isVaultPending: false,
    deposit: vi.fn(),
    requestWithdrawal: vi.fn(),
    cancelDeposit: vi.fn(),
    cancelWithdrawal: vi.fn(),
    formatAssetAmount: (v: bigint) => (Number(v) / 1e18).toString(),
    formatSharesAmount: (v: bigint) => (Number(v) / 1e18).toString(),
    allowance: 100000n * 10n ** 18n,
    pricePerShare: '1',
    quoteSignatureValid: true,
    expirationTime: 86400n,
    interactionDelay: 0n,
    isInteractionDelayActive: false,
    lastInteractionAt: 0n,
  };
}

function setDefaults() {
  mockUseCurrentAddress.mockReturnValue({
    currentAddress: WHITELISTED_ADDRESS,
    isConnected: true,
  });

  mockUsePassiveLiquidityVault.mockReturnValue(passiveVaultDefaults());

  mockUseVaultStats.mockReturnValue({
    data: [],
    isLoading: false,
  });

  mockUseVaultAccountValue.mockReturnValue({
    data: {
      collateralBalance: (1000n * 10n ** 18n).toString(),
      deployedCollateral: '0',
      claimableCollateral: '0',
      totalValue: (1000n * 10n ** 18n).toString(),
      timestamp: 1,
    },
    isLoading: false,
  });

  mockUseProtocolStats.mockReturnValue({
    data: { totalValueLocked: '0' },
    isLoading: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('VaultsPageContent geofence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsToString.mockReturnValue('');
    setDefaults();
  });

  it('shows banners and keeps deposit button disabled when restricted', () => {
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: true,
      isPermitLoading: false,
      permitData: { permitted: false },
      permitError: null,
    });

    render(<VaultsPageContent />);

    // Both deposit and withdraw tabs render a banner (tabs mock renders all content)
    const banners = screen.getAllByTestId('restricted-banner');
    expect(banners.length).toBe(2);
    banners.forEach((b) => expect(b.dataset.show).toBe('true'));

    // Enter a valid deposit amount so the ONLY remaining disable reason is geofence
    const inputs = screen.getAllByPlaceholderText('0.0');
    fireEvent.change(inputs[0], { target: { value: '10' } });

    // Deposit button should still be disabled due to geofence
    const depositBtn = screen.getByRole('button', { name: /Submit Deposit/ });
    expect(depositBtn).toBeDisabled();
  });

  it('hides banners and enables deposit button when permitted', () => {
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });

    render(<VaultsPageContent />);

    // Banners should not be shown
    const banners = screen.getAllByTestId('restricted-banner');
    banners.forEach((b) => expect(b.dataset.show).toBe('false'));

    // Enter a valid deposit amount
    const inputs = screen.getAllByPlaceholderText('0.0');
    fireEvent.change(inputs[0], { target: { value: '10' } });

    // Deposit button should be enabled (all other conditions satisfied by mocks)
    const depositBtn = screen.getByRole('button', { name: /Submit Deposit/ });
    expect(depositBtn).not.toBeDisabled();
  });

  it('does not show "Waiting for Price Quote" before an amount is entered', () => {
    mockUsePassiveLiquidityVault.mockReturnValue({
      ...passiveVaultDefaults(),
      quoteSignatureValid: false,
    });

    render(<VaultsPageContent />);

    // With no deposit amount entered, the button should fall back to its
    // default label instead of nagging about a missing price quote.
    expect(
      screen.queryByRole('button', { name: /Waiting for Price Quote/ })
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: /Submit Deposit/ })
    ).toBeInTheDocument();
  });

  it('shows "Waiting for Price Quote" once an amount is entered but the quote is not yet valid', () => {
    mockUsePassiveLiquidityVault.mockReturnValue({
      ...passiveVaultDefaults(),
      quoteSignatureValid: false,
    });

    render(<VaultsPageContent />);

    const inputs = screen.getAllByPlaceholderText('0.0');
    fireEvent.change(inputs[0], { target: { value: '10' } });

    expect(
      screen.getByRole('button', { name: /Waiting for Price Quote/ })
    ).toBeInTheDocument();
  });

  it('shows the singles vault tab while keeping options hidden', () => {
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });

    render(<VaultsPageContent />);

    expect(
      screen.getByRole('button', { name: 'Core Vault' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edge Vault' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Options Vault' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Singles Vault' })
    ).toBeInTheDocument();
  });

  it('accepts the singles vault address from the URL without rewriting it', () => {
    const singleLegVault = '0xSingleLegVault';
    mockSearchParamsToString.mockReturnValue(`address=${singleLegVault}`);
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });

    render(<VaultsPageContent />);

    expect(
      screen.getByRole('heading', { name: 'Singles Vault' })
    ).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(
      mockUsePassiveLiquidityVault.mock.calls.some(
        ([args]) =>
          (args as { vaultAddress?: string }).vaultAddress === singleLegVault
      )
    ).toBe(true);
    expect(mockUseVaultStats).toHaveBeenCalledWith(singleLegVault);
  });

  it('loads stats and contract data only for the selected vault plus protocol rewards stats', () => {
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });

    render(<VaultsPageContent />);

    expect(mockUseVaultStats).toHaveBeenCalledTimes(1);
    expect(mockUseVaultStats).toHaveBeenCalledWith('0xVault');
    expect(mockUseVaultAccountValue).toHaveBeenCalledTimes(1);
    expect(mockUseVaultAccountValue).toHaveBeenCalledWith('0xVault');
    expect(mockUsePassiveLiquidityVault).toHaveBeenCalledTimes(1);
    expect(mockUsePassiveLiquidityVault).toHaveBeenCalledWith({
      vaultAddress: '0xVault',
      chainId: 42161,
    });
    expect(mockUseProtocolStats).toHaveBeenCalledTimes(1);
  });

  it('accepts the hidden options vault address from the URL without showing its tab', () => {
    const optionsVault = '0xOptionsVault';
    mockSearchParamsToString.mockReturnValue(`address=${optionsVault}`);
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });

    render(<VaultsPageContent />);

    expect(screen.getByText('Options Vault')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Options Vault' })
    ).not.toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockUseVaultStats).toHaveBeenCalledWith(optionsVault);
  });

  it('treats an unknown but valid vault address as a Custom Vault without rewriting', () => {
    const unknownVault = '0x0000000000000000000000000000000000000abc';
    mockSearchParamsToString.mockReturnValue(`address=${unknownVault}`);
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });

    render(<VaultsPageContent />);

    // The address drives a synthetic "Custom Vault" rather than falling back to
    // the first known vault, so deposit/withdraw work against unregistered vaults.
    expect(screen.getByText('Custom Vault')).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockUseVaultStats).toHaveBeenCalledWith(unknownVault);
  });

  it('defaults to the first vault tab without rewriting the URL when no address query param is present', () => {
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });

    render(<VaultsPageContent />);

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});

describe('VaultsPageContent vault switch reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaults();
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });
  });

  it('clears the deposit and withdraw amounts when the selected vault changes', () => {
    mockSearchParamsToString.mockReturnValue('address=0xVault');
    const { rerender } = render(<VaultsPageContent />);

    // Enter amounts on the current vault (inputs[0] = deposit, inputs[1] = withdraw).
    const inputs = screen.getAllByPlaceholderText('0.0');
    fireEvent.change(inputs[0], { target: { value: '50' } });
    fireEvent.change(inputs[1], { target: { value: '25' } });
    expect((inputs[0] as HTMLInputElement).value).toBe('50');
    expect((inputs[1] as HTMLInputElement).value).toBe('25');

    // Switch to a different vault.
    mockSearchParamsToString.mockReturnValue('address=0xStrategyBVault');
    rerender(<VaultsPageContent />);

    const inputsAfter = screen.getAllByPlaceholderText('0.0');
    expect((inputsAfter[0] as HTMLInputElement).value).toBe('');
    expect((inputsAfter[1] as HTMLInputElement).value).toBe('');
  });
});

describe('VaultsPageContent vault balance display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsToString.mockReturnValue('');
    setDefaults();
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });
    // Indexed collateral balance = 1,000; deployed = 500; claimable = 125 -> balance 1,625.
    mockUseVaultAccountValue.mockReturnValue({
      data: {
        collateralBalance: (1000n * 10n ** 18n).toString(),
        deployedCollateral: (500n * 10n ** 18n).toString(),
        claimableCollateral: (125n * 10n ** 18n).toString(),
        totalValue: (1625n * 10n ** 18n).toString(),
        timestamp: 1,
      },
      isLoading: false,
    });
    mockUseVaultStats.mockReturnValue({
      data: [{ deployedCollateral: (500n * 10n ** 18n).toString() }],
      isLoading: false,
    });
  });

  it('renders the balance and progress bar once both sources have loaded', () => {
    render(<VaultsPageContent />);

    expect(screen.getByText('1,625.00 USDe')).toBeInTheDocument();
    expect(screen.getByTestId('vault-balance-bar')).toBeInTheDocument();
    expect(screen.getByText(/deployed/)).toBeInTheDocument();
  });

  it('fades the balance, bar, and deployed line in once loaded', () => {
    render(<VaultsPageContent />);

    const fadeIn = 'animate-in fade-in duration-200';
    expect(screen.getByText('1,625.00 USDe').className).toContain(fadeIn);
    expect(
      screen.getByTestId('vault-balance-bar').parentElement?.className
    ).toContain(fadeIn);
    expect(screen.getByText(/deployed/).className).toContain(fadeIn);
  });

  it('uses the indexed account value rather than the live on-chain liquid read', () => {
    mockUsePassiveLiquidityVault.mockReturnValue({
      ...passiveVaultDefaults(),
      vaultData: { totalLiquidValue: 9999n * 10n ** 18n, paused: false },
    });

    render(<VaultsPageContent />);

    expect(screen.getByText('1,625.00 USDe')).toBeInTheDocument();
    expect(screen.queryByText('10,499.00 USDe')).toBeNull();
  });

  it('hides the balance number and progress bar until indexed account value has loaded', () => {
    mockUseVaultAccountValue.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<VaultsPageContent />);

    expect(screen.queryByText('1,625.00 USDe')).toBeNull();
    expect(screen.queryByTestId('vault-balance-bar')).toBeNull();
    expect(screen.queryByText(/deployed/)).toBeNull();
  });

  it('drives the PnL chart loader from the vault-stats query, not the account value', () => {
    // The chart renders `vaultStats`, so its loader must track that query.
    // The account-value query (which backs the balance number) being settled
    // must not make the chart claim it has finished loading its own series.
    mockUseVaultStats.mockReturnValue({ data: undefined, isLoading: true });
    mockUseVaultAccountValue.mockReturnValue({
      data: {
        collateralBalance: '0',
        deployedCollateral: '0',
        claimableCollateral: '0',
        totalValue: '0',
        timestamp: 1,
      },
      isLoading: false,
    });

    render(<VaultsPageContent />);

    expect(mockVaultPnlChart).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true })
    );
  });

  it('drives TVL from the live on-chain vault balance plus indexer escrow terms', () => {
    // Indexer reports a stale liquid/total; the live on-chain balance must win.
    mockUsePassiveLiquidityVault.mockReturnValue({
      ...passiveVaultDefaults(),
      vaultCollateralBalance: 30n * 10n ** 18n, // live on-chain liquid
    });
    mockUseVaultAccountValue.mockReturnValue({
      data: {
        collateralBalance: (999n * 10n ** 18n).toString(), // stale, must be ignored
        deployedCollateral: (10n * 10n ** 18n).toString(),
        claimableCollateral: (5n * 10n ** 18n).toString(),
        totalValue: (999n * 10n ** 18n).toString(), // stale, must be ignored
        timestamp: 1,
      },
      isLoading: false,
    });

    render(<VaultsPageContent />);

    // TVL = live 30 + deployed 10 + claimable 5 = 45.00 (not the stale 999.00)
    expect(screen.getAllByText(/45\.00 USDe/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/999\.00 USDe/)).toBeNull();
  });
});
