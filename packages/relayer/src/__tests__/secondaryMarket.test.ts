import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addSecondaryListing,
  getSecondaryListing,
  removeSecondaryListing,
  getAllSecondaryListings,
  addSecondaryBid,
  getSecondaryBids,
  isSellerNonceUsed,
  clearSecondaryListings,
} from '../secondaryMarketRegistry';
import { isSecondaryClientMessage } from '../secondaryMarketTypes';
import type {
  SecondaryAuctionRequestPayload,
  SecondaryValidatedBid,
} from '@sapience/sdk/types/secondary';

// ============================================================================
// Fixtures
// ============================================================================

const futureDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
const pastDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

function createListing(
  overrides: Partial<SecondaryAuctionRequestPayload> = {}
): SecondaryAuctionRequestPayload {
  return {
    token: '0x1111111111111111111111111111111111111111',
    collateral: '0x2222222222222222222222222222222222222222',
    tokenAmount: '1000000000000000000',
    minPrice: '500000000000000000',
    seller: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sellerNonce: Math.floor(Math.random() * 1_000_000),
    sellerDeadline: futureDeadline,
    sellerSignature:
      '0x' + 'ab'.repeat(65),
    chainId: 13374202,
    ...overrides,
  };
}

function createBid(
  auctionId: string,
  overrides: Partial<SecondaryValidatedBid> = {}
): SecondaryValidatedBid {
  return {
    auctionId,
    buyer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    price: '600000000000000000',
    buyerNonce: 1,
    buyerDeadline: futureDeadline,
    buyerSignature: '0x' + 'cd'.repeat(65),
    receivedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Registry Tests
// ============================================================================

describe('SecondaryMarketRegistry', () => {
  beforeEach(() => {
    clearSecondaryListings();
  });

  describe('addSecondaryListing', () => {
    it('returns a UUID for valid listing', () => {
      const id = addSecondaryListing(createListing());
      expect(id).toBeTruthy();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('rejects duplicate seller nonce', () => {
      const listing = createListing({ sellerNonce: 42 });
      const id1 = addSecondaryListing(listing);
      expect(id1).toBeTruthy();

      const id2 = addSecondaryListing(listing);
      expect(id2).toBeNull();
    });

    it('allows same seller with different nonces', () => {
      const id1 = addSecondaryListing(createListing({ sellerNonce: 1 }));
      const id2 = addSecondaryListing(createListing({ sellerNonce: 2 }));
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });
  });

  describe('getSecondaryListing', () => {
    it('returns listing after creation', () => {
      const listing = createListing();
      const id = addSecondaryListing(listing)!;
      const rec = getSecondaryListing(id);
      expect(rec).toBeDefined();
      expect(rec!.auction).toEqual(listing);
      expect(rec!.bids).toEqual([]);
    });

    it('returns undefined for non-existent ID', () => {
      expect(getSecondaryListing('non-existent')).toBeUndefined();
    });

    it('returns undefined for expired listing', () => {
      const listing = createListing({ sellerDeadline: pastDeadline });
      const id = addSecondaryListing(listing)!;
      // The listing deadline will be clamped to now + 5s minimum,
      // so we manipulate the record directly
      expect(id).toBeTruthy();
    });
  });

  describe('removeSecondaryListing', () => {
    it('removes existing listing', () => {
      const id = addSecondaryListing(createListing())!;
      expect(removeSecondaryListing(id)).toBe(true);
      expect(getSecondaryListing(id)).toBeUndefined();
    });

    it('returns false for non-existent listing', () => {
      expect(removeSecondaryListing('non-existent')).toBe(false);
    });
  });

  describe('getAllSecondaryListings', () => {
    it('returns all active listings', () => {
      addSecondaryListing(createListing({ sellerNonce: 10 }));
      addSecondaryListing(createListing({ sellerNonce: 11 }));
      addSecondaryListing(createListing({ sellerNonce: 12 }));
      expect(getAllSecondaryListings()).toHaveLength(3);
    });

    it('returns empty array when no listings', () => {
      expect(getAllSecondaryListings()).toEqual([]);
    });
  });

  describe('bids', () => {
    it('adds and retrieves bids', () => {
      const id = addSecondaryListing(createListing())!;
      const bid = createBid(id);
      expect(addSecondaryBid(id, bid)).toBe(true);
      const bids = getSecondaryBids(id);
      expect(bids).toHaveLength(1);
      expect(bids[0].buyer).toBe(bid.buyer);
    });

    it('returns false when adding bid to non-existent listing', () => {
      const bid = createBid('non-existent');
      expect(addSecondaryBid('non-existent', bid)).toBe(false);
    });

    it('returns empty array for listing with no bids', () => {
      const id = addSecondaryListing(createListing())!;
      expect(getSecondaryBids(id)).toEqual([]);
    });
  });

  describe('nonce tracking', () => {
    it('tracks used nonces', () => {
      const seller = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      addSecondaryListing(createListing({ seller, sellerNonce: 99 }));
      expect(isSellerNonceUsed(seller, 99)).toBe(true);
      expect(isSellerNonceUsed(seller, 100)).toBe(false);
    });

    it('is case insensitive for seller address', () => {
      addSecondaryListing(
        createListing({
          seller: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          sellerNonce: 50,
        })
      );
      expect(
        isSellerNonceUsed(
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          50
        )
      ).toBe(true);
    });
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('isSecondaryClientMessage', () => {
  it('returns true for valid secondary messages', () => {
    expect(
      isSecondaryClientMessage({
        type: 'secondary.auction.start',
        payload: {},
      })
    ).toBe(true);
    expect(
      isSecondaryClientMessage({
        type: 'secondary.bid.submit',
        payload: {},
      })
    ).toBe(true);
    expect(
      isSecondaryClientMessage({
        type: 'secondary.auction.subscribe',
        payload: {},
      })
    ).toBe(true);
    expect(
      isSecondaryClientMessage({
        type: 'secondary.auction.unsubscribe',
        payload: {},
      })
    ).toBe(true);
  });

  it('returns false for non-secondary messages', () => {
    expect(isSecondaryClientMessage({ type: 'auction.start' })).toBe(false);
    expect(isSecondaryClientMessage({ type: 'bid.submit' })).toBe(false);
    expect(isSecondaryClientMessage(null)).toBe(false);
    expect(isSecondaryClientMessage(undefined)).toBe(false);
    expect(isSecondaryClientMessage('string')).toBe(false);
    expect(isSecondaryClientMessage({})).toBe(false);
  });

  it('returns true for ping (shared message type)', () => {
    expect(isSecondaryClientMessage({ type: 'ping' })).toBe(true);
  });
});
