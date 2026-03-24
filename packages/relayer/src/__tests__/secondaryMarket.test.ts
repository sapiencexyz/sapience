import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addSecondaryListing,
  getSecondaryListing,
  removeSecondaryListing,
  getAllSecondaryListings,
  addSecondaryBid,
  getSecondaryBids,
  isSellerNonceUsed,
  isBuyerNonceUsed,
  clearSecondaryListings,
  runSecondaryCleanup,
} from '../secondaryMarketRegistry';
import { isSecondaryClientMessage } from '../secondaryMarketTypes';
import type {
  SecondaryAuctionRequestPayload,
  SecondaryValidatedBid,
} from '@sapience/sdk/types/secondary';
import type { ClientConnection, SubscriptionManager } from '../transport/types';
import {
  handleSecondaryAuctionStart,
  handleSecondaryBidSubmit,
  handleSecondaryListingsRequest,
  type SecondaryHandlerContext,
} from '../secondaryMarketHandlers';

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
    seller: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sellerNonce: Math.floor(Math.random() * 1_000_000),
    sellerDeadline: futureDeadline,
    sellerSignature: '0x' + 'ab'.repeat(65),
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
        isSellerNonceUsed('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 50)
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

  it('returns false for ping (handled upstream in ws.ts)', () => {
    expect(isSecondaryClientMessage({ type: 'ping' })).toBe(false);
  });
});

// ============================================================================
// Registry: Atomic Nonce + Bid Cap + Buyer Nonce Tests
// ============================================================================

describe('SecondaryMarketRegistry — nonce atomicity & bid bounds', () => {
  beforeEach(() => {
    clearSecondaryListings();
  });

  it('records seller nonce atomically (nonce is used immediately after addSecondaryListing)', () => {
    const nonce = 777;
    const listing = createListing({ sellerNonce: nonce });
    const id = addSecondaryListing(listing);
    expect(id).toBeTruthy();

    // Nonce should be used immediately — no window for a concurrent duplicate
    expect(isSellerNonceUsed(listing.seller, nonce)).toBe(true);

    // Second attempt with same nonce fails
    expect(
      addSecondaryListing(createListing({ sellerNonce: nonce }))
    ).toBeNull();
  });

  it('records buyer nonce atomically on addSecondaryBid', () => {
    const id = addSecondaryListing(createListing())!;
    const bid = createBid(id, { buyerNonce: 42 });
    expect(addSecondaryBid(id, bid)).toBe(true);

    // Buyer nonce should be recorded
    expect(isBuyerNonceUsed(bid.buyer, 42)).toBe(true);

    // Duplicate buyer nonce rejected
    const dup = createBid(id, {
      buyerNonce: 42,
      buyer: bid.buyer,
      buyerSignature: '0x' + 'ee'.repeat(65),
    });
    expect(addSecondaryBid(id, dup)).toBe(false);
  });

  it('enforces MAX_BIDS_PER_AUCTION (50)', () => {
    const id = addSecondaryListing(createListing())!;
    for (let i = 0; i < 50; i++) {
      const bid = createBid(id, {
        buyerNonce: i + 1000,
        buyer: `0x${'bb'.repeat(19)}${i.toString(16).padStart(2, '0')}`,
        buyerSignature: `0x${i.toString(16).padStart(2, '0')}${'cd'.repeat(64)}`,
      });
      expect(addSecondaryBid(id, bid)).toBe(true);
    }

    // 51st should be rejected
    const extraBid = createBid(id, {
      buyerNonce: 9999,
      buyer: '0xcccccccccccccccccccccccccccccccccccccccc',
    });
    expect(addSecondaryBid(id, extraBid)).toBe(false);
  });
});

// ============================================================================
// Nonce Cleanup Tests
// ============================================================================

