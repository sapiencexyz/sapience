import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Order } from '../../types';
import type { AuctionFeedMessage } from '~/lib/auction/useAuctionRelayerFeed';

// ---- mocks (hoisted) ----

const { mockValidateBidFull, mockGetPublicClient } = vi.hoisted(() => ({
  mockValidateBidFull: vi.fn(),
  mockGetPublicClient: vi.fn(() => ({})),
}));

vi.mock('@sapience/sdk/auction/validation', () => ({
  validateBidFull: (...args: unknown[]) => mockValidateBidFull(...args),
}));

vi.mock('~/lib/utils/util', () => ({
  getPublicClientForChainId: (...args: unknown[]) =>
    mockGetPublicClient(...args),
}));

// Mock the utils used by the hook
vi.mock('../../utils', () => ({
  decodePredictedOutcomes: vi.fn(() => [
    { marketId: '0xmarket1', prediction: true },
  ]),
  formatOrderLabelSnapshot: vi.fn((tag: string) => tag),
  formatOrderTag: vi.fn(
    (order: { id: string }, _pos: unknown, _fn: unknown) =>
      `[Order ${order.id}]`
  ),
  getConditionMatchInfo: vi.fn(() => null),
  normalizeAddress: vi.fn((addr: string | null) =>
    addr ? addr.toLowerCase() : null
  ),
  resolveMessageField: vi.fn((data: unknown, field: string) => {
    if (!data || typeof data !== 'object') return undefined;
    const d = data as Record<string, unknown>;
    if (field in d) return d[field];
    const payload = d.payload as Record<string, unknown> | undefined;
    if (payload && typeof payload === 'object' && field in payload)
      return payload[field];
    return undefined;
  }),
}));

// ---- import under test ----

import { useAuctionMatching } from '../useAuctionMatching';
import { getConditionMatchInfo } from '../../utils';

// ---- helpers ----

async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    expiration: null,
    autoPausedAt: null,
    strategy: 'copy_trade',
    copyTradeAddress: '0xTargetTrader',
    increment: 1,
    odds: 50,
    status: 'active',
    ...overrides,
  };
}

/** Build a minimal auction.started message to seed the auction context cache */
function makeAuctionStarted(
  auctionId: string,
  overrides: Record<string, unknown> = {}
): AuctionFeedMessage {
  return {
    type: 'auction.started',
    channel: auctionId,
    time: Date.now(),
    data: {
      resolver: '0xResolver',
      predictor: '0xPredictor',
      predictorCollateral: '1000000',
      predictedOutcomes: ['0xoutcome1'],
      escrowPicks: [
        {
          conditionResolver: '0xResolver',
          conditionId: '0xCondition',
          predictedOutcome: 1,
        },
      ],
      ...overrides,
    },
  } as AuctionFeedMessage;
}

/** Build an auction.bids message with one bid from a given counterparty */
function makeAuctionBids(
  auctionId: string,
  counterparty: string,
  overrides: Record<string, unknown> = {}
): AuctionFeedMessage {
  return {
    type: 'auction.bids',
    channel: auctionId,
    time: Date.now() + 1,
    data: {
      bids: [
        {
          auctionId,
          counterparty,
          counterpartyCollateral: '500000',
          counterpartyNonce: 1,
          counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
          counterpartySignature: '0xValidSig',
          ...overrides,
        },
      ],
    },
  } as unknown as AuctionFeedMessage;
}

const DEFAULT_PARAMS = {
  orders: [] as Order[],
  getOrderIndex: () => 0,
  pushLogEntry: vi.fn(),
  balanceValue: 1000,
  allowanceValue: 1000,
  isPermitLoading: false,
  isRestricted: false,
  address: '0xMyAddress' as `0x${string}`,
  collateralSymbol: 'USDC',
  tokenDecimals: 6,
  auctionMessages: [] as AuctionFeedMessage[],
  formatCollateralAmount: (v?: string | null) => (v ? '1.00' : null),
  submitBid: vi.fn().mockResolvedValue({ signature: '0xresult' }),
  predictionMarketAddress: '0xMarket' as `0x${string}`,
  collateralTokenAddress: '0xCollateral' as `0x${string}`,
  chainId: 1,
};

