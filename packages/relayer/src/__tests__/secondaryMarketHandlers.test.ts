import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type {
  SecondaryAuctionRequestPayload,
  SecondaryBidPayload,
} from '@sapience/sdk/types/secondary';
import { clearSecondaryListings } from '../secondaryMarketRegistry';

// ---------------------------------------------------------------------------
// Mock signature verification
// ---------------------------------------------------------------------------

vi.mock('../secondaryMarketSigVerify', () => ({
  verifySellerSignature: vi.fn().mockResolvedValue(true),
  verifyBuyerSignature: vi.fn().mockResolvedValue(true),
}));

import {
  verifySellerSignature,
  verifyBuyerSignature,
} from '../secondaryMarketSigVerify';

import {
  handleSecondaryAuctionStart,
  handleSecondaryBidSubmit,
  handleSecondarySubscribe,
  handleSecondaryUnsubscribe,
  handleSecondaryFeedSubscribe,
  handleSecondaryFeedUnsubscribe,
  handleSecondaryListingsRequest,
  unsubscribeFromAllSecondary,
  clearSecondaryHandlerState,
} from '../secondaryMarketHandlers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WsMessage {
  type: string;
  payload: Record<string, unknown>;
}

const futureDeadline = Math.floor(Date.now() / 1000) + 3600;

function createMockWs(): WebSocket {
  return {
    send: vi.fn(),
    readyState: 1,
  } as unknown as WebSocket;
}

function parseSent(ws: WebSocket, callIndex = 0): unknown {
  const call = (ws.send as ReturnType<typeof vi.fn>).mock.calls[callIndex];
  return call ? JSON.parse(call[0] as string) : undefined;
}

function allSent(ws: WebSocket): unknown[] {
  return (ws.send as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) =>
    JSON.parse(c[0] as string)
  );
}

function createAuctionPayload(
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
    sellerSignature: '0x' + 'ab'.repeat(65),
    chainId: 13374202,
    ...overrides,
  };
}