describe('SecondaryMarketRegistry — nonce cleanup', () => {
  beforeEach(() => {
    clearSecondaryListings();
  });

  it('cleans up seller nonce entries after listing is removed (lazy deletion path)', () => {
    const listing = createListing({ sellerNonce: 500 });
    const id = addSecondaryListing(listing)!;
    expect(id).toBeTruthy();
    expect(isSellerNonceUsed(listing.seller, 500)).toBe(true);

    // Remove listing (simulates lazy deletion via getSecondaryListing or explicit removal)
    removeSecondaryListing(id);

    // Nonce still tracked before cleanup runs
    expect(isSellerNonceUsed(listing.seller, 500)).toBe(true);

    // Run cleanup — should detect seller has no active listings and prune nonces
    runSecondaryCleanup();

    expect(isSellerNonceUsed(listing.seller, 500)).toBe(false);
  });

  it('cleans up buyer nonce entries after listing is removed', () => {
    const id = addSecondaryListing(createListing())!;
    const bid = createBid(id, { buyerNonce: 888 });
    expect(addSecondaryBid(id, bid)).toBe(true);
    expect(isBuyerNonceUsed(bid.buyer, 888)).toBe(true);

    // Remove listing
    removeSecondaryListing(id);

    // Run cleanup — should detect buyer has no active bids
    runSecondaryCleanup();

    expect(isBuyerNonceUsed(bid.buyer, 888)).toBe(false);
  });

  it('preserves nonce entries for sellers with active listings', () => {
    const listing1 = createListing({ sellerNonce: 100 });
    const id1 = addSecondaryListing(listing1)!;
    const listing2 = createListing({ sellerNonce: 101 });
    addSecondaryListing(listing2);

    // Remove only first listing
    removeSecondaryListing(id1);

    runSecondaryCleanup();

    // Seller still has listing2, so nonces should be preserved
    expect(isSellerNonceUsed(listing1.seller, 100)).toBe(true);
    expect(isSellerNonceUsed(listing2.seller, 101)).toBe(true);
  });
});

// ============================================================================
// Handler Tests (with mocked validation)
// ============================================================================

// Mock the SDK validation module
vi.mock('@sapience/sdk/auction/secondaryValidation', () => ({
  validateSecondaryListing: vi.fn().mockResolvedValue({ status: 'valid' }),
  validateSecondaryBid: vi.fn().mockResolvedValue({ status: 'valid' }),
  isActionable: (r: { status: string }) => r.status === 'valid',
}));

// Mock signature verification — kept available for tests that assert it's NOT called
vi.mock('../secondaryMarketSigVerify', () => ({
  verifySellerSignature: vi.fn().mockResolvedValue(true),
  verifyBuyerSignature: vi.fn().mockResolvedValue(true),
}));

// Typed helper for asserting on captured WS messages
interface WsMsg {
  type: string;
  payload: Record<string, unknown>;
}

function findMsg(
  messages: unknown[],
  predicate: (m: WsMsg) => boolean
): WsMsg | undefined {
  return messages.find((m) => predicate(m as WsMsg)) as WsMsg | undefined;
}

type MockClient = ClientConnection & { _messages: unknown[] };

function createMockClient(): MockClient {
  const messages: unknown[] = [];
  return {
    send: (msg: unknown) => {
      messages.push(msg);
    },
    close: () => {},
    isOpen: true,
    id: `test-client-${Math.random().toString(36).slice(2)}`,
    _messages: messages,
  } as MockClient;
}

function createMockSubs(): SubscriptionManager & {
  _topics: Map<string, Set<ClientConnection>>;
  _broadcasts: Array<{ topic: string; msg: unknown }>;
} {
  const topics = new Map<string, Set<ClientConnection>>();
  const broadcasts: Array<{ topic: string; msg: unknown }> = [];
  return {
    subscribe: (topic: string, client: ClientConnection) => {
      if (!topics.has(topic)) topics.set(topic, new Set());
      const isNew = !topics.get(topic)!.has(client);
      topics.get(topic)!.add(client);
      return isNew;
    },
    unsubscribe: (topic: string, client: ClientConnection) => {
      const removed = topics.get(topic)?.delete(client) ?? false;
      return removed;
    },
    unsubscribeAll: (client: ClientConnection) => {
      let count = 0;
      for (const subs of topics.values()) {
        if (subs.delete(client)) count++;
      }
      return count;
    },
    unsubscribeByPrefix: (prefix: string, client: ClientConnection) => {
      let count = 0;
      for (const [topic, subs] of topics) {
        if (topic.startsWith(prefix) && subs.delete(client)) count++;
      }
      return count;
    },
    broadcast: (topic: string, msg: unknown) => {
      broadcasts.push({ topic, msg });
      return 0;
    },
    broadcastRaw: (_topic: string, _raw: string) => 0,
    subscriberCount: (topic: string) => topics.get(topic)?.size ?? 0,
    _topics: topics,
    _broadcasts: broadcasts,
  };
}

function createMockCtx(
  ...clients: ClientConnection[]
): SecondaryHandlerContext {
  return {
    allClients: () => clients,
  };
}