// ---- tests ----

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateBidFull.mockResolvedValue({ status: 'valid' });
});

describe('useAuctionMatching — copy_trade validation', () => {
  it('calls validateBidFull (Tier 1+2) instead of validateBid when processing copy_trade bids', async () => {
    const order = makeOrder({ copyTradeAddress: '0xTargetTrader' });
    const auctionId = 'auction-full-1';
    const started = makeAuctionStarted(auctionId);
    const bids = makeAuctionBids(auctionId, '0xTargetTrader');

    // First render: seed auction context with auction.started
    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
      },
    });

    await flush();

    // Second render: feed auction.bids so copy_trade matching triggers
    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids],
    });

    await flush();

    // validateBidFull should have been called (not validateBid)
    expect(mockValidateBidFull).toHaveBeenCalledTimes(1);

    // Verify it received Tier 2 params (predictionMarketAddress, collateralTokenAddress, publicClient)
    const opts = mockValidateBidFull.mock.calls[0][2];
    expect(opts).toMatchObject({
      verifyingContract: '0xMarket',
      chainId: 1,
      predictionMarketAddress: '0xMarket',
      collateralTokenAddress: '0xCollateral',
    });
    expect(opts.publicClient).toBeDefined();
  });

  it('skips spoofed bids when validateBidFull returns invalid', async () => {
    const pushLogEntry = vi.fn();
    const submitBid = vi.fn().mockResolvedValue({ signature: '0xresult' });
    const order = makeOrder({ copyTradeAddress: '0xTargetTrader' });
    const auctionId = 'auction-spoof-1';
    const started = makeAuctionStarted(auctionId);
    const bids = makeAuctionBids(auctionId, '0xTargetTrader');

    mockValidateBidFull.mockResolvedValue({
      status: 'invalid',
      code: 'INSUFFICIENT_BALANCE',
      reason: 'counterparty has no balance',
    });

    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
        pushLogEntry,
        submitBid,
      },
    });

    await flush();

    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids],
      pushLogEntry,
      submitBid,
    });

    await flush();

    // submitBid should NOT have been called — bid was invalid
    expect(submitBid).not.toHaveBeenCalled();

    // A warning log about the invalid bid should have been pushed
    const spoofLog = pushLogEntry.mock.calls.find(
      (call: unknown[]) =>
        typeof (call[0] as Record<string, unknown>)?.message === 'string' &&
        ((call[0] as Record<string, string>).message.includes('invalid') ||
          (call[0] as Record<string, string>).message.includes(
            'skipped outbid'
          ))
    );
    expect(spoofLog).toBeDefined();
  });

  it('proceeds with submission when validateBidFull returns valid', async () => {
    const submitBid = vi.fn().mockResolvedValue({ signature: '0xresult' });
    const order = makeOrder({ copyTradeAddress: '0xTargetTrader' });
    const auctionId = 'auction-valid-1';
    const started = makeAuctionStarted(auctionId);
    const bids = makeAuctionBids(auctionId, '0xTargetTrader');

    mockValidateBidFull.mockResolvedValue({ status: 'valid' });

    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
        submitBid,
      },
    });

    await flush();

    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids],
      submitBid,
    });

    await flush();

    // submitBid should have been called — bid was valid
    expect(submitBid).toHaveBeenCalledTimes(1);
  });

  it('retries after validateBidFull throws (removes from in-flight set)', async () => {
    const submitBid = vi.fn().mockResolvedValue({ signature: '0xresult' });
    const order = makeOrder({ copyTradeAddress: '0xTargetTrader' });
    const auctionId = 'auction-retry-1';
    const started = makeAuctionStarted(auctionId);
    const bids = makeAuctionBids(auctionId, '0xTargetTrader');

    // First call throws, second call succeeds
    mockValidateBidFull
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValueOnce({ status: 'valid' });

    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
        submitBid,
      },
    });

    await flush();

    // First attempt — triggers validation which will throw
    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids],
      submitBid,
    });

    await flush();

    // First call threw, submitBid should not have been called
    expect(submitBid).not.toHaveBeenCalled();
    expect(mockValidateBidFull).toHaveBeenCalledTimes(1);

    // Retry — feed the same bid again with a new time so it's processed
    const bidsRetry = {
      ...bids,
      time: Date.now() + 100,
    } as AuctionFeedMessage;

    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids, bidsRetry],
      submitBid,
    });

    await flush();

    // Second validation attempt should succeed
    expect(mockValidateBidFull).toHaveBeenCalledTimes(2);
    expect(submitBid).toHaveBeenCalledTimes(1);
  });

  it('passes chainId from params to validateBidFull (not hardcoded DEFAULT_CHAIN_ID)', async () => {
    const order = makeOrder({ copyTradeAddress: '0xTargetTrader' });
    const auctionId = 'auction-chain-1';
    const started = makeAuctionStarted(auctionId);
    const bids = makeAuctionBids(auctionId, '0xTargetTrader');

    const customChainId = 42161; // Arbitrum

    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
        chainId: customChainId,
      },
    });

    await flush();

    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids],
      chainId: customChainId,
    });

    await flush();

    expect(mockValidateBidFull).toHaveBeenCalledTimes(1);

    // Check auction context (2nd arg) has custom chainId
    const auctionArg = mockValidateBidFull.mock.calls[0][1];
    expect(auctionArg.chainId).toBe(customChainId);

    // Check opts (3rd arg) has custom chainId
    const optsArg = mockValidateBidFull.mock.calls[0][2];
    expect(optsArg.chainId).toBe(customChainId);

    // getPublicClientForChainId should have been called with custom chainId
    expect(mockGetPublicClient).toHaveBeenCalledWith(customChainId);
  });

  it('skips validation when predictionMarketAddress is missing (proceeds without validation)', async () => {
    const submitBid = vi.fn().mockResolvedValue({ signature: '0xresult' });
    const order = makeOrder({ copyTradeAddress: '0xTargetTrader' });
    const auctionId = 'auction-noaddr-1';
    const started = makeAuctionStarted(auctionId);
    const bids = makeAuctionBids(auctionId, '0xTargetTrader');

    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
        submitBid,
        predictionMarketAddress: undefined,
      },
    });

    await flush();

    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids],
      submitBid,
      predictionMarketAddress: undefined,
    });

    await flush();

    // validateBidFull should NOT be called — no predictionMarketAddress
    expect(mockValidateBidFull).not.toHaveBeenCalled();
    // But submitBid should still be called (proceeds without validation)
    expect(submitBid).toHaveBeenCalledTimes(1);
  });

  it('proceeds with submission when validateBidFull returns unverified (treats same as valid)', async () => {
    const submitBid = vi.fn().mockResolvedValue({ signature: '0xresult' });
    const order = makeOrder({ copyTradeAddress: '0xTargetTrader' });
    const auctionId = 'auction-unverified-1';
    const started = makeAuctionStarted(auctionId);
    const bids = makeAuctionBids(auctionId, '0xTargetTrader');

    mockValidateBidFull.mockResolvedValue({
      status: 'unverified',
      reason: 'could not verify on-chain',
    });

    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
        submitBid,
      },
    });

    await flush();

    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids],
      submitBid,
    });

    await flush();

    // unverified bids should still proceed to submission (not rejected)
    expect(submitBid).toHaveBeenCalledTimes(1);
  });
});

