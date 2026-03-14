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
} = vi.hoisted(() => ({
  mockUseRestrictedJurisdiction: vi.fn(),
  mockUsePassiveLiquidityVault: vi.fn(),
  mockUseCurrentAddress: vi.fn(),
  mockUseProtocolStats: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('~/hooks/useRestrictedJurisdiction', () => ({
  useRestrictedJurisdiction: () => mockUseRestrictedJurisdiction(),
}));

vi.mock('~/hooks/contract/usePassiveLiquidityVault', () => ({
  usePassiveLiquidityVault: () => mockUsePassiveLiquidityVault(),
}));

vi.mock('~/hooks/blockchain/useCurrentAddress', () => ({
  useCurrentAddress: () => mockUseCurrentAddress(),
}));

vi.mock('~/hooks/graphql/useAnalytics', () => ({
  useProtocolStats: () => mockUseProtocolStats(),
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

function setDefaults() {
  mockUseCurrentAddress.mockReturnValue({
    currentAddress: WHITELISTED_ADDRESS,
    isConnected: true,
  });

  mockUsePassiveLiquidityVault.mockReturnValue({
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
  });

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
});