function createBidPayload(
  auctionId: string,
  overrides: Partial<SecondaryBidPayload> = {}
): SecondaryBidPayload {
  return {
    auctionId,
    buyer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    price: '600000000000000000',
    buyerNonce: 1,
    buyerDeadline: futureDeadline,
    buyerSignature: '0x' + 'cd'.repeat(65),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SecondaryMarketHandlers', () => {
  beforeEach(() => {
    clearSecondaryListings();
    clearSecondaryHandlerState();
    vi.mocked(verifySellerSignature).mockResolvedValue(true);
    vi.mocked(verifyBuyerSignature).mockResolvedValue(true);
  });

  // ========================================================================
  // handleSecondaryAuctionStart
  // ========================================================================

  describe('handleSecondaryAuctionStart', () => {
    it('valid signature sends ack with auctionId and auto-subscribes seller', async () => {
      const ws = createMockWs();
      const payload = createAuctionPayload();

      await handleSecondaryAuctionStart(ws, payload);

      const msg = parseSent(ws, 0) as {
        type: string;
        payload: { auctionId?: string; error?: string };
      };
      expect(msg.type).toBe('secondary.auction.ack');
      expect(msg.payload.auctionId).toBeDefined();
      expect(msg.payload.error).toBeUndefined();

      // The seller should be auto-subscribed. If a bid arrives, the seller's
      // ws should receive the broadcast.
      const auctionId = msg.payload.auctionId!;
      const buyerWs = createMockWs();
      const bidPayload = createBidPayload(auctionId);
      await handleSecondaryBidSubmit(buyerWs, bidPayload);

      // Seller ws should have received the bids broadcast (second message)
      const sellerMessages = allSent(ws);
      const bidsBroadcast = sellerMessages.find(
        (m): m is WsMessage =>
          (m as WsMessage).type === 'secondary.auction.bids'
      );
      expect(bidsBroadcast).toBeDefined();
      expect(bidsBroadcast!.payload.auctionId).toBe(auctionId);
      expect(bidsBroadcast!.payload.bids).toHaveLength(1);
    });

    it('invalid signature sends error ack', async () => {
      vi.mocked(verifySellerSignature).mockResolvedValue(false);
      const ws = createMockWs();
      const payload = createAuctionPayload();

      await handleSecondaryAuctionStart(ws, payload);

      const msg = parseSent(ws) as { type: string; payload: { error: string } };
      expect(msg.type).toBe('secondary.auction.ack');
      expect(msg.payload.error).toBe('invalid_seller_signature');
    });

    it('duplicate nonce sends duplicate_nonce error', async () => {
      const ws = createMockWs();
      const payload = createAuctionPayload({ sellerNonce: 42 });

      await handleSecondaryAuctionStart(ws, payload);
      expect(parseSent(ws, 0)).toMatchObject({
        type: 'secondary.auction.ack',
        payload: { auctionId: expect.any(String) },
      });

      // Second call with same nonce
      const ws2 = createMockWs();
      await handleSecondaryAuctionStart(ws2, payload);

      const msg = parseSent(ws2) as {
        type: string;
        payload: { error: string };
      };
      expect(msg.type).toBe('secondary.auction.ack');
      expect(msg.payload.error).toBe('duplicate_nonce');
    });

    it('broadcasts to global subscribers', async () => {
      const globalWs = createMockWs();
      handleSecondaryFeedSubscribe(globalWs);
      // Clear the subscription ack
      (globalWs.send as ReturnType<typeof vi.fn>).mockClear();

      const sellerWs = createMockWs();
      const payload = createAuctionPayload();

      await handleSecondaryAuctionStart(sellerWs, payload);

      // Global subscriber should receive secondary.auction.started
      const globalMessages = allSent(globalWs);
      expect(globalMessages).toHaveLength(1);
      const broadcast = globalMessages[0] as WsMessage;
      expect(broadcast.type).toBe('secondary.auction.started');
      expect(broadcast.payload.token).toBe(payload.token);
      expect(broadcast.payload.seller).toBe(payload.seller);
      expect(broadcast.payload.minPrice).toBe(payload.minPrice);
      expect(broadcast.payload.chainId).toBe(payload.chainId);
    });
  });

  // ========================================================================
  // handleSecondaryBidSubmit
  // ========================================================================

  describe('handleSecondaryBidSubmit', () => {
    async function setupAuction(
      overrides: Partial<SecondaryAuctionRequestPayload> = {}
    ): Promise<string> {
      const ws = createMockWs();
      const payload = createAuctionPayload(overrides);
      await handleSecondaryAuctionStart(ws, payload);
      const msg = parseSent(ws) as { payload: { auctionId: string } };
      return msg.payload.auctionId;
    }

    it('valid bid sends bid ack and broadcasts bids to subscribers', async () => {
      const auctionId = await setupAuction();

      // Subscribe a watcher
      const watcherWs = createMockWs();
      handleSecondarySubscribe(watcherWs, { auctionId });
      (watcherWs.send as ReturnType<typeof vi.fn>).mockClear();

      const buyerWs = createMockWs();
      const bidPayload = createBidPayload(auctionId);
      await handleSecondaryBidSubmit(buyerWs, bidPayload);

      // Buyer should get bid ack
      const ack = parseSent(buyerWs) as {
        type: string;
        payload: { bidId?: string; error?: string };
      };
      expect(ack.type).toBe('secondary.bid.ack');
      expect(ack.payload.bidId).toBeDefined();
      expect(ack.payload.error).toBeUndefined();

      // Watcher should receive bids broadcast
      const watcherMessages = allSent(watcherWs);
      const bidsBroadcast = watcherMessages.find(
        (m): m is WsMessage =>
          (m as WsMessage).type === 'secondary.auction.bids'
      );
      expect(bidsBroadcast).toBeDefined();
      expect(bidsBroadcast!.payload.bids).toHaveLength(1);
      expect(
        (bidsBroadcast!.payload.bids as Record<string, unknown>[])[0].buyer
      ).toBe(bidPayload.buyer);
    });

    it('auction not found sends error', async () => {
      const ws = createMockWs();
      const bidPayload = createBidPayload('non-existent-auction-id');

      await handleSecondaryBidSubmit(ws, bidPayload);

      const msg = parseSent(ws) as { type: string; payload: { error: string } };
      expect(msg.type).toBe('secondary.bid.ack');
      expect(msg.payload.error).toBe('auction_not_found_or_expired');
    });

    it('invalid buyer signature sends error', async () => {
      vi.mocked(verifyBuyerSignature).mockResolvedValue(false);
      const auctionId = await setupAuction();

      const ws = createMockWs();
      const bidPayload = createBidPayload(auctionId);
      await handleSecondaryBidSubmit(ws, bidPayload);

      const msg = parseSent(ws) as { type: string; payload: { error: string } };
      expect(msg.type).toBe('secondary.bid.ack');
      expect(msg.payload.error).toBe('invalid_buyer_signature');
    });

    it('self-bid (buyer === seller) sends error', async () => {
      const seller = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const auctionId = await setupAuction({ seller });

      const ws = createMockWs();
      const bidPayload = createBidPayload(auctionId, { buyer: seller });
      await handleSecondaryBidSubmit(ws, bidPayload);

      const msg = parseSent(ws) as { type: string; payload: { error: string } };
      expect(msg.type).toBe('secondary.bid.ack');
      expect(msg.payload.error).toBe('self_bid_not_allowed');
    });

    it('duplicate buyer nonce on same auction is rejected', async () => {
      const auctionId = await setupAuction();

      const ws1 = createMockWs();
      const bidPayload = createBidPayload(auctionId, { buyerNonce: 42 });
      await handleSecondaryBidSubmit(ws1, bidPayload);
      expect(parseSent(ws1)).toMatchObject({
        type: 'secondary.bid.ack',
        payload: { bidId: expect.any(String) },
      });

      // Same buyer + same nonce on same auction → rejected
      const ws2 = createMockWs();
      await handleSecondaryBidSubmit(ws2, bidPayload);
      const msg = parseSent(ws2) as {
        type: string;
        payload: { error: string };
      };
      expect(msg.type).toBe('secondary.bid.ack');
      expect(msg.payload.error).toBe('duplicate_buyer_nonce');
    });

    it('price below minimum sends error', async () => {
      const auctionId = await setupAuction({
        minPrice: '1000000000000000000', // 1 ETH minimum
      });

      const ws = createMockWs();
      const bidPayload = createBidPayload(auctionId, {
        price: '500000000000000000', // 0.5 ETH — below minimum
      });
      await handleSecondaryBidSubmit(ws, bidPayload);

      const msg = parseSent(ws) as { type: string; payload: { error: string } };
      expect(msg.type).toBe('secondary.bid.ack');
      expect(msg.payload.error).toBe('price_below_minimum');
    });
  });

  // ========================================================================
  // handleSecondarySubscribe
  // ========================================================================

  describe('handleSecondarySubscribe', () => {
    it('subscribes and sends current bids', async () => {
      // Create auction and add a bid
      const sellerWs = createMockWs();
      const auctionPayload = createAuctionPayload();
      await handleSecondaryAuctionStart(sellerWs, auctionPayload);
      const auctionId = (parseSent(sellerWs) as WsMessage).payload.auctionId;

      const buyerWs = createMockWs();
      await handleSecondaryBidSubmit(
        buyerWs,
        createBidPayload(auctionId as string)
      );

      // Now subscribe a new client
      const subWs = createMockWs();
      handleSecondarySubscribe(subWs, { auctionId: auctionId as string });

      const messages = allSent(subWs);
      // Should receive current bids + subscription ack
      const bidsMsg = messages.find(
        (m): m is WsMessage =>
          (m as WsMessage).type === 'secondary.auction.bids'
      );
      expect(bidsMsg).toBeDefined();
      expect(bidsMsg!.payload.bids).toHaveLength(1);

      const ackMsg = messages.find(
        (m): m is WsMessage =>
          (m as WsMessage).type === 'secondary.auction.ack' &&
          Boolean((m as WsMessage).payload.subscribed)
      );
      expect(ackMsg).toBeDefined();
      expect(ackMsg!.payload.auctionId).toBe(auctionId);
      expect(ackMsg!.payload.subscribed).toBe(true);
    });

    it('missing auctionId sends error', () => {
      const ws = createMockWs();
      handleSecondarySubscribe(ws, { auctionId: '' });

      const msg = parseSent(ws) as { type: string; payload: { error: string } };
      expect(msg.type).toBe('secondary.auction.ack');
      expect(msg.payload.error).toBe('missing_auction_id');
    });
  });

  // ========================================================================
  // handleSecondaryUnsubscribe
  // ========================================================================

  describe('handleSecondaryUnsubscribe', () => {
    it('sends unsubscribed ack', () => {
      const ws = createMockWs();
      const auctionId = 'some-auction-id';

      handleSecondaryUnsubscribe(ws, { auctionId });

      const msg = parseSent(ws) as {
        type: string;
        payload: { auctionId: string; unsubscribed: boolean };
      };
      expect(msg.type).toBe('secondary.auction.ack');
      expect(msg.payload.auctionId).toBe(auctionId);
      expect(msg.payload.unsubscribed).toBe(true);
    });
  });

  // ========================================================================
  // handleSecondaryFeedSubscribe / Unsubscribe
  // ========================================================================

  describe('handleSecondaryFeedSubscribe', () => {
    it('sends subscribed ack', () => {
      const ws = createMockWs();
      handleSecondaryFeedSubscribe(ws);

      const msg = parseSent(ws) as {
        type: string;
        payload: { subscribed: boolean };
      };
      expect(msg.type).toBe('secondary.auction.ack');
      expect(msg.payload.subscribed).toBe(true);
    });
  });

  describe('handleSecondaryFeedUnsubscribe', () => {
    it('sends unsubscribed ack', () => {
      const ws = createMockWs();
      handleSecondaryFeedUnsubscribe(ws);

      const msg = parseSent(ws) as {
        type: string;
        payload: { unsubscribed: boolean };
      };
      expect(msg.type).toBe('secondary.auction.ack');
      expect(msg.payload.unsubscribed).toBe(true);
    });
  });

  // ========================================================================
  // handleSecondaryListingsRequest
  // ========================================================================

  describe('handleSecondaryListingsRequest', () => {
    it('sends listings snapshot', async () => {
      // Create two auctions
      const ws1 = createMockWs();
      await handleSecondaryAuctionStart(
        ws1,
        createAuctionPayload({ sellerNonce: 100 })
      );
      const ws2 = createMockWs();
      await handleSecondaryAuctionStart(
        ws2,
        createAuctionPayload({ sellerNonce: 101 })
      );

      const reqWs = createMockWs();
      handleSecondaryListingsRequest(reqWs);

      const msg = parseSent(reqWs) as {
        type: string;
        payload: { listings: unknown[] };
      };
      expect(msg.type).toBe('secondary.listings.snapshot');
      expect(msg.payload.listings).toHaveLength(2);
      expect(msg.payload.listings[0]).toHaveProperty('auctionId');
      expect(msg.payload.listings[0]).toHaveProperty('token');
      expect(msg.payload.listings[0]).toHaveProperty('bidCount');
    });
  });

  // ========================================================================
  // unsubscribeFromAllSecondary
  // ========================================================================

  describe('unsubscribeFromAllSecondary', () => {
    it('cleans up all subscriptions', async () => {
      const ws = createMockWs();

      // Subscribe to an auction
      const sellerWs = createMockWs();
      await handleSecondaryAuctionStart(
        sellerWs,
        createAuctionPayload({ sellerNonce: 200 })
      );
      const auctionId = (parseSent(sellerWs) as WsMessage).payload
        .auctionId as string;
      handleSecondarySubscribe(ws, { auctionId });

      // Subscribe to global feed
      handleSecondaryFeedSubscribe(ws);
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      // Unsubscribe from all
      unsubscribeFromAllSecondary(ws);

      // Now if a new auction starts, ws should NOT receive global broadcast
      const sellerWs2 = createMockWs();
      await handleSecondaryAuctionStart(
        sellerWs2,
        createAuctionPayload({ sellerNonce: 201 })
      );

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // clearSecondaryHandlerState
  // ========================================================================

  describe('clearSecondaryHandlerState', () => {
    it('clears all state', async () => {
      const ws = createMockWs();
      handleSecondaryFeedSubscribe(ws);
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      clearSecondaryHandlerState();

      // After clearing, global subscriber should not receive broadcasts
      const sellerWs = createMockWs();
      await handleSecondaryAuctionStart(
        sellerWs,
        createAuctionPayload({ sellerNonce: 300 })
      );

      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
