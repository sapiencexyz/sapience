import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type {
  ActivityItem,
  PredictionActivity,
  TradeActivity,
} from '~/hooks/graphql/useAccountActivity';
import type {
  PickConfigData,
  PickData,
  Prediction,
} from '~/hooks/graphql/usePositions';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// The hook's transport/mapping behavior is covered by useAccountActivity.test;
// here we drive the table with domain-shaped fixtures.
const mockUseAccountActivity = vi.fn();
vi.mock('~/hooks/graphql/useAccountActivity', () => ({
  useAccountActivity: (args: unknown) => mockUseAccountActivity(args),
}));

// IntersectionObserver-free stand-in; the sentinel wiring is out of scope.
vi.mock('~/hooks/useInfiniteScroll', () => ({
  useInfiniteScroll: () => ({ loadMoreRef: { current: null } }),
}));

// Radix tooltips fight jsdom portals; render triggers inline, drop content.
vi.mock('@sapience/ui/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: () => null,
}));

vi.mock('~/components/shared/Loader', () => {
  const Loader = () => <div data-testid="loader" />;
  return { __esModule: true, default: Loader };
});

vi.mock('~/components/shared/PicksSummary', () => ({
  __esModule: true,
  default: ({
    picks,
    predictionId,
    onClick,
  }: {
    picks: { question: string; choice: string }[];
    predictionId?: string;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      data-testid="picks-summary"
      data-prediction-id={predictionId ?? ''}
      onClick={onClick}
    >
      {picks.map((p) => `${p.question}: ${p.choice}`).join(', ')}
    </button>
  ),
}));

vi.mock('~/components/shared/PicksPopover', () => ({
  __esModule: true,
  default: ({
    picks,
    fallbackAddress,
  }: {
    picks: { question: string; choice: string }[];
    fallbackAddress?: string;
  }) => (
    <div data-testid="picks-popover" data-fallback={fallbackAddress ?? ''}>
      {picks.map((p) => `${p.question}: ${p.choice}`).join(', ')}
    </div>
  ),
}));

vi.mock('~/components/shared/EnsAvatar', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('~/components/shared/AddressDisplay', () => ({
  __esModule: true,
  AddressDisplay: ({ address }: { address: string }) => <span>{address}</span>,
}));

vi.mock('~/components/positions/PredictionDialog', () => ({
  __esModule: true,
  default: (props: {
    open: boolean;
    prediction: { predictionId: string } | null;
  }) =>
    props.open ? (
      <div
        data-testid="prediction-dialog"
        data-prediction-id={props.prediction?.predictionId ?? ''}
      />
    ) : null,
}));

vi.mock('~/components/shared/OgShareDialog', () => ({
  __esModule: true,
  default: (props: { imageSrc: string; open?: boolean }) => (
    <div data-testid="og-share-dialog" data-image-src={props.imageSrc} />
  ),
}));

// The real filter toolbar drags in Radix popover/dropdown portals; the table
// only needs a search input plus the default filter state shape.
vi.mock('~/components/positions/ActivityTableFilters', () => {
  type FilterState = {
    searchTerm: string;
    status: string[];
    valueRange: [number, number];
    dateRange: [number, number];
    activityType: string;
  };
  const getDefaultActivityFilterState = (): FilterState => ({
    searchTerm: '',
    status: [],
    valueRange: [0, Infinity],
    dateRange: [-Infinity, Infinity],
    activityType: 'all',
  });
  const ActivityTableFilters = ({
    filters,
    onFiltersChange,
  }: {
    filters: FilterState;
    onFiltersChange: (f: FilterState) => void;
  }) => (
    <input
      aria-label="Search activity"
      value={filters.searchTerm}
      onChange={(e) =>
        onFiltersChange({ ...filters, searchTerm: e.target.value })
      }
    />
  );
  return {
    __esModule: true,
    ActivityTableFilters,
    getDefaultActivityFilterState,
    default: ActivityTableFilters,
  };
});

import ActivityTable from '~/components/positions/ActivityTable';

// ---------------------------------------------------------------------------
// Fixtures (domain shapes from useAccountActivity / usePositions)
// ---------------------------------------------------------------------------

const WEI = 10n ** 18n;
const NOW_SEC = Math.floor(Date.now() / 1000);

function makePick(
  conditionId: string,
  question: string,
  overrides: Partial<PickData> = {}
): PickData {
  return {
    id: `0xpc1:${conditionId}`,
    pickConfigId: '0xpc1',
    conditionResolver: '0xresolver',
    conditionId,
    predictedOutcome: 1,
    condition: {
      id: conditionId,
      shortName: null,
      question,
      endTime: NOW_SEC + 7 * 86400,
      resolver: '0xresolver',
      category: { slug: 'crypto' },
      settled: false,
      resolvedToYes: false,
      nonDecisive: false,
      estimatedPrice: 0.5,
    },
    ...overrides,
  };
}

function makePickConfig(
  overrides: Partial<PickConfigData> = {}
): PickConfigData {
  return {
    id: '0xpc1',
    chainId: 8453,
    marketAddress: '0xescrow',
    totalPredictorCollateral: (1n * WEI).toString(),
    totalCounterpartyCollateral: (2n * WEI).toString(),
    claimedPredictorCollateral: '0',
    claimedCounterpartyCollateral: '0',
    resolved: false,
    result: 'UNRESOLVED',
    resolvedAt: null,
    predictorToken: '0xpredictortoken',
    counterpartyToken: '0xcounterpartytoken',
    endsAt: NOW_SEC + 7 * 86400,
    isLegacy: false,
    picks: [makePick('0xcond1', 'Will ETH hit 5k?')],
    ...overrides,
  };
}

function makePrediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    predictionId: '0xpred1',
    chainId: 8453,
    marketAddress: '0xescrow',
    predictor: '0xaaa1111111111111111111111111111111111111',
    counterparty: '0xbbb2222222222222222222222222222222222222',
    predictorToken: '0xpredictortoken',
    counterpartyToken: '0xcounterpartytoken',
    predictorCollateral: (1n * WEI).toString(),
    counterpartyCollateral: (2n * WEI).toString(),
    settled: false,
    result: 'UNRESOLVED',
    createTxHash: '0xtx1',
    createdAt: '2026-06-01T00:00:00.000Z',
    isLegacy: false,
    pickConfig: makePickConfig(),
    ...overrides,
  };
}

