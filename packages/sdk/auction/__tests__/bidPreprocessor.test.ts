/**
 * Tests for the batch bid preprocessor.
 *
 * Mocks `validateBidFull` to test deduplication, batch processing,
 * concurrency limiting, and result mapping without RPC calls.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Address, PublicClient } from 'viem';
import {
  preprocessBids,
  getValidBids,
  getExcludedBidCount,
} from '../bidPreprocessor';
import type { BidPayload, PickJson } from '../../types/escrow';

// ─── Mock validateBidFull ──────────────────────────────────────────────────

const mockValidateBidFull = vi.fn();

vi.mock('../validation', () => ({
  validateBidFull: (...args: unknown[]) => mockValidateBidFull(...args),
}));

// ─── Test fixtures ────────────────────────────────────────────────────────────

const VERIFYING_CONTRACT =
  '0x1111111111111111111111111111111111111111' as Address;
const MARKET_ADDRESS = '0x3333333333333333333333333333333333333333' as Address;
const TOKEN_ADDRESS = '0x4444444444444444444444444444444444444444' as Address;
const CHAIN_ID = 42161;

const TEST_PICKS: PickJson[] = [
  {
    conditionResolver: '0x2222222222222222222222222222222222222222',
    conditionId:
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    predictedOutcome: 1,
  },
];

const mockPublicClient = {} as PublicClient;

const DEFAULT_OPTS = {
  chainId: CHAIN_ID,
  predictionMarketAddress: MARKET_ADDRESS,
  collateralTokenAddress: TOKEN_ADDRESS,
  verifyingContract: VERIFYING_CONTRACT,
  publicClient: mockPublicClient,
};

const AUCTION_CONTEXT = {
  picks: TEST_PICKS,
  predictorCollateral: '1000000000000000000',
  predictor: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  chainId: CHAIN_ID,
};

function makeBid(overrides: Partial<BidPayload> = {}): BidPayload {
  return {
    auctionId: 'auction-1',
    counterparty: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    counterpartyCollateral: '500000000000000000',
    counterpartyNonce: 42,
    counterpartyDeadline: Math.floor(Date.now() / 1000) + 600,
    counterpartySignature: '0xdeadbeef01',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('preprocessBids', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateBidFull.mockResolvedValue({ status: 'valid' });
  });

  test('returns empty array for empty input', async () => {
    const result = await preprocessBids([], AUCTION_CONTEXT, DEFAULT_OPTS);
    expect(result).toEqual([]);
    expect(mockValidateBidFull).not.toHaveBeenCalled();
  });

  test('validates each bid via validateBidFull', async () => {
    const bids = [
      makeBid({ counterpartySignature: '0xsig1' }),
      makeBid({ counterpartySignature: '0xsig2' }),
    ];

    const result = await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(mockValidateBidFull).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].validationStatus).toBe('valid');
    expect(result[1].validationStatus).toBe('valid');
  });

  test('deduplicates by counterpartySignature', async () => {
    const bids = [
      makeBid({ counterpartySignature: '0xsame' }),
      makeBid({ counterpartySignature: '0xsame' }),
      makeBid({ counterpartySignature: '0xdifferent' }),
    ];

    const result = await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(mockValidateBidFull).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  test('maps invalid results correctly', async () => {
    mockValidateBidFull.mockResolvedValue({
      status: 'invalid',
      code: 'EXPIRED_DEADLINE',
      reason: 'Bid has expired',
    });

    const bids = [makeBid()];
    const result = await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(result[0].validationStatus).toBe('invalid');
    expect(result[0].validationError).toBe('Bid has expired');
    expect(result[0].validationCode).toBe('EXPIRED_DEADLINE');
  });

  test('maps unverified results correctly', async () => {
    mockValidateBidFull.mockResolvedValue({
      status: 'unverified',
      code: 'SIGNATURE_UNVERIFIABLE',
      reason: 'Signature could not be verified offline',
    });

    const bids = [makeBid()];
    const result = await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(result[0].validationStatus).toBe('unverified');
    expect(result[0].validationError).toBe(
      'Signature could not be verified offline'
    );
    expect(result[0].validationCode).toBe('SIGNATURE_UNVERIFIABLE');
  });

  test('handles mixed valid/invalid/unverified bids', async () => {
    mockValidateBidFull
      .mockResolvedValueOnce({ status: 'valid' })
      .mockResolvedValueOnce({
        status: 'invalid',
        code: 'INVALID_SIGNATURE',
        reason: 'Bad sig',
      })
      .mockResolvedValueOnce({
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason: 'Cannot verify',
      });

    const bids = [
      makeBid({ counterpartySignature: '0xsig1' }),
      makeBid({ counterpartySignature: '0xsig2' }),
      makeBid({ counterpartySignature: '0xsig3' }),
    ];

    const result = await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(result[0].validationStatus).toBe('valid');
    expect(result[1].validationStatus).toBe('invalid');
    expect(result[2].validationStatus).toBe('unverified');
  });

  test('handles validateBidFull throwing without killing batch', async () => {
    mockValidateBidFull
      .mockResolvedValueOnce({ status: 'valid' })
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValueOnce({ status: 'valid' });

    const bids = [
      makeBid({ counterpartySignature: '0xsig1' }),
      makeBid({ counterpartySignature: '0xsig2' }),
      makeBid({ counterpartySignature: '0xsig3' }),
    ];

    const result = await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(result).toHaveLength(3);
    expect(result[0].validationStatus).toBe('valid');
    expect(result[1].validationStatus).toBe('unverified');
    expect(result[1].validationError).toBe(
      'Validation threw an unexpected error'
    );
    expect(result[2].validationStatus).toBe('valid');
  });

  test('respects concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    mockValidateBidFull.mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return { status: 'valid' };
    });

    const bids = Array.from({ length: 8 }, (_, i) =>
      makeBid({ counterpartySignature: `0xsig${i}` })
    );

    await preprocessBids(bids, AUCTION_CONTEXT, {
      ...DEFAULT_OPTS,
      concurrency: 3,
    });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(mockValidateBidFull).toHaveBeenCalledTimes(8);
  });

  test('passes correct opts to validateBidFull', async () => {
    const bids = [makeBid()];
    await preprocessBids(bids, AUCTION_CONTEXT, {
      ...DEFAULT_OPTS,
      checkPredictor: false,
    });

    expect(mockValidateBidFull).toHaveBeenCalledWith(
      bids[0],
      AUCTION_CONTEXT,
      expect.objectContaining({
        verifyingContract: VERIFYING_CONTRACT,
        chainId: CHAIN_ID,
        predictionMarketAddress: MARKET_ADDRESS,
        collateralTokenAddress: TOKEN_ADDRESS,
        publicClient: mockPublicClient,
        checkPredictor: false,
      })
    );
  });

  test('preserves original bid object in ProcessedBid', async () => {
    const bid = makeBid({ counterpartySignature: '0xoriginal' });
    const result = await preprocessBids([bid], AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(result[0].bid).toBe(bid);
  });

  test('error isolation: thrown error produces validationCode VALIDATION_ERROR', async () => {
    mockValidateBidFull.mockRejectedValueOnce(new Error('RPC exploded'));

    const bids = [makeBid()];
    const result = await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(result[0].validationStatus).toBe('unverified');
    expect(result[0].validationCode).toBe('VALIDATION_ERROR');
  });

  test('single bid that throws yields one unverified result', async () => {
    mockValidateBidFull.mockRejectedValueOnce(new Error('network error'));

    const bids = [makeBid({ counterpartySignature: '0xonly' })];
    const result = await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(result).toHaveLength(1);
    expect(result[0].validationStatus).toBe('unverified');
  });

  test('all bids throw: all results are unverified, batch still completes', async () => {
    mockValidateBidFull.mockRejectedValue(new Error('total failure'));

    const bids = Array.from({ length: 4 }, (_, i) =>
      makeBid({ counterpartySignature: `0xsig${i}` })
    );

    const result = await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(result).toHaveLength(4);
    expect(result.every((r) => r.validationStatus === 'unverified')).toBe(true);
  });

  test('default concurrency is 5: no more than 5 concurrent with 10+ bids', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    mockValidateBidFull.mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return { status: 'valid' };
    });

    const bids = Array.from({ length: 12 }, (_, i) =>
      makeBid({ counterpartySignature: `0xsig${i}` })
    );

    // No concurrency option — should use the default of 5
    await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(maxConcurrent).toBeLessThanOrEqual(5);
    expect(mockValidateBidFull).toHaveBeenCalledTimes(12);
  });

  test('concurrency of 1 processes bids sequentially', async () => {
    const order: number[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    mockValidateBidFull.mockImplementation(async (_bid, _ctx, _opts) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      order.push(concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return { status: 'valid' };
    });

    const bids = Array.from({ length: 6 }, (_, i) =>
      makeBid({ counterpartySignature: `0xsig${i}` })
    );

    await preprocessBids(bids, AUCTION_CONTEXT, {
      ...DEFAULT_OPTS,
      concurrency: 1,
    });

    expect(maxConcurrent).toBe(1);
    expect(mockValidateBidFull).toHaveBeenCalledTimes(6);
  });

  test('deduplication keeps first occurrence data', async () => {
    const firstBid = makeBid({
      counterpartySignature: '0xdupesig',
      counterpartyCollateral: '111111111',
    });
    const secondBid = makeBid({
      counterpartySignature: '0xdupesig',
      counterpartyCollateral: '999999999',
    });

    const result = await preprocessBids(
      [firstBid, secondBid],
      AUCTION_CONTEXT,
      DEFAULT_OPTS
    );

    // Only one result after dedup
    expect(result).toHaveLength(1);
    // The result's bid is the first occurrence
    expect(result[0].bid).toBe(firstBid);
    expect(result[0].bid.counterpartyCollateral).toBe('111111111');
  });

  test('large batch (50 bids) processes correctly with default concurrency', async () => {
    const bids = Array.from({ length: 50 }, (_, i) =>
      makeBid({ counterpartySignature: `0xsig${i}` })
    );

    const result = await preprocessBids(bids, AUCTION_CONTEXT, DEFAULT_OPTS);

    expect(result).toHaveLength(50);
    expect(mockValidateBidFull).toHaveBeenCalledTimes(50);
    expect(result.every((r) => r.validationStatus === 'valid')).toBe(true);
  });
});

describe('getValidBids', () => {
  test('filters to only valid bids', () => {
    const processed = [
      { bid: makeBid(), validationStatus: 'valid' as const },
      {
        bid: makeBid(),
        validationStatus: 'invalid' as const,
        validationError: 'bad',
      },
      {
        bid: makeBid(),
        validationStatus: 'unverified' as const,
        validationError: 'cannot verify',
      },
      { bid: makeBid(), validationStatus: 'valid' as const },
    ];

    const valid = getValidBids(processed);
    expect(valid).toHaveLength(2);
    expect(valid.every((p) => p.validationStatus === 'valid')).toBe(true);
  });

  test('returns empty for all-invalid batch', () => {
    const processed = [
      {
        bid: makeBid(),
        validationStatus: 'invalid' as const,
        validationError: 'bad',
      },
    ];

    expect(getValidBids(processed)).toHaveLength(0);
  });
});

describe('getExcludedBidCount', () => {
  test('counts invalid + unverified bids', () => {
    const processed = [
      { bid: makeBid(), validationStatus: 'valid' as const },
      {
        bid: makeBid(),
        validationStatus: 'invalid' as const,
        validationError: 'bad',
      },
      {
        bid: makeBid(),
        validationStatus: 'unverified' as const,
        validationError: 'cannot verify',
      },
    ];

    expect(getExcludedBidCount(processed)).toBe(2);
  });

  test('returns 0 for all-valid batch', () => {
    const processed = [
      { bid: makeBid(), validationStatus: 'valid' as const },
      { bid: makeBid(), validationStatus: 'valid' as const },
    ];

    expect(getExcludedBidCount(processed)).toBe(0);
  });
});

describe('generic type preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateBidFull.mockResolvedValue({ status: 'valid' });
  });

  test('ProcessedBid<T> preserves extended BidPayload fields', async () => {
    interface ExtendedBid extends BidPayload {
      customScore: number;
      source: string;
    }

    const extendedBid: ExtendedBid = {
      ...makeBid({ counterpartySignature: '0xext1' }),
      customScore: 42,
      source: 'market-maker',
    };

    const result = await preprocessBids<ExtendedBid>(
      [extendedBid],
      AUCTION_CONTEXT,
      DEFAULT_OPTS
    );

    expect(result).toHaveLength(1);
    expect(result[0].bid.customScore).toBe(42);
    expect(result[0].bid.source).toBe('market-maker');
    expect(result[0].validationStatus).toBe('valid');
  });
});
