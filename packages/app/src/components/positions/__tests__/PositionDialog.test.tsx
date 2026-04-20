import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type {
  PickConfigData,
  PositionBalance,
} from '~/hooks/graphql/usePositions';

// Mock PicksContent — it renders a Link which pulls in the app router;
// the dialog's picks rendering is out of scope for this test.
vi.mock('~/components/shared/PicksSummary', () => ({
  __esModule: true,
  PicksContent: () => null,
  default: () => null,
}));

// Mock next/link to a plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// Dialog from @sapience/ui uses a portal that is hard to attach to jsdom;
// render the content inline instead.
vi.mock('@sapience/ui/components/ui/dialog', () => ({
  __esModule: true,
  Dialog: ({
    open,
    children,
  }: {
    open?: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import PositionDialog from '../PositionDialog';

const pickConfig: PickConfigData = {
  id: 'pc-1',
  chainId: 42161,
  marketAddress: '0xmarket',
  // Aggregate across 10 predictions of ~100 USDe each.
  totalPredictorCollateral: '20210000000000000000',
  totalCounterpartyCollateral: '979790000000000000000',
  claimedPredictorCollateral: '0',
  claimedCounterpartyCollateral: '0',
  resolved: false,
  result: 'UNRESOLVED',
  resolvedAt: null,
  predictorToken: '0xpred-token',
  counterpartyToken: '0xcp-token',
  endsAt: null,
  isLegacy: false,
  predictionId:
    '0xb8c5b8f93205790de170c51acbded4e107070dadf3098d11bbacfbcab11510cb',
  picks: [],
};

// This holder holds the counterparty side of 10 predictions →
// userCollateral = 979.79, totalPayout = 1,000 (sum across the parlays).
const counterpartyPosition: PositionBalance = {
  id: 1,
  chainId: 42161,
  tokenAddress: '0xcp-token',
  pickConfigId: 'pc-1',
  isPredictorToken: false,
  holder: '0x1f5ff6074095cd27a7eabd75f0a1ac4243ecce91',
  balance: '979790000000000000000',
  userCollateral: '979790000000000000000',
  totalPayout: '1000000000000000000000',
  createdAt: '2026-04-20T00:00:00.000Z',
  pickConfig,
};

describe('PositionDialog', () => {
  beforeEach(() => {
    // no-op — all mocks are module-level and stateless
  });

  it('labels the dialog as a Position, not as a specific Prediction', () => {
    render(
      <PositionDialog
        open
        onOpenChange={() => {}}
        position={counterpartyPosition}
        conditionsMap={new Map()}
        collateralSymbol="USDe"
      />
    );

    // Header must say "Position" alone and must NOT surface the predictionId,
    // because a position can aggregate many predictions with distinct ids.
    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.queryByText(/Prediction\s+0xb8c5/i)).not.toBeInTheDocument();
  });

  it('renders the aggregate size and payout from the PositionBalance', () => {
    render(
      <PositionDialog
        open
        onOpenChange={() => {}}
        position={counterpartyPosition}
        conditionsMap={new Map()}
        collateralSymbol="USDe"
      />
    );

    // Position Size = userCollateral = 979.79 (formatted to 2 decimals).
    expect(screen.getByText(/979\.79/)).toBeInTheDocument();
    // Payout = totalPayout = 1,000 (with thousands separator).
    expect(screen.getByText(/1,000(\.00)?/)).toBeInTheDocument();
  });

  it('renders nothing when position is null', () => {
    const { container } = render(
      <PositionDialog
        open
        onOpenChange={() => {}}
        position={null}
        conditionsMap={new Map()}
        collateralSymbol="USDe"
      />
    );
    expect(container.innerHTML).toBe('');
  });
});
