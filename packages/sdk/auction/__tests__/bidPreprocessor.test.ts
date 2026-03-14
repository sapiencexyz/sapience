/**
 * Tests for the batch bid preprocessor.
 *
 * Mocks `validateBidFull` to test deduplication, batch processing,
 * concurrency limiting, and result mapping without RPC calls.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Address, Hex, PublicClient } from 'viem';
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
