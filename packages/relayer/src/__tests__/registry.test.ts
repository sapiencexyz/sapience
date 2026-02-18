import { describe, it, expect } from 'vitest';
import { upsertAuction, getAuction, addBid, getBids } from '../registry';
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

// Valid bid fixture - deadline must be in the future for verifyMakerBid
const createValidBid = (auctionId: string): BidPayload => ({
  auctionId,
  maker: '0x1234567890123456789012345678901234567890',
  makerWager: '500000000000000000',
  makerDeadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  makerSignature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
  makerNonce: 1,
});

describe('upsertAuction', () => {
  it('returns a valid UUID format auctionId', () => {
    const auctionId = upsertAuction(validAuction);
    // UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(auctionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('allows auction to be retrievable immediately after creation', () => {
    const auctionId = upsertAuction(validAuction);
    const retrieved = getAuction(auctionId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.auction).toEqual(validAuction);
  });

  it('initializes auction with empty bids array', () => {
    const auctionId = upsertAuction(validAuction);
    const retrieved = getAuction(auctionId);
    expect(retrieved?.bids).toEqual([]);
  });

  it('returns different auctionIds for different calls', () => {
    const id1 = upsertAuction(validAuction);
    const id2 = upsertAuction(validAuction);
    const id3 = upsertAuction(validAuction);
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it('sets deadline to approximately 60 seconds from now', () => {
    const beforeMs = Date.now();
    const auctionId = upsertAuction(validAuction);
    const afterMs = Date.now();

    const retrieved = getAuction(auctionId);
    expect(retrieved).toBeDefined();

    // Deadline should be between 59-61 seconds from creation time
    const expectedMin = beforeMs + 59_000;
    const expectedMax = afterMs + 61_000;
    expect(retrieved!.deadlineMs).toBeGreaterThanOrEqual(expectedMin);
    expect(retrieved!.deadlineMs).toBeLessThanOrEqual(expectedMax);
  });
});

describe('getAuction', () => {
  it('returns auction when valid and not expired', () => {
    const auctionId = upsertAuction(validAuction);
    const result = getAuction(auctionId);
    expect(result).toBeDefined();
    expect(result?.auction).toEqual(validAuction);
  });

  it('returns undefined when auctionId does not exist', () => {
    const result = getAuction('non-existent-id');
    expect(result).toBeUndefined();
  });

  it('returns undefined when auction has expired', () => {
    // Create auction and manually manipulate time
    const auctionId = upsertAuction(validAuction);

    // Get the auction and modify its deadline to be in the past
    const auction = getAuction(auctionId);
    expect(auction).toBeDefined();

    // Directly access and modify the deadline (hacky but needed for testing)
    auction!.deadlineMs = Date.now() - 1000; // Set to 1 second ago

    // Now trying to get it should return undefined
    const result = getAuction(auctionId);
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty string auctionId', () => {
    const result = getAuction('');
    expect(result).toBeUndefined();
  });
});

describe('addBid', () => {
  it('returns ValidatedBid for valid bid added to existing auction', () => {
    const auctionId = upsertAuction(validAuction);
    const bid = createValidBid(auctionId);

    const result = addBid(auctionId, bid);
    expect(result).toBeDefined();
    expect(result?.maker).toBe(bid.maker);
    expect(result?.makerWager).toBe(bid.makerWager);
  });

  it('returns undefined when auction does not exist', () => {
    const bid = createValidBid('non-existent-id');
    const result = addBid('non-existent-id', bid);
    expect(result).toBeUndefined();
  });

  it('returns undefined when auction is expired', () => {
    const auctionId = upsertAuction(validAuction);
    const auction = getAuction(auctionId);
    auction!.deadlineMs = Date.now() - 1000; // Expire it

    const bid = createValidBid(auctionId);
    const result = addBid(auctionId, bid);
    expect(result).toBeUndefined();
  });

  it('returns undefined when bid signature verification fails', () => {
    const auctionId = upsertAuction(validAuction);
    const invalidBid: BidPayload = {
      ...createValidBid(auctionId),
      makerSignature: 'invalid', // No 0x prefix, too short
    };

    const result = addBid(auctionId, invalidBid);
    expect(result).toBeUndefined();
  });

  it('appends bid to auction bids array', () => {
    const auctionId = upsertAuction(validAuction);
    const bid = createValidBid(auctionId);

    addBid(auctionId, bid);

    const auction = getAuction(auctionId);
    expect(auction?.bids).toHaveLength(1);
    expect(auction?.bids[0].maker).toBe(bid.maker);
  });

  it('extends auction deadline if bid deadline is later', () => {
    const auctionId = upsertAuction(validAuction);
    const auction = getAuction(auctionId);
    const originalDeadline = auction!.deadlineMs;

    // Create bid with deadline far in the future
    const bid: BidPayload = {
      ...createValidBid(auctionId),
      makerDeadline: Math.floor(Date.now() / 1000) + 7200, // 2 hours from now
    };

    addBid(auctionId, bid);

    const updatedAuction = getAuction(auctionId);
    expect(updatedAuction!.deadlineMs).toBeGreaterThan(originalDeadline);
    expect(updatedAuction!.deadlineMs).toBe(bid.makerDeadline * 1000);
  });

  it('keeps auction deadline unchanged if bid deadline is earlier', () => {
    const auctionId = upsertAuction(validAuction);
    const auction = getAuction(auctionId);
    const originalDeadline = auction!.deadlineMs;

    // Create bid with deadline just slightly in the future (but before auction deadline)
    const bid: BidPayload = {
      ...createValidBid(auctionId),
      makerDeadline: Math.floor(Date.now() / 1000) + 10, // 10 seconds from now
    };

    addBid(auctionId, bid);

    const updatedAuction = getAuction(auctionId);
    expect(updatedAuction!.deadlineMs).toBe(originalDeadline);
  });

  it('accumulates multiple bids in same auction', () => {
    const auctionId = upsertAuction(validAuction);

    const bid1: BidPayload = {
      ...createValidBid(auctionId),
      makerWager: '100',
    };
    const bid2: BidPayload = {
      ...createValidBid(auctionId),
      makerWager: '200',
      maker: '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead',
    };
    const bid3: BidPayload = {
      ...createValidBid(auctionId),
      makerWager: '300',
      maker: '0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef',
    };

    addBid(auctionId, bid1);
    addBid(auctionId, bid2);
    addBid(auctionId, bid3);

    const auction = getAuction(auctionId);
    expect(auction?.bids).toHaveLength(3);
  });

  it('returns undefined for bid with expired makerDeadline', () => {
    const auctionId = upsertAuction(validAuction);
    const expiredBid: BidPayload = {
      ...createValidBid(auctionId),
      makerDeadline: Math.floor(Date.now() / 1000) - 100, // 100 seconds ago
    };

    const result = addBid(auctionId, expiredBid);
    expect(result).toBeUndefined();
  });
});

describe('getBids', () => {
  it('returns empty array when auction does not exist', () => {
    const result = getBids('non-existent-id');
    expect(result).toEqual([]);
  });

  it('returns empty array when auction expired', () => {
    const auctionId = upsertAuction(validAuction);
    const auction = getAuction(auctionId);
    auction!.deadlineMs = Date.now() - 1000; // Expire it

    const result = getBids(auctionId);
    expect(result).toEqual([]);
  });

  it('returns all bids for valid auction', () => {
    const auctionId = upsertAuction(validAuction);

    const bid1 = createValidBid(auctionId);
    const bid2: BidPayload = {
      ...createValidBid(auctionId),
      maker: '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead',
    };

    addBid(auctionId, bid1);
    addBid(auctionId, bid2);

    const result = getBids(auctionId);
    expect(result).toHaveLength(2);
  });

  it('returns bids in insertion order', () => {
    const auctionId = upsertAuction(validAuction);

    const bid1: BidPayload = {
      ...createValidBid(auctionId),
      makerWager: '100',
    };
    const bid2: BidPayload = {
      ...createValidBid(auctionId),
      makerWager: '200',
      maker: '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead',
    };

    addBid(auctionId, bid1);
    addBid(auctionId, bid2);

    const result = getBids(auctionId);
    expect(result[0].makerWager).toBe('100');
    expect(result[1].makerWager).toBe('200');
  });

  it('returns empty array for auction with no bids', () => {
    const auctionId = upsertAuction(validAuction);
    const result = getBids(auctionId);
    expect(result).toEqual([]);
  });
});
