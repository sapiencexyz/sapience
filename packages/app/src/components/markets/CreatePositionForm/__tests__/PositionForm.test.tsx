import { vi, type Mock } from 'vitest';
import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import type { UseFormReturn } from 'react-hook-form';

// ---------------------------------------------------------------------------
// Mocks — hoisted above component import
// ---------------------------------------------------------------------------

const {
  mockUseAccount,
  mockUseConnectedWallet,
  mockUseSession,
  mockUseCreatePositionContext,
  mockUseCollateralBalanceContext,
  mockUseSapience,
  mockState,
} = vi.hoisted(() => ({
  mockUseAccount: vi.fn(),
  mockUseConnectedWallet: vi.fn(),
  mockUseSession: vi.fn(),
  mockUseCreatePositionContext: vi.fn(),
  mockUseCollateralBalanceContext: vi.fn(),
  mockUseSapience: vi.fn(),
  mockState: { positionSize: '10' },
}));

// wagmi
vi.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
  useReadContract: () => ({ data: undefined, isLoading: false }),
}));

// useConnectedWallet
vi.mock('~/hooks/useConnectedWallet', () => ({
  useConnectedWallet: () => mockUseConnectedWallet(),
}));

// SessionContext
vi.mock('~/lib/context/SessionContext', () => ({
  useSession: () => mockUseSession(),
}));

// CreatePositionContext
vi.mock('~/lib/context/CreatePositionContext', () => ({
  useCreatePositionContext: () => mockUseCreatePositionContext(),
}));

// CollateralBalanceContext
vi.mock('~/lib/context/CollateralBalanceContext', () => ({
  useCollateralBalanceContext: () => mockUseCollateralBalanceContext(),
}));

// ConnectDialogContext
vi.mock('~/lib/context/ConnectDialogContext', () => ({
  useConnectDialog: () => ({ openConnectDialog: vi.fn() }),
}));

// SapienceProvider (for useRestrictedJurisdiction)
vi.mock('~/lib/context/SapienceProvider', () => ({
  useSapience: () => mockUseSapience(),
}));

// SponsorStatus
vi.mock('~/hooks/sponsorship/useSponsorStatus', () => ({
  useSponsorStatus: () => ({
    isSponsored: false,
    sponsorAddress: null,
    remainingBudget: 0n,
    maxEntryPriceBps: 0n,
    matchLimit: 0n,
    requiredCounterparty: null,
  }),
}));

// SponsorshipActivation
vi.mock('~/hooks/sponsorship/useSponsorshipActivation', () => ({
  useSponsorshipActivation: () => ({
    sponsorshipActivated: false,
    awaitingSponsoredBid: false,
    activateSponsor: vi.fn(),
    clearAwaiting: vi.fn(),
    resetSponsor: vi.fn(),
  }),
}));

