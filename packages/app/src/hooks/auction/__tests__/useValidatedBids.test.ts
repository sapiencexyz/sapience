import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { zeroAddress as ZERO_ADDRESS } from 'viem';
import { OutcomeSide } from '@sapience/sdk/types';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import type { UseValidatedBidsOptions } from '../useValidatedBids';
import type { Pick } from '@sapience/sdk/types';

// ---- mocks ----
// vi.mock calls are hoisted — use vi.hoisted() so references are available.

const {
  mockValidateBidOnChain,
  mockGetPublicClientForChainId,
  MOCK_ESTIMATOR_ADDRESS,
} = vi.hoisted(() => ({
  mockValidateBidOnChain: vi.fn(),
  mockGetPublicClientForChainId: vi.fn(() => ({})),
  MOCK_ESTIMATOR_ADDRESS: '0xe02eD37D0458c8999943CbE6D1c9DB597f3EE572',
}));

vi.mock('@sapience/sdk/auction/validation', () => ({
  validateBidOnChain: (...args: unknown[]) => mockValidateBidOnChain(...args),
}));

vi.mock('~/lib/utils/util', () => ({
  getPublicClientForChainId: (...args: unknown[]) =>
    mockGetPublicClientForChainId(...args),
}));

vi.mock('~/lib/auction/bidLogger', () => ({
  logBidValidation: vi.fn(),
  formatBidForLog: vi.fn(() => ''),
}));

vi.mock('~/lib/constants', () => ({
  PREFERRED_ESTIMATE_QUOTER: '0xe02eD37D0458c8999943CbE6D1c9DB597f3EE572',
}));

// ---- helpers ----

async function flush(times = 3) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

function makeBid(overrides: Partial<QuoteBid> = {}): QuoteBid {
  return {
    auctionId: 'auction-1',
    counterparty: '0xCounterpartyA',
    counterpartyCollateral: '1000000',
    counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    counterpartySignature: `0xsig_${Math.random().toString(36).slice(2)}`,
    counterpartyNonce: 1,
    ...overrides,
  };
}

const DEFAULT_PICKS: Pick[] = [
  {
    conditionResolver: '0xResolver' as `0x${string}`,
    conditionId: '0xCondition' as `0x${string}`,
    predictedOutcome: OutcomeSide.NO,
  },
];

const DEFAULT_OPTS: UseValidatedBidsOptions = {
  chainId: 1,
  predictionMarketAddress: '0xMarket' as `0x${string}`,
  collateralTokenAddress: '0xCollateral' as `0x${string}`,
  predictorAddress: '0xPredictor' as `0x${string}`,
  predictorCollateral: '500000',
  picks: DEFAULT_PICKS,
  enabled: true,
};

// ---- import under test ----

import { useValidatedBids } from '../useValidatedBids';

// ---- helpers for stable-reference renderHook ----

interface HookProps {
  bids: QuoteBid[];
  opts: UseValidatedBidsOptions;
}

function renderStable(bids: QuoteBid[], opts = DEFAULT_OPTS) {
  return renderHook(
    ({ bids: b, opts: o }: HookProps) => useValidatedBids(b, o),
    { initialProps: { bids, opts } }
  );
}

// ---- tests ----

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateBidOnChain.mockResolvedValue({ status: 'valid' });
});