function makePredictionItem(
  overrides: Partial<PredictionActivity> = {}
): PredictionActivity {
  const prediction = overrides.prediction ?? makePrediction();
  return {
    type: 'prediction',
    timestamp: Date.now() - 5 * 60 * 1000,
    prediction,
    pickConfig: prediction.pickConfig ?? null,
    isPredictorSide: true,
    ...overrides,
  };
}

function makeTradeItem(overrides: Partial<TradeActivity> = {}): TradeActivity {
  return {
    type: 'trade',
    timestamp: Date.now() - 10 * 60 * 1000,
    trade: {
      tradeHash: '0xtrade1',
      chainId: 8453,
      token: '0xpredictortoken',
      collateral: '0xcollateral',
      seller: '0xccc3333333333333333333333333333333333333',
      buyer: '0xddd4444444444444444444444444444444444444',
      tokenAmount: (2n * WEI).toString(),
      price: (1n * WEI).toString(),
      txHash: '0xtx2',
      blockNumber: 42,
      executedAt: NOW_SEC - 600,
    },
    pickConfig: makePickConfig(),
    isBuyer: false,
    ...overrides,
  };
}

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    items: [] as ActivityItem[],
    isLoading: false,
    isFetchingMore: false,
    hasMore: false,
    fetchMore: vi.fn(),
    pendingCount: 0,
    pendingItems: [] as ActivityItem[],
    revealPending: vi.fn(),
    ...overrides,
  };
}