// toast
vi.mock('@sapience/ui/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// SDK
vi.mock('@sapience/sdk', () => ({
  generateRandomNonce: () => BigInt(12345),
  COLLATERAL_SYMBOLS: {},
  encodePythBinaryOptionOutcomes: vi.fn(),
  encodePolymarketPredictedOutcomes: vi.fn(),
  getPythMarketId: vi.fn(),
}));

vi.mock('@sapience/sdk/constants', () => ({
  COLLATERAL_SYMBOLS: { 42161: 'USDe' },
  CHAIN_ID_ETHEREAL: 5064014,
  CHAIN_ID_ETHEREAL_TESTNET: 13374202,
  DEFAULT_CHAIN_ID: 42161,
}));

vi.mock('~/lib/constants', () => ({
  PREFERRED_ESTIMATE_QUOTER: '0xe02eD37D0458c8999943CbE6D1c9DB597f3EE572',
}));

vi.mock('@sapience/sdk/contracts', () => ({
  pythConditionResolver: {},
  conditionalTokensConditionResolver: {},
  collateralToken: { 42161: { address: '0xCollateral' } },
}));

// buildAuctionPayload — return minimal valid payloads
vi.mock('~/lib/auction/buildAuctionPayload', () => ({
  buildAuctionStartPayload: vi.fn().mockReturnValue({
    resolver: '0xResolver',
    predictedOutcomes: '0x01',
  }),
  buildPythAuctionStartPayload: vi.fn().mockReturnValue({
    resolver: '0xPythResolver',
    predictedOutcomes: '0x02',
    escrowPicks: [],
  }),
}));

// bidLogger — silence logs in tests
vi.mock('~/lib/auction/bidLogger', () => ({
  logPositionForm: vi.fn(),
  formatBidForLog: vi.fn().mockReturnValue('mock-bid-log'),
}));

// Stub heavy child components to keep tests fast
vi.mock('~/components/markets/forms', () => ({
  PositionSizeInput: () => <div data-testid="position-size-input" />,
}));

vi.mock('~/components/markets/forms/shared/BidDisplay', () => {
  const BidDisplay = (props: Record<string, unknown>) => (
    <div
      data-testid="bid-display"
      data-show-request-bids-button={String(props.showRequestBidsButton)}
      data-show-add-predictions-hint={String(props.showAddPredictionsHint)}
      data-is-auction-pending={String(props.isAuctionPending)}
      data-has-best-bid={String(!!props.bestBid)}
      data-has-estimate-bid={String(!!props.estimateBid)}
      data-estimate-counterparty={
        (props.estimateBid as { counterparty?: string } | null)?.counterparty ??
        ''
      }
      data-is-submit-disabled={String(props.isSubmitDisabled)}
    >
      <button
        data-testid="initiate-auction-btn"
        onClick={props.onRequestBids as () => void}
      />
    </div>
  );
  BidDisplay.displayName = 'BidDisplay';
  return { __esModule: true, default: BidDisplay };
});

vi.mock('~/components/markets/ConditionTitleLink', () => {
  const ConditionTitleLink = () => <span data-testid="condition-title-link" />;
  ConditionTitleLink.displayName = 'ConditionTitleLink';
  return { __esModule: true, default: ConditionTitleLink };
});

vi.mock('~/components/shared/PythMarketBadge', () => ({
  PythMarketBadge: () => <div data-testid="pyth-market-badge" />,
}));

vi.mock('~/components/shared/RestrictedJurisdictionBanner', () => {
  const Banner = (props: Record<string, unknown>) => (
    <div data-testid="restricted-banner" data-show={String(props.show)} />
  );
  Banner.displayName = 'RestrictedJurisdictionBanner';
  return { __esModule: true, default: Banner };
});

vi.mock('../SponsorshipIndicator', () => {
  const SI = () => null;
  SI.displayName = 'SponsorshipIndicator';
  return { __esModule: true, default: SI };
});

// lucide-react
vi.mock('lucide-react', () => ({
  Info: () => <span data-testid="info-icon" />,
}));

// framer-motion — passthrough
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop === 'string') {
          return React.forwardRef(
            (
              p: Record<string, unknown> & { children?: React.ReactNode },
              ref: React.Ref<HTMLElement>
            ) => React.createElement(prop, { ...p, ref })
          );
        }
        return undefined;
      },
    }
  ),
}));

// viem — only what we need
vi.mock('viem', () => ({
  parseUnits: (value: string, decimals: number) =>
    BigInt(Math.round(Number(value) * 10 ** decimals)),
  formatUnits: (value: bigint, decimals: number) =>
    (Number(value) / 10 ** decimals).toString(),
}));

// @sapience/ui — stub UI components used by PositionForm
vi.mock('@sapience/ui', () => ({
  PredictionListItem: ({ prediction }: { prediction: { id: string } }) => (
    <div data-testid={`prediction-${prediction.id}`} />
  ),
}));

vi.mock('@sapience/ui/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('~/lib/theme/categoryIcons', () => ({
  getCategoryIcon: () => () => <span data-testid="category-icon" />,
}));

vi.mock('~/lib/utils/categoryStyle', () => ({
  getCategoryStyle: () => ({ color: '#fff' }),
  getColorWithAlpha: () => 'rgba(255,255,255,0.1)',
}));