describe('useValidatedBids', () => {
  // ---- Fix 1: failOpen: false ----

  it('passes failOpen: false to validateBidOnChain', async () => {
    const bid = makeBid({ counterpartySignature: '0xfailopen' });

    renderStable([bid]);
    await flush();

    expect(mockValidateBidOnChain).toHaveBeenCalledTimes(1);
    const callArgs = mockValidateBidOnChain.mock.calls[0];
    // Third argument is the options object
    expect(callArgs[2]).toMatchObject({ failOpen: false });
  });

  it('revalidates bids when predictorNonce changes', async () => {
    const bid = makeBid({ counterpartySignature: '0xnonce_change' });
    const { rerender } = renderStable([bid], {
      ...DEFAULT_OPTS,
      predictorNonce: 1,
    });

    await flush();
    expect(mockValidateBidOnChain).toHaveBeenCalledTimes(1);

    rerender({
      bids: [bid],
      opts: {
        ...DEFAULT_OPTS,
        predictorNonce: 2,
      },
    });

    await flush();
    expect(mockValidateBidOnChain).toHaveBeenCalledTimes(2);
    expect(mockValidateBidOnChain.mock.calls[0][1]).toMatchObject({
      predictorNonce: 1,
    });
    expect(mockValidateBidOnChain.mock.calls[1][1]).toMatchObject({
      predictorNonce: 2,
    });
  });

  // ---- Fix 2: catch block marks invalid, not valid ----

  it('marks bid as invalid when validateBidOnChain throws unexpectedly', async () => {
    const bid = makeBid({ counterpartySignature: '0xthrows' });

    mockValidateBidOnChain.mockRejectedValue(new Error('RPC failure'));

    const { result } = renderStable([bid]);
    await flush();

    // The bid should be marked invalid, NOT valid
    const validated = result.current.validatedBids.find(
      (b) => b.counterpartySignature === '0xthrows'
    );
    expect(validated?.validationStatus).toBe('invalid');
    expect(validated?.validationError).toContain('RPC failure');

    // It should not appear in validBids
    expect(result.current.validBids).toHaveLength(0);
    expect(result.current.invalidBidCount).toBe(1);
  });

  // ---- Estimator bids still pass through ----

  it('auto-marks estimator bids as valid without calling validateBidOnChain', async () => {
    const estimatorBid = makeBid({
      counterparty: MOCK_ESTIMATOR_ADDRESS,
      counterpartySignature: '0xestimator',
    });
    const normalBid = makeBid({ counterpartySignature: '0xnormal' });

    const { result } = renderStable([estimatorBid, normalBid]);
    await flush();

    // validateBidOnChain should only be called for the normal bid
    expect(mockValidateBidOnChain).toHaveBeenCalledTimes(1);
    const calledSig =
      mockValidateBidOnChain.mock.calls[0][0].counterpartySignature;
    expect(calledSig).toBe('0xnormal');

    // Estimator bid should be valid
    const estBid = result.current.validatedBids.find(
      (b) => b.counterpartySignature === '0xestimator'
    );
    expect(estBid?.validationStatus).toBe('valid');
  });

  // ---- Basic validation flow ----

  it('returns validatedBids matching input count and filters validBids', async () => {
    const validBid = makeBid({ counterpartySignature: '0xvalid' });
    const invalidBid = makeBid({
      counterparty: ZERO_ADDRESS,
      counterpartySignature: '0xinvalid',
    });

    const { result } = renderStable([validBid, invalidBid]);
    await flush();

    expect(result.current.validatedBids).toHaveLength(2);

    // validBids should exclude the zero-address bid
    const vb = result.current.validBids;
    expect(vb.every((b) => b.validationStatus === 'valid')).toBe(true);
    expect(vb.find((b) => b.counterparty === ZERO_ADDRESS)).toBeUndefined();
  });

  it('marks bids with zero-address counterparty as invalid immediately', async () => {
    const zeroBid = makeBid({
      counterparty: ZERO_ADDRESS,
      counterpartySignature: '0xzeroaddr',
    });

    const { result } = renderStable([zeroBid]);
    await flush();

    const processed = result.current.validatedBids[0];
    expect(processed.validationStatus).toBe('invalid');
    expect(processed.validationError).toContain('zero address');
  });

  it('excludes expired bids from validBids', async () => {
    const expiredBid = makeBid({
      counterpartySignature: '0xexpired',
      counterpartyDeadline: Math.floor(Date.now() / 1000) - 3600,
    });
    const futureBid = makeBid({
      counterpartySignature: '0xfuture',
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
    });

    const { result } = renderStable([expiredBid, futureBid]);
    await flush();

    expect(result.current.validatedBids).toHaveLength(2);
    expect(result.current.validBids).toHaveLength(1);
    expect(result.current.validBids[0].counterpartySignature).toBe('0xfuture');
  });

  it('returns bids as valid without validation when enabled=false', () => {
    const bid = makeBid({ counterpartySignature: '0xdisabled' });
    const disabledOpts: UseValidatedBidsOptions = {
      ...DEFAULT_OPTS,
      enabled: false,
    };

    const { result } = renderStable([bid], disabledOpts);

    const processed = result.current.validatedBids.find(
      (b) => b.counterpartySignature === '0xdisabled'
    );
    expect(processed?.validationStatus).toBe('valid');
    expect(mockValidateBidOnChain).not.toHaveBeenCalled();
  });

  // ---- RPC error with failOpen: false should produce invalid status ----

  it('marks bid invalid when validateBidOnChain returns RPC_ERROR (failOpen: false)', async () => {
    const bid = makeBid({ counterpartySignature: '0xrpc_error' });

    mockValidateBidOnChain.mockResolvedValue({
      status: 'invalid',
      code: 'RPC_ERROR',
      reason: 'RPC error: timeout',
    });

    const { result } = renderStable([bid]);
    await flush();

    const validated = result.current.validatedBids.find(
      (b) => b.counterpartySignature === '0xrpc_error'
    );
    expect(validated?.validationStatus).toBe('invalid');
    expect(result.current.validBids).toHaveLength(0);
  });

  // ---- canValidate requires picks ----

  it('triggers on-chain validation when picks are provided', async () => {
    const bid = makeBid({ counterpartySignature: '0xwith_picks' });

    const optsWithPicks: UseValidatedBidsOptions = {
      ...DEFAULT_OPTS,
      picks: DEFAULT_PICKS,
    };

    renderStable([bid], optsWithPicks);
    await flush();

    expect(mockValidateBidOnChain).toHaveBeenCalledTimes(1);
  });

  it('defaults bids to valid without on-chain validation when picks are empty', async () => {
    const bid = makeBid({ counterpartySignature: '0xno_picks' });

    const optsNoPicks: UseValidatedBidsOptions = {
      ...DEFAULT_OPTS,
      picks: [],
    };

    const { result } = renderStable([bid], optsNoPicks);
    await flush();

    // canValidate is false when picks is empty → bids default to 'valid' without on-chain check
    expect(mockValidateBidOnChain).not.toHaveBeenCalled();
    const validated = result.current.validatedBids.find(
      (b) => b.counterpartySignature === '0xno_picks'
    );
    expect(validated?.validationStatus).toBe('valid');
  });

  it('defaults bids to valid without on-chain validation when picks are undefined', async () => {
    const bid = makeBid({ counterpartySignature: '0xundefined_picks' });

    const optsNoPicks: UseValidatedBidsOptions = {
      ...DEFAULT_OPTS,
      picks: undefined,
    };

    const { result } = renderStable([bid], optsNoPicks);
    await flush();

    expect(mockValidateBidOnChain).not.toHaveBeenCalled();
    const validated = result.current.validatedBids.find(
      (b) => b.counterpartySignature === '0xundefined_picks'
    );
    expect(validated?.validationStatus).toBe('valid');
  });

  // ---- Mid-flight rerender must not discard the in-flight result ----

  it('commits a validation result that completes after a rerender changes the bids ref', async () => {
    // Same signature, two array references — relayer rebroadcasts the same
    // bid, parent passes a fresh array each time. Until this test was added,
    // the cleanup fired by the array-ref change cancelled the in-flight
    // validation, leaving the bid stuck on `pending` forever.
    const bid = makeBid({ counterpartySignature: '0xmid_flight' });

    let resolveValidation: ((v: { status: string }) => void) | undefined;
    mockValidateBidOnChain.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveValidation = resolve;
      })
    );

    const { result, rerender } = renderStable([bid]);

    // Rerender with a fresh array reference but the same bid before the
    // validation Promise resolves. This used to set `cancelled = true`.
    rerender({ bids: [{ ...bid }], opts: DEFAULT_OPTS });

    // Now resolve the in-flight validation.
    await act(async () => {
      resolveValidation!({ status: 'valid' });
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    await flush();

    const validated = result.current.validatedBids.find(
      (b) => b.counterpartySignature === '0xmid_flight'
    );
    expect(validated?.validationStatus).toBe('valid');
    expect(result.current.validBids).toHaveLength(1);
  });

  // ---- Stale input: must drop in-flight results when inputs change ----

  it('drops a validation result if predictorNonce changes before it commits', async () => {
    // Validation hashes against the predictor snapshot (picks, collateral,
    // nonce). If those change while a validation is in flight, the
    // returned result was computed against an obsolete snapshot and must
    // not be committed — otherwise the cache says "valid" for a bid that
    // is no longer valid against the active prediction.
    const bid = makeBid({ counterpartySignature: '0xstale_inputs' });

    // First call (against OLD nonce) resolves to valid; the second call
    // (against NEW nonce, after rerender) is held pending so it cannot
    // commit a fresh "valid" result and mask the bug under test.
    const resolvers: Array<(v: { status: string }) => void> = [];
    mockValidateBidOnChain.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    const { result, rerender } = renderStable([bid], {
      ...DEFAULT_OPTS,
      predictorNonce: 1,
    });
    await flush(1);

    // Inputs change mid-flight. The cleanup effect clears the cache and
    // bumps the fingerprint so the in-flight result is recognized stale.
    rerender({
      bids: [bid],
      opts: { ...DEFAULT_OPTS, predictorNonce: 2 },
    });
    await flush(1);

    // Resolve the FIRST validation (queued against OLD nonce). Stale.
    await act(async () => {
      resolvers[0]({ status: 'valid' });
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    await flush();

    const validated = result.current.validatedBids.find(
      (b) => b.counterpartySignature === '0xstale_inputs'
    );
    // The second validation is still pending — bid must not show as valid
    // from the stale first result.
    expect(validated?.validationStatus).toBe('pending');
    expect(result.current.validBids).toHaveLength(0);
  });

  it('drops a validation result if predictorAddress changes before it commits', async () => {
    // predictorAddress flows into the on-chain digest via validateBidOnChain;
    // a change must invalidate the in-flight result the same way a
    // predictorNonce or picks change does.
    const bid = makeBid({ counterpartySignature: '0xstale_predictor' });

    const resolvers: Array<(v: { status: string }) => void> = [];
    mockValidateBidOnChain.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    const { result, rerender } = renderStable([bid], {
      ...DEFAULT_OPTS,
      predictorAddress: '0xPredictorA' as `0x${string}`,
    });
    await flush(1);

    rerender({
      bids: [bid],
      opts: {
        ...DEFAULT_OPTS,
        predictorAddress: '0xPredictorB' as `0x${string}`,
      },
    });
    await flush(1);

    await act(async () => {
      resolvers[0]({ status: 'valid' });
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    await flush();

    const validated = result.current.validatedBids.find(
      (b) => b.counterpartySignature === '0xstale_predictor'
    );
    expect(validated?.validationStatus).toBe('pending');
  });

  it('drops a validation result if picks change before it commits', async () => {
    const bid = makeBid({ counterpartySignature: '0xstale_picks' });

    const resolvers: Array<(v: { status: string }) => void> = [];
    mockValidateBidOnChain.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    const { result, rerender } = renderStable([bid]);
    await flush(1);

    rerender({
      bids: [bid],
      opts: {
        ...DEFAULT_OPTS,
        picks: [
          {
            conditionResolver: '0xResolver' as `0x${string}`,
            conditionId: '0xCondition2' as `0x${string}`,
            predictedOutcome: OutcomeSide.YES,
          },
        ],
      },
    });
    await flush(1);

    await act(async () => {
      resolvers[0]({ status: 'valid' });
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    await flush();

    const validated = result.current.validatedBids.find(
      (b) => b.counterpartySignature === '0xstale_picks'
    );
    expect(validated?.validationStatus).toBe('pending');
  });
});