const scrollIntoViewMock = vi.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoViewMock;
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAccountActivity.mockReturnValue(hookState());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivityTable', () => {
  it('shows the loading state while the feed loads', () => {
    mockUseAccountActivity.mockReturnValue(hookState({ isLoading: true }));
    render(<ActivityTable />);

    expect(screen.getByText('Loading activity…')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the empty state when the feed has no items', () => {
    render(<ActivityTable />);

    expect(screen.getByText('No activity found')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders a pending prediction row with picks, parties, value and countdown status', () => {
    mockUseAccountActivity.mockReturnValue(
      hookState({ items: [makePredictionItem()] })
    );
    render(<ActivityTable />);

    // Column headers.
    for (const header of [
      'Date',
      'Type',
      'Position',
      'Parties',
      'Total',
      'Status',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: header })
      ).toBeInTheDocument();
    }

    expect(screen.getByText('Prediction')).toBeInTheDocument();
    // Relative date from the 5-minutes-ago timestamp.
    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
    // Picks rendered through toPicks: condition question + Yes choice.
    expect(screen.getByTestId('picks-summary')).toHaveTextContent(
      'Will ETH hit 5k?: Yes'
    );
    // Both parties with their collateral.
    expect(
      screen.getByText('0xaaa1111111111111111111111111111111111111')
    ).toBeInTheDocument();
    expect(
      screen.getByText('0xbbb2222222222222222222222222222222222222')
    ).toBeInTheDocument();
    // Value = predictor + counterparty collateral = 3.00.
    expect(screen.getByText('3.00')).toBeInTheDocument();
    // Unsettled with a future endsAt → countdown status.
    expect(screen.getByText(/ENDS/)).toBeInTheDocument();
  });

  it('renders settled prediction status variants', () => {
    const won = makePredictionItem({
      prediction: makePrediction({
        predictionId: '0xpredWin',
        settled: true,
        result: 'PREDICTOR_WINS',
      }),
    });
    const lost = makePredictionItem({
      prediction: makePrediction({
        predictionId: '0xpredLose',
        settled: true,
        result: 'COUNTERPARTY_WINS',
      }),
    });
    mockUseAccountActivity.mockReturnValue(hookState({ items: [won, lost] }));
    render(<ActivityTable />);

    expect(screen.getByText('Predictor won')).toBeInTheDocument();
    expect(screen.getByText('Counterparty won')).toBeInTheDocument();
  });

  it('shows the winner profit under settled won statuses', () => {
    // Predictor staked 1, counterparty staked 2.
    const won = makePredictionItem({
      prediction: makePrediction({
        predictionId: '0xpredWin',
        settled: true,
        result: 'PREDICTOR_WINS',
      }),
    });
    const lost = makePredictionItem({
      prediction: makePrediction({
        predictionId: '0xpredLose',
        settled: true,
        result: 'COUNTERPARTY_WINS',
      }),
    });
    mockUseAccountActivity.mockReturnValue(hookState({ items: [won, lost] }));
    render(<ActivityTable />);

    // Predictor won: profit = counterparty stake (2.00), 200% of own 1.00 stake.
    const predictorProfit = screen.getByTestId('status-profit-0xpredWin');
    expect(predictorProfit).toHaveTextContent('+2.00 USDe (200%)');
    // Counterparty won: profit = predictor stake (1.00), 50% of own 2.00 stake.
    const counterpartyProfit = screen.getByTestId('status-profit-0xpredLose');
    expect(counterpartyProfit).toHaveTextContent('+1.00 USDe (50%)');
  });

  it('shows no profit line for unsettled predictions', () => {
    mockUseAccountActivity.mockReturnValue(
      hookState({ items: [makePredictionItem()] })
    );
    render(<ActivityTable />);

    expect(screen.queryByTestId(/status-profit/)).not.toBeInTheDocument();
  });

  it("shows 'Pending' for an unsettled prediction whose end time has passed", () => {
    const item = makePredictionItem({
      prediction: makePrediction({
        pickConfig: makePickConfig({ endsAt: NOW_SEC - 3600 }),
      }),
    });
    mockUseAccountActivity.mockReturnValue(
      hookState({
        items: [{ ...item, pickConfig: item.prediction.pickConfig }],
      })
    );
    render(<ActivityTable />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByText(/ENDS/)).not.toBeInTheDocument();
  });

  it('renders a trade row with buyer/seller parties and a neutral status in global mode', () => {
    mockUseAccountActivity.mockReturnValue(
      hookState({ items: [makeTradeItem()] })
    );
    render(<ActivityTable />);

    expect(screen.getByText('buyer')).toBeInTheDocument();
    expect(screen.getByText('seller')).toBeInTheDocument();
    expect(
      screen.getByText('0xddd4444444444444444444444444444444444444')
    ).toBeInTheDocument();
    // Price 1.00 and the amount × unit-price breakdown.
    expect(screen.getByText('1.00')).toBeInTheDocument();
    expect(screen.getByText('2.00')).toBeInTheDocument();
    // Without an account the status column shows the neutral 'Trade' label.
    expect(screen.getAllByText('Trade')).toHaveLength(2); // badge + status
    expect(screen.getByTestId('picks-popover')).toHaveAttribute(
      'data-fallback',
      '0xpredictortoken'
    );
  });

  it("shows 'Bought' for the account's buy-side trades in account mode", () => {
    mockUseAccountActivity.mockReturnValue(
      hookState({ items: [makeTradeItem({ isBuyer: true })] })
    );
    render(
      <ActivityTable account="0xddd4444444444444444444444444444444444444" />
    );

    expect(screen.getByText('Bought')).toBeInTheDocument();
  });

  it('omits hidden columns from the header and the rows', () => {
    mockUseAccountActivity.mockReturnValue(
      hookState({ items: [makePredictionItem()] })
    );
    render(<ActivityTable hiddenColumns={['status']} />);

    expect(
      screen.queryByRole('columnheader', { name: 'Status' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/ENDS/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Share' })
    ).not.toBeInTheDocument();
    // Remaining columns still render.
    expect(
      screen.getByRole('columnheader', { name: 'Position' })
    ).toBeInTheDocument();
  });

  it('hides the filter toolbar with hideFilters', () => {
    mockUseAccountActivity.mockReturnValue(
      hookState({ items: [makePredictionItem()] })
    );
    render(<ActivityTable hideFilters />);

    expect(screen.queryByLabelText('Search activity')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows the no-matches empty state when the search filter excludes every row', () => {
    mockUseAccountActivity.mockReturnValue(
      hookState({ items: [makePredictionItem()] })
    );
    render(<ActivityTable />);

    fireEvent.change(screen.getByLabelText('Search activity'), {
      target: { value: 'zzz-no-such-question' },
    });

    expect(
      screen.getByText('No activity matches your filters')
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('surfaces held-back live items in the banner and reveals them on click', () => {
    const revealPending = vi.fn();
    mockUseAccountActivity.mockReturnValue(
      hookState({
        items: [makePredictionItem()],
        pendingItems: [
          makePredictionItem({
            prediction: makePrediction({ predictionId: '0xpredNew1' }),
          }),
          makeTradeItem({
            trade: { ...makeTradeItem().trade, tradeHash: '0xtradeNew1' },
          }),
        ],
        pendingCount: 2,
        revealPending,
      })
    );
    render(<ActivityTable enableLive />);

    const banner = screen.getByRole('button', { name: /2 new activities/ });
    fireEvent.click(banner);

    expect(revealPending).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it('hides the banner when the active filters would hide every pending item', () => {
    mockUseAccountActivity.mockReturnValue(
      hookState({
        items: [makePredictionItem()], // question: Will ETH hit 5k?
        pendingItems: [
          makePredictionItem({
            prediction: makePrediction({
              predictionId: '0xpredBtc',
              pickConfig: makePickConfig({
                picks: [makePick('0xcondBtc', 'Will BTC hit 200k?')],
              }),
            }),
          }),
        ].map((item) => ({
          ...item,
          pickConfig: item.prediction.pickConfig ?? null,
        })),
        pendingCount: 1,
      })
    );
    render(<ActivityTable enableLive />);

    // Unfiltered: banner counts the BTC pending item.
    expect(
      screen.getByRole('button', { name: /1 new activity/ })
    ).toBeInTheDocument();

    // Search matches the visible ETH row but not the pending BTC item.
    fireEvent.change(screen.getByLabelText('Search activity'), {
      target: { value: 'ETH' },
    });

    expect(
      screen.queryByRole('button', { name: /new activit/ })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('picks-summary')).toBeInTheDocument();
  });

  it('opens the prediction dialog when the picks summary is clicked', () => {
    mockUseAccountActivity.mockReturnValue(
      hookState({ items: [makePredictionItem()] })
    );
    render(<ActivityTable />);

    expect(screen.queryByTestId('prediction-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('picks-summary'));

    expect(screen.getByTestId('prediction-dialog')).toHaveAttribute(
      'data-prediction-id',
      '0xpred1'
    );
  });

  it('renders the infinite-scroll footer only when more pages exist', () => {
    mockUseAccountActivity.mockReturnValue(
      hookState({ items: [makePredictionItem()], hasMore: true })
    );
    const { rerender } = render(<ActivityTable />);
    expect(screen.getByText('Scroll to load more')).toBeInTheDocument();

    mockUseAccountActivity.mockReturnValue(
      hookState({
        items: [makePredictionItem()],
        hasMore: true,
        isFetchingMore: true,
      })
    );
    rerender(<ActivityTable />);
    expect(screen.getByText('Loading more activity…')).toBeInTheDocument();

    mockUseAccountActivity.mockReturnValue(
      hookState({ items: [makePredictionItem()], hasMore: false })
    );
    rerender(<ActivityTable />);
    expect(screen.queryByText('Scroll to load more')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Loading more activity…')
    ).not.toBeInTheDocument();
  });

  it('forwards its scoping props to useAccountActivity', () => {
    render(
      <ActivityTable
        account="0xddd4444444444444444444444444444444444444"
        filterPickConfigId="0xpc1"
        filterToken="0xpredictortoken"
        pageSize={5}
        enableLive
      />
    );

    expect(mockUseAccountActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        account: '0xddd4444444444444444444444444444444444444',
        pickConfigId: '0xpc1',
        token: '0xpredictortoken',
        pageSize: 5,
        activityType: 'all',
        enableLive: true,
      })
    );
  });
});
