/**
 * Secondary Market WebSocket Handlers
 * Processes secondary market auction messages
 */

import type { WebSocket } from 'ws';
import type {
  SecondaryAuctionRequestPayload,
  SecondaryBidPayload,
  SecondaryServerToClientMessage,
  SecondaryAuctionDetails,
  SecondaryValidatedBid,
} from '@sapience/sdk/types/secondary';
import {
  addSecondaryListing,
  getSecondaryListing,
  removeSecondaryListing,
  addSecondaryBid,
  getSecondaryBids,
} from './secondaryMarketRegistry';
import {
  verifySellerSignature,
  verifyBuyerSignature,
} from './secondaryMarketSigVerify';

// ============================================================================
// Subscription Management
// ============================================================================

const secondarySubscriptions = new Map<string, Set<WebSocket>>();
/** Global feed subscribers — receive all secondary market events */
const globalSubscribers = new Set<WebSocket>();

export function subscribeToSecondary(auctionId: string, ws: WebSocket): void {
  if (!secondarySubscriptions.has(auctionId)) {
    secondarySubscriptions.set(auctionId, new Set());
  }
  secondarySubscriptions.get(auctionId)!.add(ws);
}

export function unsubscribeFromSecondary(
  auctionId: string,
  ws: WebSocket
): void {
  const subs = secondarySubscriptions.get(auctionId);
  if (subs) {
    subs.delete(ws);
    if (subs.size === 0) secondarySubscriptions.delete(auctionId);
  }
}

export function unsubscribeFromAllSecondary(ws: WebSocket): void {
  for (const [id, subs] of secondarySubscriptions.entries()) {
    if (subs.has(ws)) {
      subs.delete(ws);
      if (subs.size === 0) secondarySubscriptions.delete(id);
    }
  }
  globalSubscribers.delete(ws);
}

function broadcastToSecondarySubscribers(
  auctionId: string,
  message: SecondaryServerToClientMessage
): number {
  const subs = secondarySubscriptions.get(auctionId);
  if (!subs || subs.size === 0) return 0;
  const str = JSON.stringify(message);
  let count = 0;
  for (const ws of subs) {
    if (ws.readyState === 1 /* WebSocket.OPEN */) {
      try {
        ws.send(str);
        count++;
      } catch {
        subs.delete(ws);
      }
    } else {
      subs.delete(ws);
    }
  }
  return count;
}

function broadcastToGlobalSubscribers(
  message: SecondaryServerToClientMessage
): void {
  if (globalSubscribers.size === 0) return;
  const str = JSON.stringify(message);
  for (const ws of globalSubscribers) {
    if (ws.readyState === 1) {
      try {
        ws.send(str);
      } catch {
        globalSubscribers.delete(ws);
      }
    } else {
      globalSubscribers.delete(ws);
    }
  }
}

function sendSecondary(
  ws: WebSocket,
  message: SecondaryServerToClientMessage
): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    console.error('[Secondary] Failed to send message:', err);
  }
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Handle secondary.auction.start — seller posts a listing
 */
export async function handleSecondaryAuctionStart(
  ws: WebSocket,
  payload: SecondaryAuctionRequestPayload
): Promise<void> {
  // Verify seller signature
  const validSig = await verifySellerSignature(payload);
  if (!validSig) {
    sendSecondary(ws, {
      type: 'secondary.auction.ack',
      payload: { error: 'invalid_seller_signature' },
    });
    return;
  }

  // Add to registry
  const auctionId = addSecondaryListing(payload);
  if (!auctionId) {
    sendSecondary(ws, {
      type: 'secondary.auction.ack',
      payload: { error: 'duplicate_nonce' },
    });
    return;
  }

  // Auto-subscribe the seller
  subscribeToSecondary(auctionId, ws);

  // Ack to sender
  sendSecondary(ws, {
    type: 'secondary.auction.ack',
    payload: { auctionId },
  });

  // Build auction details for broadcast
  const details: SecondaryAuctionDetails = {
    auctionId,
    token: payload.token,
    collateral: payload.collateral,
    tokenAmount: payload.tokenAmount,
    minPrice: payload.minPrice,
    seller: payload.seller,
    sellerDeadline: payload.sellerDeadline,
    chainId: payload.chainId,
    createdAt: new Date().toISOString(),
  };

  // Broadcast to global subscribers
  broadcastToGlobalSubscribers({
    type: 'secondary.auction.started',
    payload: details,
  });

  console.log(
    `[Secondary] Auction started: ${auctionId} seller=${payload.seller.slice(0, 10)} token=${payload.token.slice(0, 10)}`
  );
}