describe('useAuctionMatching — self-bid prevention', () => {
  it('skips copy_trade bids where the counterparty is the user themselves', async () => {
    const submitBid = vi.fn().mockResolvedValue({ signature: '0xresult' });
    // copy_trade order targeting someone else, but the bid counterparty IS ourselves
    const order = makeOrder({ copyTradeAddress: '0xMyAddress' });
    const auctionId = 'auction-self-copy-1';
    const started = makeAuctionStarted(auctionId);
    // The bid counterparty is our own address
    const bids = makeAuctionBids(auctionId, '0xMyAddress');

    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
        submitBid,
        address: '0xMyAddress' as `0x${string}`,
      },
    });

    await flush();

    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids],
      submitBid,
      address: '0xMyAddress' as `0x${string}`,
    });

    await flush();

    // Should NOT validate or submit — it's our own bid
    expect(mockValidateBidFull).not.toHaveBeenCalled();
    expect(submitBid).not.toHaveBeenCalled();
  });

  it('skips copy_trade self-bids with case-insensitive address matching', async () => {
    const submitBid = vi.fn().mockResolvedValue({ signature: '0xresult' });
    const order = makeOrder({ copyTradeAddress: '0xMYADDRESS' });
    const auctionId = 'auction-self-case-1';
    const started = makeAuctionStarted(auctionId);
    const bids = makeAuctionBids(auctionId, '0xMyAddress');

    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
        submitBid,
        address: '0xmyaddress' as `0x${string}`,
      },
    });

    await flush();

    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids],
      submitBid,
      address: '0xmyaddress' as `0x${string}`,
    });

    await flush();

    expect(submitBid).not.toHaveBeenCalled();
  });

  it('skips conditions auto-bid when the auction predictor is the user', async () => {
    const submitBid = vi.fn().mockResolvedValue({ signature: '0xresult' });
    const mockGetConditionMatchInfo = getConditionMatchInfo as ReturnType<
      typeof vi.fn
    >;
    mockGetConditionMatchInfo.mockReturnValue({
      matchedLegs: [{ marketId: '0xmarket1', prediction: true }],
      inverted: false,
    });

    const order = makeOrder({
      id: 'cond-order-1',
      strategy: 'conditions',
      copyTradeAddress: undefined,
      conditionSelections: [
        { conditionId: '0xCondition', outcome: 1 },
      ] as Order['conditionSelections'],
    });

    // Auction predictor is our own address
    const auctionId = 'auction-self-cond-1';
    const started = makeAuctionStarted(auctionId, {
      predictor: '0xMyAddress',
    });

    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
        submitBid,
        address: '0xMyAddress' as `0x${string}`,
      },
    });

    await flush();

    // Re-render shouldn't trigger any bid since predictor === address
    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started],
      submitBid,
      address: '0xMyAddress' as `0x${string}`,
    });

    await flush();

    expect(submitBid).not.toHaveBeenCalled();

    // Restore default mock
    mockGetConditionMatchInfo.mockReturnValue(null);
  });

  it('allows copy_trade bids from a different counterparty (not self)', async () => {
    const submitBid = vi.fn().mockResolvedValue({ signature: '0xresult' });
    const order = makeOrder({ copyTradeAddress: '0xTargetTrader' });
    const auctionId = 'auction-other-1';
    const started = makeAuctionStarted(auctionId);
    const bids = makeAuctionBids(auctionId, '0xTargetTrader');

    const { rerender } = renderHook((props) => useAuctionMatching(props), {
      initialProps: {
        ...DEFAULT_PARAMS,
        orders: [order],
        auctionMessages: [started],
        submitBid,
        address: '0xMyAddress' as `0x${string}`,
      },
    });

    await flush();

    rerender({
      ...DEFAULT_PARAMS,
      orders: [order],
      auctionMessages: [started, bids],
      submitBid,
      address: '0xMyAddress' as `0x${string}`,
    });

    await flush();

    // Should proceed normally — counterparty is not us
    expect(submitBid).toHaveBeenCalledTimes(1);
  });
});
