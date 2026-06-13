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
  mockUseProtocolStats,
  mockRouterReplace,
  mockSearchParamsToString,
} = vi.hoisted(() => ({
  mockUseRestrictedJurisdiction: vi.fn(),
  mockUsePassiveLiquidityVault: vi.fn(),
  mockUseCurrentAddress: vi.fn(),
  mockUseProtocolStats: vi.fn(),
  mockRouterReplace: vi.fn(),
  mockSearchParamsToString: vi.fn(() => ''),
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
  useProtocolStats: (vaultAddress: string | undefined) =>
    mockUseProtocolStats(vaultAddress),
  getProtocolTvlWei: (
    stat: { escrowBalance?: string; vaultAvailableAssets?: string } | null
  ) =>
    stat
      ? BigInt(stat.escrowBalance || '0') +
        BigInt(stat.vaultAvailableAssets || '0')
      : 0n,
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
  const VaultPnlChart = () => <div />;
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

  mockUseProtocolStats.mockReturnValue({
    data: [],
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

  it('keeps the options vault tab visible and single-leg hidden from tabs', () => {
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
      screen.getByRole('button', { name: 'Options Vault' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Single Leg Vault' })
    ).not.toBeInTheDocument();
  });

  it('accepts a hidden known/indexed vault address from the URL without rewriting it', () => {
    const singleLegVault = '0xSingleLegVault';
    mockSearchParamsToString.mockReturnValue(`address=${singleLegVault}`);
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });

    render(<VaultsPageContent />);

    expect(screen.getByText('Single Leg Vault')).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(
      mockUsePassiveLiquidityVault.mock.calls.some(
        ([args]) =>
          (args as { vaultAddress?: string }).vaultAddress === singleLegVault
      )
    ).toBe(true);
    expect(mockUseProtocolStats).toHaveBeenCalledWith(singleLegVault);
  });

  it('rewrites an unknown vault address to the default vault', () => {
    const unknownVault = '0x0000000000000000000000000000000000000abc';
    mockSearchParamsToString.mockReturnValue(`address=${unknownVault}`);
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });

    render(<VaultsPageContent />);

    expect(screen.queryByText('Custom Vault')).not.toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenCalledWith('/vaults?address=0xvault', {
      scroll: false,
    });
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
    // Liquid (on-chain) = 1,000; deployed (GraphQL) = 500 -> balance 1,500.
    mockUseProtocolStats.mockReturnValue({
      data: [{ vaultDeployed: (500n * 10n ** 18n).toString() }],
      isLoading: false,
    });
  });

  it('renders the balance and progress bar once both sources have loaded', () => {
    render(<VaultsPageContent />);

    expect(screen.getByText('1,500.00 USDe')).toBeInTheDocument();
    expect(screen.getByTestId('vault-balance-bar')).toBeInTheDocument();
    expect(screen.getByText(/deployed/)).toBeInTheDocument();
  });

  it('fades the balance, bar, and deployed line in once loaded', () => {
    render(<VaultsPageContent />);

    const fadeIn = 'animate-in fade-in duration-200';
    expect(screen.getByText('1,500.00 USDe').className).toContain(fadeIn);
    expect(
      screen.getByTestId('vault-balance-bar').parentElement?.className
    ).toContain(fadeIn);
    expect(screen.getByText(/deployed/).className).toContain(fadeIn);
  });

  it('hides the balance number and progress bar until the on-chain read has loaded', () => {
    mockUsePassiveLiquidityVault.mockReturnValue({
      ...passiveVaultDefaults(),
      vaultData: null,
    });

    render(<VaultsPageContent />);

    // Without the liquid value, the sum would misleadingly show only the
    // deployed portion (500.00) - it must not render at all.
    expect(screen.queryByText('500.00 USDe')).toBeNull();
    expect(screen.queryByTestId('vault-balance-bar')).toBeNull();
    expect(screen.queryByText(/deployed/)).toBeNull();
  });

  it('hides the balance number and progress bar until protocol stats have loaded', () => {
    mockUseProtocolStats.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<VaultsPageContent />);

    // Without the deployed value, the sum would misleadingly show only the
    // liquid portion (1,000.00) - it must not render at all.
    expect(screen.queryByText('1,000.00 USDe')).toBeNull();
    expect(screen.queryByTestId('vault-balance-bar')).toBeNull();
    expect(screen.queryByText(/deployed/)).toBeNull();
  });
});