/**
 * Handle secondary.bid.submit — buyer makes an offer
 */
export async function handleSecondaryBidSubmit(
  ws: WebSocket,
  payload: SecondaryBidPayload
): Promise<void> {
  const listing = getSecondaryListing(payload.auctionId);
  if (!listing) {
    sendSecondary(ws, {
      type: 'secondary.bid.ack',
      payload: { error: 'auction_not_found_or_expired' },
    });
    return;
  }

  // Verify buyer signature
  const validSig = await verifyBuyerSignature(payload, listing.auction);
  if (!validSig) {
    sendSecondary(ws, {
      type: 'secondary.bid.ack',
      payload: { error: 'invalid_buyer_signature' },
    });
    return;
  }

  // Validate price meets minimum
  if (BigInt(payload.price) < BigInt(listing.auction.minPrice)) {
    sendSecondary(ws, {
      type: 'secondary.bid.ack',
      payload: { error: 'price_below_minimum' },
    });
    return;
  }

  const bidId = crypto.randomUUID();
  const validated: SecondaryValidatedBid = {
    auctionId: payload.auctionId,
    buyer: payload.buyer,
    price: payload.price,
    buyerNonce: payload.buyerNonce,
    buyerDeadline: payload.buyerDeadline,
    buyerSignature: payload.buyerSignature,
    buyerSessionKeyData: payload.buyerSessionKeyData,
    receivedAt: new Date().toISOString(),
  };

  addSecondaryBid(payload.auctionId, validated);

  // Ack to buyer
  sendSecondary(ws, {
    type: 'secondary.bid.ack',
    payload: { bidId },
  });

  // Broadcast updated bids to auction subscribers
  const bids = getSecondaryBids(payload.auctionId);
  broadcastToSecondarySubscribers(payload.auctionId, {
    type: 'secondary.auction.bids',
    payload: { auctionId: payload.auctionId, bids },
  });

  console.log(
    `[Secondary] Bid received: auction=${payload.auctionId.slice(0, 8)} buyer=${payload.buyer.slice(0, 10)} price=${payload.price}`
  );
}

/**
 * Handle secondary.auction.subscribe
 */
export function handleSecondarySubscribe(
  ws: WebSocket,
  payload: { auctionId: string }
): void {
  if (!payload.auctionId) {
    sendSecondary(ws, {
      type: 'secondary.auction.ack',
      payload: { error: 'missing_auction_id' },
    });
    return;
  }

  subscribeToSecondary(payload.auctionId, ws);

  // Send current bids
  const bids = getSecondaryBids(payload.auctionId);
  if (bids.length > 0) {
    sendSecondary(ws, {
      type: 'secondary.auction.bids',
      payload: { auctionId: payload.auctionId, bids },
    });
  }

  sendSecondary(ws, {
    type: 'secondary.auction.ack',
    payload: { auctionId: payload.auctionId, subscribed: true },
  });
}

/**
 * Handle secondary.auction.unsubscribe
 */
export function handleSecondaryUnsubscribe(
  ws: WebSocket,
  payload: { auctionId: string }
): void {
  if (payload.auctionId) {
    unsubscribeFromSecondary(payload.auctionId, ws);
    sendSecondary(ws, {
      type: 'secondary.auction.ack',
      payload: { auctionId: payload.auctionId, unsubscribed: true },
    });
  }
}

/**
 * Clear handler state (for testing)
 */
export function clearSecondaryHandlerState(): void {
  secondarySubscriptions.clear();
  globalSubscribers.clear();
}
