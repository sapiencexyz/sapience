import { describe, it, expect } from 'vitest';
import {
  validateAuctionForMint,
  verifyMakerBid,
  createMintParlayRequestData,
  calculateExpectedPayout,
  validatePayout,
  createValidationError,
} from '../helpers';
import type { AuctionRequestPayload } from '../types';

// Valid auction fixture
const validAuction: AuctionRequestPayload = {
  wager: '1000000000000000000', // 1 ETH
  predictedOutcomes: ['0xdeadbeef'],
  resolver: '0x1234567890123456789012345678901234567890',
  taker: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  takerNonce: 1,
  chainId: 42161,
};

// Valid bid fixture
const validBidParams = {
  auctionId: 'test-auction-id',
  maker: '0x1234567890123456789012345678901234567890',
  makerWager: '500000000000000000', // 0.5 ETH
  makerDeadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  makerSignature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
};

describe('validateAuctionForMint', () => {
  it('returns valid: true for a valid auction with all correct fields', () => {
    const result = validateAuctionForMint(validAuction);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  describe('wager validation', () => {
    it('returns valid: false for wager of "0"', () => {
      const result = validateAuctionForMint({ ...validAuction, wager: '0' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('wager');
    });

    it('returns valid: false for negative wager', () => {
      const result = validateAuctionForMint({ ...validAuction, wager: '-1' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('wager');
    });

    it('returns valid: false for empty wager string', () => {
      const result = validateAuctionForMint({ ...validAuction, wager: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('wager');
    });

    it('throws or returns valid: false for non-numeric wager string', () => {
      expect(() => validateAuctionForMint({ ...validAuction, wager: 'abc' })).toThrow();
    });
  });

  describe('predictedOutcomes validation', () => {
    it('returns valid: false for empty predictedOutcomes array', () => {
      const result = validateAuctionForMint({ ...validAuction, predictedOutcomes: [] });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('outcome');
    });

    it('returns valid: false for predictedOutcomes with empty string element', () => {
      const result = validateAuctionForMint({ ...validAuction, predictedOutcomes: [''] });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('outcome');
    });

    it('returns valid: false for undefined predictedOutcomes', () => {
      const auction = { ...validAuction } as AuctionRequestPayload;
      // @ts-expect-error - testing invalid input
      delete auction.predictedOutcomes;
      const result = validateAuctionForMint(auction);
      expect(result.valid).toBe(false);
    });
  });

  describe('chainId validation', () => {
    it('returns valid: false for chainId of 0', () => {
      const result = validateAuctionForMint({ ...validAuction, chainId: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('chainId');
    });

    it('returns valid: false for chainId of NaN', () => {
      const result = validateAuctionForMint({ ...validAuction, chainId: NaN });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('chainId');
    });

    it('returns valid: false for chainId of Infinity', () => {
      const result = validateAuctionForMint({ ...validAuction, chainId: Infinity });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('chainId');
    });

    it('returns valid: false for negative chainId', () => {
      const result = validateAuctionForMint({ ...validAuction, chainId: -1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('chainId');
    });
  });

  describe('resolver validation', () => {
    it('returns valid: false for resolver without "0x" prefix', () => {
      const result = validateAuctionForMint({ ...validAuction, resolver: '1234567890123456789012345678901234567890' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('resolver');
    });

    it('returns valid: false for resolver with only 39 hex chars', () => {
      const result = validateAuctionForMint({ ...validAuction, resolver: '0x123456789012345678901234567890123456789' }); // 39 chars
      expect(result.valid).toBe(false);
      expect(result.error).toContain('resolver');
    });

    it('returns valid: false for resolver with 41 hex chars', () => {
      const result = validateAuctionForMint({ ...validAuction, resolver: '0x12345678901234567890123456789012345678901' }); // 41 chars
      expect(result.valid).toBe(false);
      expect(result.error).toContain('resolver');
    });

    it('returns valid: false for resolver with invalid hex chars', () => {
      const result = validateAuctionForMint({ ...validAuction, resolver: '0x123456789012345678901234567890123456789g' }); // 'g' is invalid
      expect(result.valid).toBe(false);
      expect(result.error).toContain('resolver');
    });
  });

  describe('taker validation', () => {
    it('returns valid: false for taker with invalid format', () => {
      const result = validateAuctionForMint({ ...validAuction, taker: 'invalid-address' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('taker');
    });

    it('returns valid: false for missing taker', () => {
      const result = validateAuctionForMint({ ...validAuction, taker: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('taker');
    });
  });

  describe('takerNonce validation', () => {
    it('returns valid: false for takerNonce of -1', () => {
      const result = validateAuctionForMint({ ...validAuction, takerNonce: -1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('takerNonce');
    });

    it('returns valid: false for takerNonce of Infinity', () => {
      const result = validateAuctionForMint({ ...validAuction, takerNonce: Infinity });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('takerNonce');
    });

    it('accepts takerNonce of 0', () => {
      const result = validateAuctionForMint({ ...validAuction, takerNonce: 0 });
      expect(result.valid).toBe(true);
    });
  });
});

describe('verifyMakerBid', () => {
  it('returns ok: true for valid bid', () => {
    const result = verifyMakerBid(validBidParams);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  describe('auctionId validation', () => {
    it('returns ok: false with reason "invalid_auction_id" for empty auctionId', () => {
      const result = verifyMakerBid({ ...validBidParams, auctionId: '' });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_auction_id');
    });

    it('returns ok: false for undefined auctionId', () => {
      // @ts-expect-error - testing invalid input
      const result = verifyMakerBid({ ...validBidParams, auctionId: undefined });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_auction_id');
    });
  });

  describe('maker validation', () => {
    it('returns ok: false with reason "invalid_maker" for invalid maker address format', () => {
      const result = verifyMakerBid({ ...validBidParams, maker: 'not-an-address' });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker');
    });

    it('returns ok: false for maker address with wrong length', () => {
      const result = verifyMakerBid({ ...validBidParams, maker: '0x1234' });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker');
    });
  });

  describe('makerWager validation', () => {
    it('returns ok: false with reason "invalid_maker_wager" for makerWager of "0"', () => {
      const result = verifyMakerBid({ ...validBidParams, makerWager: '0' });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker_wager');
    });

    it('returns ok: false for empty makerWager', () => {
      const result = verifyMakerBid({ ...validBidParams, makerWager: '' });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker_wager');
    });

    it('returns ok: false for negative makerWager', () => {
      const result = verifyMakerBid({ ...validBidParams, makerWager: '-100' });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker_wager');
    });
  });

  describe('makerDeadline validation', () => {
    it('returns ok: false with reason "quote_expired" for expired makerDeadline', () => {
      const result = verifyMakerBid({ ...validBidParams, makerDeadline: Math.floor(Date.now() / 1000) - 100 });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('quote_expired');
    });

    it('returns ok: false for makerDeadline equal to current time', () => {
      const result = verifyMakerBid({ ...validBidParams, makerDeadline: Math.floor(Date.now() / 1000) });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('quote_expired');
    });

    it('returns ok: false for non-finite makerDeadline', () => {
      const result = verifyMakerBid({ ...validBidParams, makerDeadline: Infinity });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('quote_expired');
    });
  });

  describe('makerSignature validation', () => {
    it('returns ok: false with reason "invalid_maker_bid_signature_format" for signature without "0x" prefix', () => {
      const result = verifyMakerBid({ ...validBidParams, makerSignature: '1234567890' });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker_bid_signature_format');
    });

    it('returns ok: false for signature shorter than 10 chars', () => {
      const result = verifyMakerBid({ ...validBidParams, makerSignature: '0x1234' });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker_bid_signature_format');
    });

    it('accepts signature with exactly 10 chars', () => {
      const result = verifyMakerBid({ ...validBidParams, makerSignature: '0x12345678' }); // 10 chars
      expect(result.ok).toBe(true);
    });
  });
});

describe('createMintParlayRequestData', () => {
  it('returns correctly structured MintParlayRequestData for valid auction', () => {
    const result = createMintParlayRequestData(validAuction, validAuction.taker, '100');
    expect(result).toEqual({
      taker: validAuction.taker,
      predictedOutcomes: validAuction.predictedOutcomes,
      resolver: validAuction.resolver,
      wager: validAuction.wager,
      takerCollateral: '100',
    });
  });

  it('throws Error for auction without resolver', () => {
    const auctionWithoutResolver = { ...validAuction, resolver: '' };
    expect(() => createMintParlayRequestData(auctionWithoutResolver, validAuction.taker, '100')).toThrow('resolver');
  });

  it('throws Error for null auction', () => {
    // @ts-expect-error - testing invalid input
    expect(() => createMintParlayRequestData(null, validAuction.taker, '100')).toThrow();
  });

  it('preserves exact taker and takerCollateral values', () => {
    const customTaker = '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead';
    const customCollateral = '999999999999999999';
    const result = createMintParlayRequestData(validAuction, customTaker, customCollateral);
    expect(result.taker).toBe(customTaker);
    expect(result.takerCollateral).toBe(customCollateral);
  });
});

describe('calculateExpectedPayout', () => {
  it('returns sum of wager and takerCollateral as string', () => {
    const result = calculateExpectedPayout('1000', '500');
    expect(result).toBe('1500');
  });

  it('handles large BigInt values without overflow', () => {
    const largeWager = '999999999999999999999999999999';
    const largeCollateral = '1';
    const result = calculateExpectedPayout(largeWager, largeCollateral);
    expect(result).toBe('1000000000000000000000000000000');
  });

  it('handles zero values', () => {
    const result = calculateExpectedPayout('0', '0');
    expect(result).toBe('0');
  });

  it('returns string format (not number)', () => {
    const result = calculateExpectedPayout('100', '50');
    expect(typeof result).toBe('string');
  });
});

describe('validatePayout', () => {
  it('returns true for matching payouts', () => {
    const result = validatePayout('1000', '500', '1500');
    expect(result).toBe(true);
  });

  it('returns false for non-matching payouts', () => {
    const result = validatePayout('1000', '500', '1600');
    expect(result).toBe(false);
  });

  it('returns false for off-by-one values', () => {
    const result = validatePayout('1000', '500', '1501');
    expect(result).toBe(false);
  });

  it('handles large values correctly', () => {
    const result = validatePayout('999999999999999999', '1', '1000000000000000000');
    expect(result).toBe(true);
  });
});

describe('createValidationError', () => {
  it('returns base message without context', () => {
    const result = createValidationError('test reason');
    expect(result).toBe('Validation failed: test reason');
  });

  it('includes context in message', () => {
    const result = createValidationError('test reason', { field: 'value', count: 5 });
    expect(result).toContain('Validation failed: test reason');
    expect(result).toContain('field=value');
    expect(result).toContain('count=5');
  });

  it('handles empty context object', () => {
    const result = createValidationError('test reason', {});
    expect(result).toBe('Validation failed: test reason');
  });
});
