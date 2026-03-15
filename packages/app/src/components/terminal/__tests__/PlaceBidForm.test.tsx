import { vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockUseRestrictedJurisdiction } = vi.hoisted(() => ({
  mockUseRestrictedJurisdiction: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('~/hooks/useRestrictedJurisdiction', () => ({
  useRestrictedJurisdiction: () => mockUseRestrictedJurisdiction(),
}));

vi.mock('~/components/shared/RestrictedJurisdictionBanner', () => {
  const Banner = (props: Record<string, unknown>) => (
    <div data-testid="restricted-banner" data-show={String(props.show)} />
  );
  Banner.displayName = 'RestrictedJurisdictionBanner';
  return { __esModule: true, default: Banner };
});

vi.mock('~/components/terminal/PayoutLine', () => {
  const PayoutLine = () => <div data-testid="payout-line" />;
  PayoutLine.displayName = 'PayoutLine';
  return { __esModule: true, default: PayoutLine };
});

vi.mock('~/components/shared/PercentChance', () => {
  const PercentChance = () => <span data-testid="percent-chance" />;
  PercentChance.displayName = 'PercentChance';
  return { __esModule: true, default: PercentChance };
});

vi.mock('@sapience/ui/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@sapience/ui/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('lucide-react', () => ({
  Pencil: () => <span data-testid="pencil-icon" />,
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------
import PlaceBidForm from '../PlaceBidForm';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PlaceBidForm geofence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows banner and disables submit when jurisdiction is restricted', () => {
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: true,
      isPermitLoading: false,
      permitData: { permitted: false },
      permitError: null,
    });

    render(
      <PlaceBidForm
        collateralAssetTicker="USDe"
        availableBalance={100}
        onSubmit={vi.fn()}
        variant="compact"
      />
    );

    // Banner should be shown
    const banner = screen.getByTestId('restricted-banner');
    expect(banner.dataset.show).toBe('true');

    // Submit button should be disabled (canSubmit includes !isRestricted)
    const submitBtn = screen.getByRole('button', { name: /for payout/ });
    expect(submitBtn).toBeDisabled();
  });

  it('hides banner and enables submit when jurisdiction is permitted', () => {
    mockUseRestrictedJurisdiction.mockReturnValue({
      isRestricted: false,
      isPermitLoading: false,
      permitData: { permitted: true },
      permitError: null,
    });

    render(
      <PlaceBidForm
        collateralAssetTicker="USDe"
        availableBalance={100}
        onSubmit={vi.fn()}
        variant="compact"
      />
    );

    // Banner should not be shown
    const banner = screen.getByTestId('restricted-banner');
    expect(banner.dataset.show).toBe('false');

    // Default state sets amount to 1 (via the no-bids useEffect) and
    // expiry defaults to 24h — both valid — so submit should be enabled.
    const submitBtn = screen.getByRole('button', { name: /for payout/ });
    expect(submitBtn).not.toBeDisabled();
  });
});