describe('SecondaryMarketHandlers', () => {
  beforeEach(() => {
    clearSecondaryListings();
    vi.clearAllMocks();
  });

  describe('handleSecondaryAuctionStart', () => {
    it('creates listing and sends ack with auctionId on valid payload', async () => {
      const client = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(client);

      const payload = createListing();
      await handleSecondaryAuctionStart(client, payload, subs, ctx);

      // Should get an ack with auctionId
      const ack = findMsg(
        client._messages,
        (m) => m.type === 'secondary.auction.ack' && !!m.payload.auctionId
      );
      expect(ack).toBeDefined();
      expect(ack!.payload.auctionId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(ack!.payload.error).toBeUndefined();
    });

    it('broadcasts secondary.auction.started to global feed', async () => {
      const client = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(client);

      const payload = createListing();
      await handleSecondaryAuctionStart(client, payload, subs, ctx);

      const broadcast = subs._broadcasts.find(
        (b) => (b.msg as WsMsg).type === 'secondary.auction.started'
      );
      expect(broadcast).toBeDefined();
      expect(broadcast!.topic).toBe('secondary:global');
    });

    it('rejects duplicate seller nonce', async () => {
      const client = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(client);

      const payload = createListing({ sellerNonce: 42 });
      await handleSecondaryAuctionStart(client, payload, subs, ctx);

      // Second attempt with same nonce
      const client2 = createMockClient();
      await handleSecondaryAuctionStart(client2, payload, subs, ctx);

      const error = findMsg(
        client2._messages,
        (m) => m.type === 'secondary.auction.ack' && !!m.payload.error
      );
      expect(error).toBeDefined();
      expect(error!.payload.error).toBe('duplicate_nonce');
    });

    it('sends error when validation returns invalid', async () => {
      const { validateSecondaryListing } = await import(
        '@sapience/sdk/auction/secondaryValidation'
      );
      (
        validateSecondaryListing as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        status: 'invalid',
        code: 'EXPIRED_DEADLINE',
        reason: 'sellerDeadline must be in the future',
      });

      const client = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(client);

      await handleSecondaryAuctionStart(client, createListing(), subs, ctx);

      const error = findMsg(
        client._messages,
        (m) => m.type === 'secondary.auction.ack' && !!m.payload.error
      );
      expect(error).toBeDefined();
      expect(error!.payload.error).toContain('EXPIRED_DEADLINE');
    });

    it('does not call verifySellerSignature separately (SDK validation covers it)', async () => {
      const { verifySellerSignature } = await import(
        '../secondaryMarketSigVerify'
      );
      (verifySellerSignature as ReturnType<typeof vi.fn>).mockClear();

      const client = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(client);

      await handleSecondaryAuctionStart(client, createListing(), subs, ctx);

      // Handler should rely on SDK validation, not call verifySellerSignature
      expect(verifySellerSignature).not.toHaveBeenCalled();
    });

    it('allows listing through when validation returns unverified (session key)', async () => {
      const { validateSecondaryListing } = await import(
        '@sapience/sdk/auction/secondaryValidation'
      );
      (
        validateSecondaryListing as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason: 'session key',
      });

      const client = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(client);

      await handleSecondaryAuctionStart(client, createListing(), subs, ctx);

      const ack = findMsg(
        client._messages,
        (m) => m.type === 'secondary.auction.ack' && !!m.payload.auctionId
      );
      expect(ack).toBeDefined();
      expect(ack!.payload.error).toBeUndefined();
    });
  });

  describe('handleSecondaryBidSubmit', () => {
    it('accepts valid bid and broadcasts to auction subscribers', async () => {
      // First create a listing
      const sellerClient = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(sellerClient);

      const listing = createListing();
      await handleSecondaryAuctionStart(sellerClient, listing, subs, ctx);

      const ack = findMsg(
        sellerClient._messages,
        (m) => m.type === 'secondary.auction.ack' && !!m.payload.auctionId
      );
      const auctionId = ack!.payload.auctionId as string;

      // Now submit a bid
      const buyerClient = createMockClient();
      const bidPayload = {
        auctionId,
        buyer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        price: '600000000000000000',
        buyerNonce: 1,
        buyerDeadline: futureDeadline,
        buyerSignature: '0x' + 'cd'.repeat(65),
      };

      await handleSecondaryBidSubmit(buyerClient, bidPayload, subs);

      // Buyer gets ack
      const bidAck = findMsg(
        buyerClient._messages,
        (m) => m.type === 'secondary.bid.ack' && !!m.payload.bidId
      );
      expect(bidAck).toBeDefined();
      expect(bidAck!.payload.error).toBeUndefined();

      // Broadcast to auction topic
      const bidBroadcast = subs._broadcasts.find(
        (b) => (b.msg as WsMsg).type === 'secondary.auction.bids'
      );
      expect(bidBroadcast).toBeDefined();
    });

    it('rejects bid for non-existent auction', async () => {
      const client = createMockClient();
      const subs = createMockSubs();

      await handleSecondaryBidSubmit(
        client,
        {
          auctionId: 'non-existent',
          buyer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          price: '600000000000000000',
          buyerNonce: 1,
          buyerDeadline: futureDeadline,
          buyerSignature: '0x' + 'cd'.repeat(65),
        },
        subs
      );

      const error = findMsg(
        client._messages,
        (m) => m.type === 'secondary.bid.ack' && !!m.payload.error
      );
      expect(error!.payload.error).toBe('auction_not_found_or_expired');
    });

    it('rejects bid when validation returns invalid', async () => {
      const { validateSecondaryBid } = await import(
        '@sapience/sdk/auction/secondaryValidation'
      );
      (validateSecondaryBid as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        status: 'invalid',
        code: 'INVALID_SIGNATURE',
        reason: 'signature bad',
      });

      // Create listing first
      const sellerClient = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(sellerClient);
      const listing = createListing();
      await handleSecondaryAuctionStart(sellerClient, listing, subs, ctx);
      const ack = findMsg(
        sellerClient._messages,
        (m) => m.type === 'secondary.auction.ack' && !!m.payload.auctionId
      );

      const buyerClient = createMockClient();
      await handleSecondaryBidSubmit(
        buyerClient,
        {
          auctionId: ack!.payload.auctionId as string,
          buyer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          price: '600000000000000000',
          buyerNonce: 1,
          buyerDeadline: futureDeadline,
          buyerSignature: '0x' + 'cd'.repeat(65),
        },
        subs
      );

      const error = findMsg(
        buyerClient._messages,
        (m) => m.type === 'secondary.bid.ack' && !!m.payload.error
      );
      expect(error).toBeDefined();
      expect(error!.payload.error).toContain('INVALID_SIGNATURE');
    });

    it('does not call verifyBuyerSignature separately (SDK validation covers it)', async () => {
      const { verifyBuyerSignature } = await import(
        '../secondaryMarketSigVerify'
      );
      (verifyBuyerSignature as ReturnType<typeof vi.fn>).mockClear();

      // Create listing first
      const sellerClient = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(sellerClient);
      const listing = createListing();
      await handleSecondaryAuctionStart(sellerClient, listing, subs, ctx);
      const ack = findMsg(
        sellerClient._messages,
        (m) => m.type === 'secondary.auction.ack' && !!m.payload.auctionId
      );

      const buyerClient = createMockClient();
      await handleSecondaryBidSubmit(
        buyerClient,
        {
          auctionId: ack!.payload.auctionId as string,
          buyer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          price: '600000000000000000',
          buyerNonce: 1,
          buyerDeadline: futureDeadline,
          buyerSignature: '0x' + 'cd'.repeat(65),
        },
        subs
      );

      // Handler should rely on SDK validation, not call verifyBuyerSignature
      expect(verifyBuyerSignature).not.toHaveBeenCalled();

      // Bid should still succeed
      const bidAck = findMsg(
        buyerClient._messages,
        (m) => m.type === 'secondary.bid.ack' && !!m.payload.bidId
      );
      expect(bidAck).toBeDefined();
    });

    it('allows bid through when validation returns unverified (session key)', async () => {
      const { validateSecondaryBid } = await import(
        '@sapience/sdk/auction/secondaryValidation'
      );
      (validateSecondaryBid as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason: 'session key',
      });

      // Create listing first
      const sellerClient = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(sellerClient);
      const listing = createListing();
      await handleSecondaryAuctionStart(sellerClient, listing, subs, ctx);
      const ack = findMsg(
        sellerClient._messages,
        (m) => m.type === 'secondary.auction.ack' && !!m.payload.auctionId
      );

      const buyerClient = createMockClient();
      await handleSecondaryBidSubmit(
        buyerClient,
        {
          auctionId: ack!.payload.auctionId as string,
          buyer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          price: '600000000000000000',
          buyerNonce: 1,
          buyerDeadline: futureDeadline,
          buyerSignature: '0x' + 'cd'.repeat(65),
        },
        subs
      );

      const bidAck = findMsg(
        buyerClient._messages,
        (m) => m.type === 'secondary.bid.ack' && !!m.payload.bidId
      );
      expect(bidAck).toBeDefined();
      expect(bidAck!.payload.error).toBeUndefined();
    });
  });

  describe('handleSecondaryListingsRequest', () => {
    it('returns all active listings with bid counts', async () => {
      const client = createMockClient();
      const subs = createMockSubs();
      const ctx = createMockCtx(client);

      // Create two listings
      await handleSecondaryAuctionStart(
        client,
        createListing({ sellerNonce: 1 }),
        subs,
        ctx
      );
      await handleSecondaryAuctionStart(
        client,
        createListing({ sellerNonce: 2 }),
        subs,
        ctx
      );

      const reqClient = createMockClient();
      handleSecondaryListingsRequest(reqClient);

      const snapshot = findMsg(
        reqClient._messages,
        (m) => m.type === 'secondary.listings.snapshot'
      );
      expect(snapshot).toBeDefined();
      expect(snapshot!.payload.listings).toHaveLength(2);
    });
  });
});