vi.mock('~/lib/utils/positionFormUtils', () => ({
  getMaxPositionSize: (balance: number) => balance,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import PositionForm from '../PositionForm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeSelection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sel-1',
    conditionId: '0xCondition1',
    question: 'Will X happen?',
    prediction: true,
    categorySlug: 'crypto',
    resolverAddress: '0xResolver1',
    ...overrides,
  };
}

function makeFormMethods(
  positionSize = '10',
  errors: Record<string, unknown> = {}
): UseFormReturn<{
  positionSize: string;
  limitAmount: string | number;
  positions: Record<
    string,
    { predictionValue: string; positionSize: string; isFlipped?: boolean }
  >;
}> {
  const watchValues: Record<string, string> = { positionSize };
  return {
    control: { _subjects: {} } as unknown as UseFormReturn['control'],
    formState: { errors } as unknown as UseFormReturn['formState'],
    getValues: ((name?: string) =>
      name ? watchValues[name] : watchValues) as UseFormReturn['getValues'],
    // useWatch is module-mocked below, so these aren't directly called
  } as unknown as UseFormReturn<{
    positionSize: string;
    limitAmount: string | number;
    positions: Record<
      string,
      { predictionValue: string; positionSize: string; isFlipped?: boolean }
    >;
  }>;
}

// react-hook-form: mock useWatch to return positionSize
vi.mock('react-hook-form', () => ({
  useWatch: () => mockState.positionSize,
  FormProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Default mock values
function setDefaults() {
  mockState.positionSize = '10';
  mockUseAccount.mockReturnValue({ address: '0xUser1' });
  mockUseConnectedWallet.mockReturnValue({
    hasConnectedWallet: true,
    ready: true,
    connectedWallet: { address: '0xUser1' },
  });
  mockUseSession.mockReturnValue({
    effectiveAddress: '0xSmartAccount',
    isUsingSmartAccount: true,
    signMessage: vi.fn(), // willUseSessionSigning = true
  });
  mockUseCreatePositionContext.mockReturnValue({
    selections: [
      makeSelection(),
      makeSelection({ id: 'sel-2', conditionId: '0xCondition2' }),
    ],
    removeSelection: vi.fn(),
    getPolymarketPicks: () => [
      {
        conditionResolver: '0xResolver1',
        conditionId: '0xCondition1',
        predictedOutcome: 1,
      },
      {
        conditionResolver: '0xResolver1',
        conditionId: '0xCondition2',
        predictedOutcome: 1,
      },
    ],
  });
  mockUseCollateralBalanceContext.mockReturnValue({
    balance: 100,
    isLoading: false,
  });
  mockUseSapience.mockReturnValue({
    permitData: { permitted: true },
    isPermitLoading: false,
    permitError: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PositionForm', () => {
  let mockRequestQuotes: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    setDefaults();
    mockRequestQuotes = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function renderForm(overrides: Record<string, unknown> = {}) {
    return render(
      <PositionForm
        methods={makeFormMethods()}
        onSubmit={vi.fn()}
        isSubmitting={false}
        chainId={42161}
        requestQuotes={mockRequestQuotes}
        collateralDecimals={18}
        {...overrides}
      />
    );
  }

  // =========================================================================
  // A. Auto-trigger behavior (session mode)
  // =========================================================================
  describe('A. Auto-trigger (session mode)', () => {
    beforeEach(() => {
      // willUseSessionSigning = true (default from setDefaults)
    });

    it('auto-fires auction after 300ms debounce when predictions + position size valid', async () => {
      renderForm();
      expect(mockRequestQuotes).not.toHaveBeenCalled();

      // triggerAuctionRequest is async (awaits refetchTakerNonce) so flush microtasks too
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockRequestQuotes).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire when position size is 0', () => {
      mockState.positionSize = '0';
      renderForm();

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockRequestQuotes).not.toHaveBeenCalled();
    });

    it('does NOT fire when position size exceeds balance', () => {
      mockState.positionSize = '200';
      mockUseCollateralBalanceContext.mockReturnValue({
        balance: 100,
        isLoading: false,
      });
      renderForm();

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockRequestQuotes).not.toHaveBeenCalled();
    });

    it('does NOT fire when form has errors', () => {
      renderForm({
        methods: makeFormMethods('10', {
          positionSize: { message: 'too large' },
        }),
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockRequestQuotes).not.toHaveBeenCalled();
    });

    it('does NOT fire when balance is still loading', () => {
      mockUseCollateralBalanceContext.mockReturnValue({
        balance: 0,
        isLoading: true,
      });
      renderForm();

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockRequestQuotes).not.toHaveBeenCalled();
    });

    it('does NOT fire when there are no predictions', () => {
      mockUseCreatePositionContext.mockReturnValue({
        selections: [],
        removeSelection: vi.fn(),
        getPolymarketPicks: () => [],
      });
      renderForm();

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockRequestQuotes).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // B. Manual-trigger behavior (non-session mode)
  // =========================================================================
  describe('B. Manual-trigger (non-session mode)', () => {
    beforeEach(() => {
      // Connected wallet, no session signing → manual mode
      mockUseSession.mockReturnValue({
        effectiveAddress: null,
        isUsingSmartAccount: false,
        signMessage: null,
      });
    });

    it('does NOT auto-fire on form changes', () => {
      renderForm();

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockRequestQuotes).not.toHaveBeenCalled();
    });

    it('calls requestQuotes when INITIATE AUCTION is clicked', async () => {
      const { getByTestId } = renderForm();

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockRequestQuotes).not.toHaveBeenCalled();

      // Click the INITIATE AUCTION button
      await act(async () => {
        fireEvent.click(getByTestId('initiate-auction-btn'));
      });

      expect(mockRequestQuotes).toHaveBeenCalledTimes(1);
    });

    it('shows showRequestBidsButton=true (INITIATE AUCTION button) since no auction was auto-fired', () => {
      const { getByTestId } = renderForm();

      act(() => {
        vi.advanceTimersByTime(500);
      });

      const bidDisplay = getByTestId('bid-display');
      expect(bidDisplay.dataset.showRequestBidsButton).toBe('true');
    });
  });

  // =========================================================================
  // C. Logged-out behavior
  // =========================================================================
  describe('C. Logged-out (auto-logged-out mode)', () => {
    beforeEach(() => {
      mockUseConnectedWallet.mockReturnValue({
        hasConnectedWallet: false,
        ready: true,
        connectedWallet: undefined,
      });
      mockUseAccount.mockReturnValue({ address: undefined });
      mockUseSession.mockReturnValue({
        effectiveAddress: null,
        isUsingSmartAccount: false,
        signMessage: null,
      });
    });

    it('auto-fires auction for estimate display', async () => {
      renderForm();

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockRequestQuotes).toHaveBeenCalledTimes(1);
    });

    it('fires even when position size exceeds "balance" (logged-out has no balance)', async () => {
      mockState.positionSize = '999999';
      renderForm();

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockRequestQuotes).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // D. Single-prediction hint behavior
  // =========================================================================
  describe('D. Single-prediction hint', () => {
    beforeEach(() => {
      mockUseCreatePositionContext.mockReturnValue({
        selections: [makeSelection()],
        removeSelection: vi.fn(),
        getPolymarketPicks: () => [
          {
            conditionResolver: '0xResolver1',
            conditionId: '0xCondition1',
            predictedOutcome: 1,
          },
        ],
      });
    });

    it('shows showAddPredictionsHint when 1 selection and no bestBid/stickyEstimate', () => {
      const { getByTestId } = renderForm();

      act(() => {
        vi.advanceTimersByTime(300);
      });

      const bidDisplay = getByTestId('bid-display');
      expect(bidDisplay.dataset.showAddPredictionsHint).toBe('true');
    });

    it('still fires auction silently with 1 selection', async () => {
      renderForm();

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockRequestQuotes).toHaveBeenCalledTimes(1);
    });

    it('hides hint when bestBid arrives', async () => {
      const validBid = {
        counterparty: '0xMaker',
        counterpartyCollateral: '5000000000000000000',
        counterpartyDeadline: Math.floor(Date.now() / 1000) + 60,
        counterpartyNonce: 1,
        validationStatus: 'valid' as const,
        counterpartySignature: '0xSig',
        counterpartyChainId: 42161,
        predictorCollateral: '10000000000000000000',
      };

      // Render with no bids initially
      const { getByTestId, rerender } = renderForm();

      // Fire auto-auction so currentRequestKeyRef is set (enables bid acceptance)
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // Hint shown before bids arrive
      expect(getByTestId('bid-display').dataset.showAddPredictionsHint).toBe(
        'true'
      );

      // Now rerender with a valid bid (stable reference)
      const bidsWithValid = [validBid];
      await act(async () => {
        rerender(
          <PositionForm
            methods={makeFormMethods()}
            onSubmit={vi.fn()}
            isSubmitting={false}
            chainId={42161}
            requestQuotes={mockRequestQuotes}
            collateralDecimals={18}
            bids={bidsWithValid}
          />
        );
      });

      // Advance for the 1s interval tick (nowMs update to check expiration)
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(getByTestId('bid-display').dataset.showAddPredictionsHint).toBe(
        'false'
      );
    });

    it('keeps hint visible when stickyEstimateBid arrives for single pick', async () => {
      const estimateBid = {
        counterparty: '0xMaker',
        counterpartyCollateral: '5000000000000000000',
        counterpartyDeadline: Math.floor(Date.now() / 1000) + 60,
        counterpartyNonce: 1,
        validationStatus: 'invalid' as const,
        counterpartySignature: '0xSig',
        counterpartyChainId: 42161,
        predictorCollateral: '10000000000000000000',
      };

      // Render with no bids initially
      const { getByTestId, rerender } = renderForm();

      // Fire auto-auction so currentRequestKeyRef is set (enables bid acceptance)
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(getByTestId('bid-display').dataset.showAddPredictionsHint).toBe(
        'true'
      );

      // Rerender with an estimate bid (stable reference; only invalid bid → becomes stickyEstimate)
      const bidsWithEstimate = [estimateBid];
      await act(async () => {
        rerender(
          <PositionForm
            methods={makeFormMethods()}
            onSubmit={vi.fn()}
            isSubmitting={false}
            chainId={42161}
            requestQuotes={mockRequestQuotes}
            collateralDecimals={18}
            bids={bidsWithEstimate}
          />
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // For single picks, prefer "add more predictions" over showing estimate
      expect(getByTestId('bid-display').dataset.showAddPredictionsHint).toBe(
        'true'
      );
    });
  });

  // =========================================================================
  // E. Estimator bid behavior (logged-out estimates)
  // =========================================================================
  describe('E. Estimator bid behavior', () => {
    const ESTIMATOR_ADDRESS = '0xe02eD37D0458c8999943CbE6D1c9DB597f3EE572';

    function makeEstimatorBid(overrides: Record<string, unknown> = {}) {
      return {
        counterparty: ESTIMATOR_ADDRESS,
        counterpartyCollateral: '5000000000000000000',
        counterpartyDeadline: 1, // sentinel value — always "expired" by normal check
        counterpartyNonce: 1,
        validationStatus: 'valid' as const,
        counterpartySignature: '0xSig',
        counterpartyChainId: 42161,
        predictorCollateral: '10000000000000000000',
        ...overrides,
      };
    }

    beforeEach(() => {
      // Logged-out user setup
      mockUseConnectedWallet.mockReturnValue({
        hasConnectedWallet: false,
        ready: true,
        connectedWallet: undefined,
      });
      mockUseAccount.mockReturnValue({ address: undefined });
      mockUseSession.mockReturnValue({
        effectiveAddress: null,
        isUsingSmartAccount: false,
        signMessage: null,
      });
    });

    it('shows estimator bid as estimateBid despite deadline=1', async () => {
      const estimatorBid = makeEstimatorBid();

      const { getByTestId, rerender } = renderForm();

      // Fire auto-auction so currentRequestKeyRef is set
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // Rerender with estimator bid
      const bidsWithEstimator = [estimatorBid];
      await act(async () => {
        rerender(
          <PositionForm
            methods={makeFormMethods()}
            onSubmit={vi.fn()}
            isSubmitting={false}
            chainId={42161}
            requestQuotes={mockRequestQuotes}
            collateralDecimals={18}
            bids={bidsWithEstimator}
          />
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      const bidDisplay = getByTestId('bid-display');
      // Should show as estimate (not best bid)
      expect(bidDisplay.dataset.hasBestBid).toBe('false');
      expect(bidDisplay.dataset.hasEstimateBid).toBe('true');
      expect(bidDisplay.dataset.estimateCounterparty?.toLowerCase()).toBe(
        ESTIMATOR_ADDRESS.toLowerCase()
      );
    });

    it('does not clear sticky estimate when only estimator bids exist', async () => {
      const estimatorBid = makeEstimatorBid();

      const { getByTestId, rerender } = renderForm();

      // Fire auto-auction so currentRequestKeyRef is set
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // Inject estimator bid
      const bidsWithEstimator = [estimatorBid];
      await act(async () => {
        rerender(
          <PositionForm
            methods={makeFormMethods()}
            onSubmit={vi.fn()}
            isSubmitting={false}
            chainId={42161}
            requestQuotes={mockRequestQuotes}
            collateralDecimals={18}
            bids={bidsWithEstimator}
          />
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Estimate should be present
      expect(getByTestId('bid-display').dataset.hasEstimateBid).toBe('true');

      // Advance several seconds — sticky estimate should remain because
      // estimator bids are exempt from expiry clearing
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(getByTestId('bid-display').dataset.hasEstimateBid).toBe('true');
    });

    it('sets isAuctionPending=false when estimator estimate arrives', async () => {
      const estimatorBid = makeEstimatorBid();

      const { getByTestId, rerender } = renderForm();

      // Fire auto-auction
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // While waiting for bids, isAuctionPending should be true
      expect(getByTestId('bid-display').dataset.isAuctionPending).toBe('true');

      // Inject estimator bid
      const bidsWithEstimator = [estimatorBid];
      await act(async () => {
        rerender(
          <PositionForm
            methods={makeFormMethods()}
            onSubmit={vi.fn()}
            isSubmitting={false}
            chainId={42161}
            requestQuotes={mockRequestQuotes}
            collateralDecimals={18}
            bids={bidsWithEstimator}
          />
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Now isAuctionPending should be false (stickyEstimateBid is set)
      expect(getByTestId('bid-display').dataset.isAuctionPending).toBe('false');
    });

    it('does not restart cooldown for estimator bids', async () => {
      const estimatorBid = makeEstimatorBid();

      const { getByTestId, rerender } = renderForm();

      // Fire auto-auction (sets lastQuoteRequestMs at fake time ~300)
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // Inject estimator bid mid-cooldown
      const bidsWithEstimator = [estimatorBid];
      await act(async () => {
        rerender(
          <PositionForm
            methods={makeFormMethods()}
            onSubmit={vi.fn()}
            isSubmitting={false}
            chainId={42161}
            requestQuotes={mockRequestQuotes}
            collateralDecimals={18}
            bids={bidsWithEstimator}
          />
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Advance well past the 15s cooldown from the original request.
      // nowMs updates at 1s interval boundaries, so use generous timing.
      // If cooldown was NOT restarted by estimator bid, it expires ~15.3s
      // from time 0. Advance to 17s total to be safe.
      await act(async () => {
        vi.advanceTimersByTime(17000);
      });

      // The original cooldown should have expired (15s from request at ~300ms)
      // showRequestBidsButton = !bestBid && !recentlyRequested → true
      expect(getByTestId('bid-display').dataset.showRequestBidsButton).toBe(
        'true'
      );
    });

    it('prefers regular valid bids over estimator bids', async () => {
      const estimatorBid = makeEstimatorBid();
      const regularBid = {
        counterparty: '0xRealMaker',
        counterpartyCollateral: '8000000000000000000',
        counterpartyDeadline: Math.floor(Date.now() / 1000) + 60,
        counterpartyNonce: 1,
        validationStatus: 'valid' as const,
        counterpartySignature: '0xSig',
        counterpartyChainId: 42161,
        predictorCollateral: '10000000000000000000',
      };

      const { getByTestId, rerender } = renderForm();

      // Fire auto-auction
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // Inject both estimator and regular bids
      const bothBids = [estimatorBid, regularBid];
      await act(async () => {
        rerender(
          <PositionForm
            methods={makeFormMethods()}
            onSubmit={vi.fn()}
            isSubmitting={false}
            chainId={42161}
            requestQuotes={mockRequestQuotes}
            collateralDecimals={18}
            bids={bothBids}
          />
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      const bidDisplay = getByTestId('bid-display');
      // Regular bid wins — shown as bestBid, not estimate
      expect(bidDisplay.dataset.hasBestBid).toBe('true');
      expect(bidDisplay.dataset.hasEstimateBid).toBe('false');
    });
  });

  // =========================================================================
  // F. Mode-switching clears bids
  // =========================================================================
  describe('F. Mode-switching clears bids', () => {
    it('clears bids when switching from auto (session) to manual (EOA)', async () => {
      const validBid = {
        counterparty: '0xMaker',
        counterpartyCollateral: '5000000000000000000',
        counterpartyDeadline: Math.floor(Date.now() / 1000) + 60,
        counterpartyNonce: 1,
        validationStatus: 'valid' as const,
        counterpartySignature: '0xSig',
        counterpartyChainId: 42161,
        predictorCollateral: '10000000000000000000',
      };

      // Start in auto mode (session signing) and get a bid
      const bidsWithValid = [validBid];
      const { getByTestId, rerender } = renderForm({ bids: bidsWithValid });

      // Fire auction and accept bid
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // Bid should be accepted — showRequestBidsButton should be false
      // (recentlyRequested is true after auto-fire)
      expect(getByTestId('bid-display').dataset.showRequestBidsButton).toBe(
        'false'
      );

      // Switch to EOA mode (manual) — simulate session ending
      mockUseSession.mockReturnValue({
        effectiveAddress: null,
        isUsingSmartAccount: false,
        signMessage: null,
      });

      await act(async () => {
        rerender(
          <PositionForm
            methods={makeFormMethods()}
            onSubmit={vi.fn()}
            isSubmitting={false}
            chainId={42161}
            requestQuotes={mockRequestQuotes}
            collateralDecimals={18}
            bids={bidsWithValid}
          />
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // After mode switch, bids should be cleared — showRequestBidsButton=true
      expect(getByTestId('bid-display').dataset.showRequestBidsButton).toBe(
        'true'
      );
    });

    it('clears bids when switching from manual (EOA) to auto (session)', async () => {
      // Start in manual mode (EOA)
      mockUseSession.mockReturnValue({
        effectiveAddress: null,
        isUsingSmartAccount: false,
        signMessage: null,
      });

      const { getByTestId, rerender } = renderForm();

      // Manually fire auction
      await act(async () => {
        fireEvent.click(getByTestId('initiate-auction-btn'));
      });

      expect(mockRequestQuotes).toHaveBeenCalledTimes(1);

      // Clear the in-flight guard (500ms cooldown inside triggerAuctionRequest)
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // Switch to session mode — simulate session starting
      mockUseSession.mockReturnValue({
        effectiveAddress: '0xSmartAccount',
        isUsingSmartAccount: true,
        signMessage: vi.fn(),
      });

      const prevCallCount = mockRequestQuotes.mock.calls.length;

      await act(async () => {
        rerender(
          <PositionForm
            methods={makeFormMethods()}
            onSubmit={vi.fn()}
            isSubmitting={false}
            chainId={42161}
            requestQuotes={mockRequestQuotes}
            collateralDecimals={18}
          />
        );
      });

      // Immediately after mode switch, bids are cleared — showRequestBidsButton=true
      expect(getByTestId('bid-display').dataset.showRequestBidsButton).toBe(
        'true'
      );

      // After 300ms debounce, auto mode re-fires a fresh auction
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockRequestQuotes).toHaveBeenCalledTimes(prevCallCount + 1);
    });
  });

  // =========================================================================
  // G. Geofence enforcement
  // =========================================================================
  describe('G. Geofence enforcement', () => {
    it('shows banner and disables submit when jurisdiction is restricted', () => {
      mockUseSapience.mockReturnValue({
        permitData: { permitted: false },
        isPermitLoading: false,
        permitError: null,
      });

      const { getByTestId } = renderForm();

      // Banner should be visible
      const banner = getByTestId('restricted-banner');
      expect(banner.dataset.show).toBe('true');

      // BidDisplay should have isSubmitDisabled=true
      const bidDisplay = getByTestId('bid-display');
      expect(bidDisplay.dataset.isSubmitDisabled).toBe('true');
    });

    it('disables submit while permit is loading', () => {
      mockUseSapience.mockReturnValue({
        permitData: null,
        isPermitLoading: true,
        permitError: null,
      });

      const { getByTestId } = renderForm();

      // Banner should NOT be shown while loading
      const banner = getByTestId('restricted-banner');
      expect(banner.dataset.show).toBe('false');

      // BidDisplay should still have isSubmitDisabled=true (loading blocks submit)
      const bidDisplay = getByTestId('bid-display');
      expect(bidDisplay.dataset.isSubmitDisabled).toBe('true');
    });
  });
});
