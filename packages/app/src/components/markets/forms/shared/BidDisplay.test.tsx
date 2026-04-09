import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BidDisplay from './BidDisplay';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';

vi.mock('@sapience/ui/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@sapience/ui/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron-down" />,
  Info: () => <span data-testid="info-icon" />,
}));

vi.mock('./RiskDisclaimer', () => ({
  default: () => <div data-testid="risk-disclaimer" />,
}));

vi.mock('~/components/shared/Loader', () => ({
  default: () => <div data-testid="loader" />,
}));

vi.mock('~/components/shared/AuctionBidsChart', () => ({
  default: () => <div data-testid="auction-bids-chart" />,
}));

vi.mock('~/lib/auction/bidAdapter', () => ({
  quoteBidsToAuctionBids: () => [],
}));

const bestBid: QuoteBid = {
  auctionId: 'auction-1',
  counterparty: '0x1f5fF6074095cd27A7EaBd75F0A1Ac4243ecCE91',
  counterpartyCollateral: '100000000000000000000',
  counterpartyDeadline: 9999999999,
  counterpartySignature: '0xsig',
  counterpartyNonce: 1,
  validationStatus: 'valid',
};

describe('BidDisplay', () => {
  it('shows the max-payout tooltip when flagged on a valid best bid', () => {
    render(
      <BidDisplay
        bestBid={bestBid}
        positionSize="25"
        collateralSymbol="USDe"
        collateralDecimals={18}
        showMaxPayoutTooltip
        nowMs={0}
        showRequestBidsButton={false}
        onRequestBids={vi.fn()}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('Payout')).toBeInTheDocument();
    expect(
      screen.getByText('This is max payout ever offered by the bidder.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Max payout info')).toBeInTheDocument();
  });

  it('does not show the max-payout tooltip when not flagged', () => {
    render(
      <BidDisplay
        bestBid={bestBid}
        positionSize="25"
        collateralSymbol="USDe"
        collateralDecimals={18}
        showMaxPayoutTooltip={false}
        nowMs={0}
        showRequestBidsButton={false}
        onRequestBids={vi.fn()}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />
    );

    expect(
      screen.queryByText('This is max payout ever offered by the bidder.')
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Max payout info')).not.toBeInTheDocument();
  });
});
