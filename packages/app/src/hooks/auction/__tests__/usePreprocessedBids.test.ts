import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AuctionBid } from '~/lib/auction/useAuctionBidsHub';
import type { UsePreprocessedBidsOptions } from '../usePreprocessedBids';

// ---- constants ----

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ---- mocks ----
// vi.mock calls are hoisted — use vi.hoisted() so references are available.

const {
  mockValidateBidFull,
  mockGetPublicClientForChainId,
  MOCK_ESTIMATOR_ADDRESS,
} = vi.hoisted(() => ({
  mockValidateBidFull: vi.fn(),
  mockGetPublicClientForChainId: vi.fn(() => ({})),
  MOCK_ESTIMATOR_ADDRESS: '0xEstimatorAddress',
}));

vi.mock('@sapience/sdk/auction/validation', () => ({
  validateBidFull: (...args: unknown[]) => mockValidateBidFull(...args),
}));

vi.mock('~/lib/utils/util', () => ({
  getPublicClientForChainId: (...args: unknown[]) =>
    mockGetPublicClientForChainId(...args),
}));

// ---- helpers ----

/**
 * Flush microtask queue so Promise.all-based state updates inside
 * useEffect are fully applied.
 */
async function flush(times = 3) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

function makeBid(overrides: Partial<AuctionBid> = {}): AuctionBid {
  return {
    auctionId: 'auction-1',
    counterparty: '0xCounterpartyA',
    counterpartyCollateral: '1000000',
    counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    counterpartySignature: `0xsig_${Math.random().toString(36).slice(2)}`,
    counterpartyNonce: 1,
    receivedAtMs: Date.now(),
    ...overrides,
  };
}

const DEFAULT_OPTS: UsePreprocessedBidsOptions = {
  picks: [
    {
      conditionResolver: '0xResolver',
      conditionId: '0xCondition',
      predictedOutcome: 1,
    },
  ],
  predictor: '0xPredictor',
  predictorCollateral: '500000',
  chainId: 1,
  predictionMarketAddress: '0xMarket',
  collateralTokenAddress: '0xCollateral',
  enabled: true,
};

// ---- import under test ----

import { usePreprocessedBids } from '../usePreprocessedBids';

// ---- helpers for stable-reference renderHook ----

interface HookProps {
  bids: AuctionBid[];
  opts: UsePreprocessedBidsOptions;
}

function renderStable(bids: AuctionBid[], opts = DEFAULT_OPTS) {
  return renderHook(
    ({ bids: b, opts: o }: HookProps) => usePreprocessedBids(b, o),
    { initialProps: { bids, opts } }
  );
}

/** Check that no bid has 'pending' status (i.e. validation ran). */
function allResolved(bids: Array<{ validationStatus: string }>): boolean {
  return bids.every((b) => b.validationStatus !== 'pending');
}

// ---- tests ----

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateBidFull.mockResolvedValue({ status: 'valid' });
});

