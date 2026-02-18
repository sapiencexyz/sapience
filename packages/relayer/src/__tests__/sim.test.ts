import { describe, it, expect } from 'vitest';
import { basicValidateBid } from '../sim';
import type { AuctionRequestPayload, BidPayload } from '../types';

// Valid auction fixture
const validAuction: AuctionRequestPayload = {
  wager: '1000000000000000000',
  predictedOutcomes: ['0xdeadbeef'],
  resolver: '0x1234567890123456789012345678901234567890',
  taker: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  takerNonce: 1,
  chainId: 42161,
};

// Valid bid fixture
const validBid: BidPayload = {
  auctionId: 'test-auction-id',
  maker: '0x1234567890123456789012345678901234567890',
  makerWager: '500000000000000000',
  makerDeadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  makerSignature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
  makerNonce: 1,
};

describe('basicValidateBid', () => {
  it('returns ok: true for valid auction and bid pair', () => {
    const result = basicValidateBid(validAuction, validBid);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  describe('null/undefined inputs', () => {
    it('returns ok: false with reason "invalid_payload" when auction is null', () => {
      // @ts-expect-error - testing invalid input
      const result = basicValidateBid(null, validBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_payload');
    });

    it('returns ok: false with reason "invalid_payload" when bid is null', () => {
      // @ts-expect-error - testing invalid input
      const result = basicValidateBid(validAuction, null);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_payload');
    });

    it('returns ok: false with reason "invalid_payload" when both are null', () => {
      // @ts-expect-error - testing invalid input
      const result = basicValidateBid(null, null);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_payload');
    });

    it('returns ok: false with reason "invalid_payload" when auction is undefined', () => {
      // @ts-expect-error - testing invalid input
      const result = basicValidateBid(undefined, validBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_payload');
    });
  });

  describe('auction validation cascade', () => {
    it('returns ok: false when auction validation fails (invalid wager)', () => {
      const invalidAuction = { ...validAuction, wager: '0' };
      const result = basicValidateBid(invalidAuction, validBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Validation failed');
    });

    it('returns ok: false when auction has invalid chainId', () => {
      const invalidAuction = { ...validAuction, chainId: 0 };
      const result = basicValidateBid(invalidAuction, validBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Validation failed');
    });

    it('returns ok: false when auction has invalid resolver', () => {
      const invalidAuction = { ...validAuction, resolver: 'invalid' };
      const result = basicValidateBid(invalidAuction, validBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Validation failed');
    });
  });

  describe('maker validation', () => {
    it('returns ok: false with reason "invalid_maker" when maker is empty', () => {
      const invalidBid = { ...validBid, maker: '' };
      const result = basicValidateBid(validAuction, invalidBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker');
    });

    it('returns ok: false with reason "invalid_maker" when maker is not a valid address', () => {
      const invalidBid = { ...validBid, maker: 'not-an-address' };
      const result = basicValidateBid(validAuction, invalidBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker');
    });
  });

  describe('makerWager validation', () => {
    it('returns ok: false with reason "invalid_maker_wager" when makerWager is missing', () => {
      const invalidBid = { ...validBid, makerWager: '' };
      const result = basicValidateBid(validAuction, invalidBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker_wager');
    });

    it('returns ok: false with reason "invalid_maker_wager" when makerWager is 0', () => {
      const invalidBid = { ...validBid, makerWager: '0' };
      const result = basicValidateBid(validAuction, invalidBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker_wager');
    });

    it('returns ok: false with reason "invalid_maker_wager" when makerWager is negative', () => {
      const invalidBid = { ...validBid, makerWager: '-100' };
      const result = basicValidateBid(validAuction, invalidBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker_wager');
    });

    it('returns ok: false with reason "invalid_wager_values" when makerWager is non-numeric', () => {
      const invalidBid = { ...validBid, makerWager: 'abc' };
      const result = basicValidateBid(validAuction, invalidBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_wager_values');
    });
  });

  describe('signature check cascade', () => {
    it('returns ok: false when signature check fails (expired deadline)', () => {
      const invalidBid = {
        ...validBid,
        makerDeadline: Math.floor(Date.now() / 1000) - 100, // 100 seconds ago
      };
      const result = basicValidateBid(validAuction, invalidBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('quote_expired');
    });

    it('returns ok: false when signature check fails (invalid signature format)', () => {
      const invalidBid = {
        ...validBid,
        makerSignature: 'invalid-signature',
      };
      const result = basicValidateBid(validAuction, invalidBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_maker_bid_signature_format');
    });

    it('returns ok: false when auctionId is empty', () => {
      const invalidBid = { ...validBid, auctionId: '' };
      const result = basicValidateBid(validAuction, invalidBid);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_auction_id');
    });
  });

  describe('edge cases', () => {
    it('accepts valid bid with very large wager values', () => {
      const largeWagerBid = {
        ...validBid,
        makerWager: '999999999999999999999999999999999999',
      };
      const result = basicValidateBid(validAuction, largeWagerBid);
      expect(result.ok).toBe(true);
    });

    it('accepts valid bid with deadline just 1 second in future', () => {
      const nearDeadlineBid = {
        ...validBid,
        makerDeadline: Math.floor(Date.now() / 1000) + 1,
      };
      const result = basicValidateBid(validAuction, nearDeadlineBid);
      expect(result.ok).toBe(true);
    });
  });
});
