import { render, screen } from '@testing-library/react';
import { parseUnits } from 'viem';
import SponsorshipIndicator from '../SponsorshipIndicator';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';

const VAULT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

/** Build a QuoteBid with sensible defaults */
function makeBid(overrides: Partial<QuoteBid> = {}): QuoteBid {
  return {
    counterparty: VAULT_ADDRESS,
    counterpartyCollateral: parseUnits('4', 18).toString(),
    counterpartyDeadline: Math.floor(Date.now() / 1000) + 300, // 5 min from now
    counterpartySignature: '0xsig',
    counterpartyNonce: '1',
    validationStatus: 'valid',
    ...overrides,
  };
}

/** Default props that represent an eligible sponsored scenario */
const baseProps = {
  isSponsored: true,
  sponsorAddress: '0xsponsor' as `0x${string}`,
  remainingBudget: parseUnits('10', 18),
  maxEntryPriceBps: 7000n, // 70%
  matchLimit: parseUnits('10', 18),
  requiredCounterparty: VAULT_ADDRESS as `0x${string}`,
  positionSizeValue: '1',
  collateralDecimals: 18,
  collateralSymbol: 'USDe',
  sponsorshipActivated: false,
  onActivate: vi.fn(),
};

describe('SponsorshipIndicator', () => {
  it('renders sponsorship notice when an executable bestBid is present', () => {
    render(<SponsorshipIndicator {...baseProps} bestBid={makeBid()} />);
    expect(screen.getByText(/sponsorship available/i)).toBeInTheDocument();
  });

  it('does NOT render when bestBid is null (estimate-only scenario)', () => {
    const { container } = render(
      <SponsorshipIndicator {...baseProps} bestBid={null} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('does NOT render when bid counterparty does not match required counterparty', () => {
    const wrongCounterpartyBid = makeBid({
      counterparty: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    });
    const { container } = render(
      <SponsorshipIndicator {...baseProps} bestBid={wrongCounterpartyBid} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('does NOT render when entry price exceeds maxEntryPriceBps', () => {
    // Position 8 USDe, counterparty 2 USDe → entry = 80% > 70% cap
    const expensiveBid = makeBid({
      counterpartyCollateral: parseUnits('2', 18).toString(),
    });
    const { container } = render(
      <SponsorshipIndicator
        {...baseProps}
        positionSizeValue="8"
        bestBid={expensiveBid}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows "Reduce size" when position exceeds remaining budget', () => {
    render(
      <SponsorshipIndicator
        {...baseProps}
        remainingBudget={parseUnits('0.5', 18)}
        bestBid={makeBid()}
      />
    );
    expect(screen.getByText(/reduce size/i)).toBeInTheDocument();
  });

  it('shows confirmed sponsored state when activated and within budget', () => {
    render(
      <SponsorshipIndicator
        {...baseProps}
        sponsorshipActivated={true}
        bestBid={makeBid()}
      />
    );
    expect(screen.getByText(/sponsored/i)).toBeInTheDocument();
    expect(screen.getByText(/you pay 0/i)).toBeInTheDocument();
  });
});