describe('usePreprocessedBids', () => {
  // ---- 1. processedBids and validBids ----

  it('returns processedBids matching input count and validBids excluding invalid/unverified', async () => {
    const validBid = makeBid({ counterpartySignature: '0xvalid' });
    const invalidBid = makeBid({
      counterparty: ZERO_ADDRESS,
      counterpartySignature: '0xinvalid',
    });
    const bids = [validBid, invalidBid];

    const { result } = renderStable(bids);

    // processedBids should always match input count
    expect(result.current.processedBids).toHaveLength(2);

    await flush();

    expect(result.current.processedBids).toHaveLength(2);
    expect(allResolved(result.current.processedBids)).toBe(true);

    // validBids should exclude the zero-address bid (marked invalid)
    const vb = result.current.validBids;
    expect(vb.every((b) => b.validationStatus === 'valid')).toBe(true);
    expect(vb.find((b) => b.counterparty === ZERO_ADDRESS)).toBeUndefined();
  });

  // ---- 2. excludedBidCount ----

  it('excludedBidCount equals count of invalid + unverified bids', async () => {
    const goodBid = makeBid({ counterpartySignature: '0xgood' });
    const zeroBid = makeBid({
      counterparty: ZERO_ADDRESS,
      counterpartySignature: '0xzero',
    });
    const failBid = makeBid({ counterpartySignature: '0xfail' });
    const bids = [goodBid, zeroBid, failBid];

    mockValidateBidFull.mockImplementation(
      async (bid: { counterpartySignature: string }) => {
        if (bid.counterpartySignature === '0xfail') {
          return {
            status: 'invalid',
            code: 'MISSING_FIELD',
            reason: 'bad bid',
          };
        }
        return { status: 'valid' };
      }
    );

    const { result } = renderStable(bids);

    await flush();

    // zeroBid -> invalid (zero address), failBid -> invalid (validation)
    expect(result.current.excludedBidCount).toBe(2);
  });

  // ---- 3. Estimator bids go through normal validation ----

  it('validates estimator bids through validateBidFull like any other bid', async () => {
    const estimatorBid = makeBid({
      counterparty: MOCK_ESTIMATOR_ADDRESS,
      counterpartySignature: '0xestimator',
    });
    const normalBid = makeBid({ counterpartySignature: '0xnormal' });
    const bids = [estimatorBid, normalBid];

    const { result } = renderStable(bids);

    await flush();

    // Both bids should have been validated
    expect(mockValidateBidFull).toHaveBeenCalledTimes(2);
    const validatedSigs = mockValidateBidFull.mock.calls.map(
      (call: unknown[]) =>
        (call[0] as { counterpartySignature: string }).counterpartySignature
    );
    expect(validatedSigs).toContain('0xestimator');
    expect(validatedSigs).toContain('0xnormal');

    // Both should be valid (mock returns valid by default)
    expect(result.current.processedBids).toHaveLength(2);
    expect(allResolved(result.current.processedBids)).toBe(true);
  });

  it('excludes estimator bids from validBids when validation fails (e.g. insufficient funds)', async () => {
    mockValidateBidFull.mockImplementation(
      async (bid: { counterparty: string }) => {
        if (bid.counterparty === MOCK_ESTIMATOR_ADDRESS) {
          return {
            status: 'invalid',
            code: 'INSUFFICIENT_BALANCE',
            reason: 'market maker has insufficient balance',
          };
        }
        return { status: 'valid' };
      }
    );

    const estimatorBid = makeBid({
      counterparty: MOCK_ESTIMATOR_ADDRESS,
      counterpartySignature: '0xestimator_nofunds',
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 7200,
    });
    const normalBid = makeBid({
      counterpartySignature: '0xnormal_include',
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 7200,
    });
    const bids = [estimatorBid, normalBid];

    const { result } = renderStable(bids);

    await flush();

    // Estimator bid should be invalid in processedBids
    const estProcessed = result.current.processedBids.find(
      (b) => b.counterpartySignature === '0xestimator_nofunds'
    );
    expect(estProcessed?.validationStatus).toBe('invalid');
    expect(estProcessed?.validationError).toContain('insufficient balance');

    // Estimator bid should NOT be in validBids
    const estValid = result.current.validBids.find(
      (b) => b.counterpartySignature === '0xestimator_nofunds'
    );
    expect(estValid).toBeUndefined();

    // Normal bid should still be in validBids
    const normalValid = result.current.validBids.find(
      (b) => b.counterpartySignature === '0xnormal_include'
    );
    expect(normalValid).toBeDefined();
  });

  // ---- 4. Zero-address filtering ----

  it('marks bids with zero-address counterparty as invalid immediately', () => {
    const zeroBid = makeBid({
      counterparty: ZERO_ADDRESS,
      counterpartySignature: '0xzeroaddr',
    });

    const { result } = renderStable([zeroBid]);

    const processed = result.current.processedBids[0];
    expect(processed.validationStatus).toBe('invalid');
    expect(processed.validationError).toContain('zero address');

    // validateBidFull should not be called for zero-address bids
    expect(mockValidateBidFull).not.toHaveBeenCalled();
  });

  it('marks bids with missing counterparty as invalid', () => {
    const missingBid = makeBid({
      counterparty: '',
      counterpartySignature: '0xmissing',
    });

    const { result } = renderStable([missingBid]);

    expect(result.current.processedBids[0].validationStatus).toBe('invalid');
    expect(mockValidateBidFull).not.toHaveBeenCalled();
  });

  // ---- 5. Fail-to-unverified on error ----

  it('sets bid to unverified when validateBidFull throws', async () => {
    const bid = makeBid({ counterpartySignature: '0xthrows' });

    mockValidateBidFull.mockRejectedValue(new Error('RPC failure'));

    const { result } = renderStable([bid]);

    await flush();

    const processed = result.current.processedBids.find(
      (b) => b.counterpartySignature === '0xthrows'
    );
    expect(processed?.validationStatus).toBe('unverified');
    expect(result.current.excludedBidCount).toBe(1);
  });

  // ---- 6. Expired bid filtering ----

  it('excludes bids with counterpartyDeadline in the past from validBids', async () => {
    const expiredBid = makeBid({
      counterpartySignature: '0xexpired',
      counterpartyDeadline: Math.floor(Date.now() / 1000) - 3600,
    });
    const futureBid = makeBid({
      counterpartySignature: '0xfuture',
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    });
    const bids = [expiredBid, futureBid];

    const { result } = renderStable(bids);

    await flush();

    // Both should be in processedBids
    expect(result.current.processedBids).toHaveLength(2);

    // Only the future bid should be in validBids
    expect(result.current.validBids).toHaveLength(1);
    expect(result.current.validBids[0].counterpartySignature).toBe('0xfuture');
  });

  // ---- 7. Context key invalidation ----

  it('clears validation cache when picks/predictor/chainId change', async () => {
    const bid = makeBid({ counterpartySignature: '0xcache' });

    const { result, rerender } = renderStable([bid]);

    await flush();

    // Validation completed (status is no longer pending)
    expect(result.current.processedBids[0].validationStatus).not.toBe(
      'pending'
    );
    expect(mockValidateBidFull).toHaveBeenCalledTimes(1);

    // Change predictor -> new context key -> cache cleared -> re-validate
    const newOpts: UsePreprocessedBidsOptions = {
      ...DEFAULT_OPTS,
      predictor: '0xNewPredictor',
    };

    rerender({ bids: [bid], opts: newOpts });
    await flush();

    expect(mockValidateBidFull).toHaveBeenCalledTimes(2);
  });

  // ---- 8. Incremental validation ----

  it('only validates new bids and caches previous results', async () => {
    const bid1 = makeBid({ counterpartySignature: '0xbid1' });
    const bid2 = makeBid({ counterpartySignature: '0xbid2' });

    const { result, rerender } = renderStable([bid1]);

    await flush();

    // Validation for bid1 completed
    expect(result.current.processedBids[0].validationStatus).not.toBe(
      'pending'
    );
    expect(mockValidateBidFull).toHaveBeenCalledTimes(1);
    expect(mockValidateBidFull.mock.calls[0][0].counterpartySignature).toBe(
      '0xbid1'
    );

    // Add a new bid - only the new one should be validated
    rerender({ bids: [bid1, bid2], opts: DEFAULT_OPTS });
    await flush();

    expect(mockValidateBidFull).toHaveBeenCalledTimes(2);

    // Second call should be for bid2
    expect(mockValidateBidFull.mock.calls[1][0].counterpartySignature).toBe(
      '0xbid2'
    );
  });

  // ---- 9. Disabled validation ----

  it('returns bids as valid without calling validateBidFull when enabled=false', () => {
    const bid = makeBid({ counterpartySignature: '0xdisabled' });
    const disabledOpts: UsePreprocessedBidsOptions = {
      ...DEFAULT_OPTS,
      enabled: false,
    };

    const { result } = renderStable([bid], disabledOpts);

    const processed = result.current.processedBids.find(
      (b) => b.counterpartySignature === '0xdisabled'
    );
    expect(processed?.validationStatus).toBe('valid');
    expect(mockValidateBidFull).not.toHaveBeenCalled();
  });

  it('returns bids as valid without calling validateBidFull when required opts are missing', () => {
    const bid = makeBid({ counterpartySignature: '0xmissingopts' });
    const incompleteOpts: UsePreprocessedBidsOptions = {
      chainId: 1,
      enabled: true,
    };

    const { result } = renderStable([bid], incompleteOpts);

    const processed = result.current.processedBids.find(
      (b) => b.counterpartySignature === '0xmissingopts'
    );
    expect(processed?.validationStatus).toBe('valid');
    expect(mockValidateBidFull).not.toHaveBeenCalled();
  });

  // ---- 10. Self-bid fast-tracking ----

  it('marks self-bids as valid immediately without calling validateBidFull', async () => {
    const selfBid = makeBid({
      counterparty: '0xSelfAddress',
      counterpartySignature: '0xself',
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    });
    const otherBid = makeBid({
      counterparty: '0xOtherAddress',
      counterpartySignature: '0xother',
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    });

    const opts: UsePreprocessedBidsOptions = {
      ...DEFAULT_OPTS,
      selfAddress: '0xSelfAddress',
    };

    const { result } = renderStable([selfBid, otherBid], opts);

    await flush();

    // Self-bid should be valid
    const selfProcessed = result.current.processedBids.find(
      (b) => b.counterpartySignature === '0xself'
    );
    expect(selfProcessed?.validationStatus).toBe('valid');

    // Other bid should also be validated (via validateBidFull)
    const otherProcessed = result.current.processedBids.find(
      (b) => b.counterpartySignature === '0xother'
    );
    expect(otherProcessed?.validationStatus).toBe('valid');

    // validateBidFull should only be called for the other bid
    expect(mockValidateBidFull).toHaveBeenCalledTimes(1);
    expect(mockValidateBidFull.mock.calls[0][0].counterpartySignature).toBe(
      '0xother'
    );
  });

  it('self-bid matching is case-insensitive', async () => {
    const selfBid = makeBid({
      counterparty: '0xabcdef1234567890',
      counterpartySignature: '0xselfcase',
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    });

    const opts: UsePreprocessedBidsOptions = {
      ...DEFAULT_OPTS,
      selfAddress: '0xABCDEF1234567890',
    };

    const { result } = renderStable([selfBid], opts);

    await flush();

    const processed = result.current.processedBids.find(
      (b) => b.counterpartySignature === '0xselfcase'
    );
    expect(processed?.validationStatus).toBe('valid');
    expect(mockValidateBidFull).not.toHaveBeenCalled();
  });

  it('self-bid deduplication only sets validation result once per signature', async () => {
    const sig = '0xdupself';
    const selfBid1 = makeBid({
      counterparty: '0xSelfAddr',
      counterpartySignature: sig,
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    });
    const selfBid2 = makeBid({
      counterparty: '0xSelfAddr',
      counterpartySignature: sig,
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    });

    const opts: UsePreprocessedBidsOptions = {
      ...DEFAULT_OPTS,
      selfAddress: '0xSelfAddr',
    };

    const { result } = renderStable([selfBid1, selfBid2], opts);

    await flush();

    // Both should show valid
    const validBids = result.current.processedBids.filter(
      (b) => b.counterpartySignature === sig
    );
    expect(validBids).toHaveLength(2);
    expect(validBids.every((b) => b.validationStatus === 'valid')).toBe(true);
    expect(mockValidateBidFull).not.toHaveBeenCalled();
  });
});
