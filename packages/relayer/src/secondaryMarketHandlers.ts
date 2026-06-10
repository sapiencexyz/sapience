/**
 * Secondary Market WebSocket Handlers
 *
 * Pure business logic — receives ClientConnection + SubscriptionManager,
 * never raw WebSocket. Mirrors the escrow handler pattern.
 *
 * Uses SDK-level tier 1 validation (validateSecondaryListing / validateSecondaryBid)
 * following the same pattern as the escrow flow:
 * - 'invalid' → reject with error
 * - 'valid' → accept
 * - 'unverified' → pass through (relayer is not the authority; on-chain is)
 */

import type { ClientConnection, SubscriptionManager } from './transport/types';
import { config } from './config';
import type {
  SecondaryAuctionRequestPayload,
  SecondaryBidPayload,
  SecondaryServerToClientMessage,
  SecondaryAuctionDetails,
  SecondaryValidatedBid,
} from '@sapience/sdk/types/secondary';
import {
  validateSecondaryListing,
  validateSecondaryBid,
} from '@sapience/sdk/auction/secondaryValidation';
import type { Address } from 'viem';
import {
  addSecondaryListing,
  getSecondaryListing,
  getAllSecondaryListings,
  addSecondaryBid,
  getSecondaryBids,
} from './secondaryMarketRegistry';
import {
  secondaryListingsStarted,
  secondaryBidsSubmitted,
  errorsTotal,
  subscriptionsActive,
} from './metrics';

// ============================================================================
// Topic helpers
// ============================================================================

const SECONDARY_TOPIC_PREFIX = 'secondary:';
const GLOBAL_FEED_TOPIC = 'secondary:global';

function auctionTopic(auctionId: string): string {
  return `${SECONDARY_TOPIC_PREFIX}${auctionId}`;
}

// ============================================================================
// Handlers
// ============================================================================

export interface SecondaryHandlerContext {
  /** All connected clients — used for global auction.started broadcast. */
  allClients: () => Iterable<ClientConnection>;
}

/**
 * Handle secondary.auction.start — seller posts a listing
 *
 * @returns `true` if the request was rejected due to a validation failure
 *          (used by ws.ts to track per-connection validation failure penalties).
 */
export async function handleSecondaryAuctionStart(
  client: ClientConnection,
  payload: SecondaryAuctionRequestPayload,
  subs: SubscriptionManager,
  _ctx: SecondaryHandlerContext
): Promise<boolean> {
  // Tier 1 validation — field presence, deadline, signature
  if (!payload.escrowContract) {
    errorsTotal.inc({
      type: 'validation',
      message_type: 'secondary.auction.start',
    });
    client.send({
      type: 'secondary.auction.ack',
      payload: { error: 'missing_escrow_contract' },
    });
    return true;
  }

  const validation = await validateSecondaryListing(payload, {
    verifyingContract: payload.escrowContract as Address,
    chainId: payload.chainId,
    maxDeadlineSeconds: 7200,
  });

  // Reject only 'invalid' — pass through both 'valid' and 'unverified'
  // (matching escrow pattern: relayer is not the authority for session key sigs)
  // SDK validation already handles EIP-712 signature verification for EOA sigs
  // and returns 'unverified' for session key sigs.
  if (validation.status === 'invalid') {
    errorsTotal.inc({
      type: 'validation',
      message_type: 'secondary.auction.start',
    });
    client.send({
      type: 'secondary.auction.ack',
      payload: { error: `${validation.code}: ${validation.reason}` },
    });
    return true;
  }

  // ── Quote-only path ──
  // Price discovery request: register in registry (so bid routing works) but
  // mark as quoteOnly so it's excluded from the listings snapshot.
  // Broadcast to feed subscribers, but exclude from the listings snapshot.
  if (payload.quoteOnly) {
    const quoteId = addSecondaryListing(payload);
    if (!quoteId) {
      client.send({
        type: 'secondary.auction.ack',
        payload: { error: 'duplicate_nonce' },
      });
      return false;
    }

    // Auto-subscribe the requester so they receive bid responses
    const isNew = subs.subscribe(auctionTopic(quoteId), client);
    if (isNew) subscriptionsActive.inc({ subscription_type: 'secondary' });

    // Ack to sender
    client.send({
      type: 'secondary.auction.ack',
      payload: { auctionId: quoteId },
    });

    // Build quote details — includes quoteOnly flag so vault-bot can detect
    const quoteDetails: SecondaryAuctionDetails = {
      auctionId: quoteId,
      token: payload.token,
      collateral: payload.collateral,
      tokenAmount: payload.tokenAmount,
      seller: payload.seller,
      sellerDeadline: payload.sellerDeadline,
      chainId: payload.chainId,
      escrowContract: payload.escrowContract,
      createdAt: new Date().toISOString(),
      quoteOnly: true,
    };

    // Broadcast to feed subscribers (vault-bot observers see quoteOnly=true)
    subs.broadcast(GLOBAL_FEED_TOPIC, {
      type: 'secondary.auction.started',
      payload: quoteDetails,
    });

    console.log(
      `[Secondary] Quote request: ${quoteId} seller=${payload.seller.slice(0, 10)} token=${payload.token.slice(0, 10)}`
    );
    return false;
  }

  // ── Real listing path (existing logic) ──

  // Add to registry
  const auctionId = addSecondaryListing(payload);
  if (!auctionId) {
    errorsTotal.inc({
      type: 'validation',
      message_type: 'secondary.auction.start',
    });
    client.send({
      type: 'secondary.auction.ack',
      payload: { error: 'duplicate_nonce' },
    });
    return false; // duplicate nonce is not a validation failure
  }

  secondaryListingsStarted.inc();

  // Auto-subscribe the seller
  const isNew = subs.subscribe(auctionTopic(auctionId), client);
  if (isNew) subscriptionsActive.inc({ subscription_type: 'secondary' });

  // Ack to sender
  client.send({
    type: 'secondary.auction.ack',
    payload: { auctionId },
  });

  // Build auction details for broadcast
  const details: SecondaryAuctionDetails = {
    auctionId,
    token: payload.token,
    collateral: payload.collateral,
    tokenAmount: payload.tokenAmount,
    seller: payload.seller,
    sellerDeadline: payload.sellerDeadline,
    chainId: payload.chainId,
    escrowContract: payload.escrowContract,
    createdAt: new Date().toISOString(),
  };

  // Broadcast to global feed subscribers
  subs.broadcast(GLOBAL_FEED_TOPIC, {
    type: 'secondary.auction.started',
    payload: details,
  });

  console.log(
    `[Secondary] Auction started: ${auctionId} seller=${payload.seller.slice(0, 10)} token=${payload.token.slice(0, 10)}`
  );

  return false;
}

/**
 * Handle secondary.bid.submit — buyer makes an offer
 *
 * @returns `true` if the bid was rejected due to a validation failure.
 */
export async function handleSecondaryBidSubmit(
  client: ClientConnection,
  payload: SecondaryBidPayload,
  subs: SubscriptionManager
): Promise<boolean> {
  const listing = getSecondaryListing(payload.auctionId);
  if (!listing) {
    secondaryBidsSubmitted.inc({ status: 'rejected' });
    client.send({
      type: 'secondary.bid.ack',
      payload: { error: 'auction_not_found_or_expired' },
    });
    return true;
  }

  // Per-connection cap — one connection cannot monopolize a listing's bid
  // slots. Offline validation passes legitimate smart-account (session-key)
  // bids through as 'unverified' alongside forged ones, so without this cap a
  // single connection could fill the listing's bid cap and lock out real
  // buyers.
  const bidCountKey = `secondary:${payload.auctionId}`;
  const priorBidsFromConnection = client.bidCounts?.get(bidCountKey) ?? 0;
  if (priorBidsFromConnection >= config.MAX_BIDS_PER_CONNECTION_PER_AUCTION) {
    secondaryBidsSubmitted.inc({ status: 'rejected' });
    client.send({
      type: 'secondary.bid.ack',
      payload: { error: 'bid_rejected' },
    });
    return false; // capacity limit, not a validation failure
  }

  // Tier 1 validation — field presence, deadline, price, signature. Keep this
  // after the cheap connection cap so over-cap spam cannot force EIP-712 work.
  const validation = await validateSecondaryBid(payload, listing.auction, {
    verifyingContract: listing.auction.escrowContract as Address,
    chainId: listing.auction.chainId,
  });

  // Reject only 'invalid' — pass through both 'valid' and 'unverified'
  // SDK validation already handles EIP-712 signature verification for EOA sigs
  // and returns 'unverified' for session key sigs.
  if (validation.status === 'invalid') {
    secondaryBidsSubmitted.inc({ status: 'rejected' });
    errorsTotal.inc({
      type: 'validation',
      message_type: 'secondary.bid.submit',
    });
    client.send({
      type: 'secondary.bid.ack',
      payload: { error: `${validation.code}: ${validation.reason}` },
    });
    return true;
  }

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

  const added = addSecondaryBid(payload.auctionId, validated);
  if (!added) {
    secondaryBidsSubmitted.inc({ status: 'rejected' });
    client.send({
      type: 'secondary.bid.ack',
      payload: { error: 'bid_rejected' },
    });
    return false; // capacity limit, not a validation failure
  }

  // Count this accepted bid against the per-connection cap.
  if (!client.bidCounts) client.bidCounts = new Map();
  client.bidCounts.set(bidCountKey, priorBidsFromConnection + 1);

  secondaryBidsSubmitted.inc({ status: 'success' });

  // Ack to buyer
  const bidId = crypto.randomUUID();
  client.send({
    type: 'secondary.bid.ack',
    payload: { bidId },
  });

  // Broadcast updated bids to auction subscribers
  const bids = getSecondaryBids(payload.auctionId);
  subs.broadcast(auctionTopic(payload.auctionId), {
    type: 'secondary.auction.bids',
    payload: { auctionId: payload.auctionId, bids },
  });

  console.log(
    `[Secondary] Bid received: auction=${payload.auctionId.slice(0, 8)} buyer=${payload.buyer.slice(0, 10)} price=${payload.price}`
  );

  return false;
}

/**
 * Handle secondary.auction.subscribe
 */
export function handleSecondarySubscribe(
  client: ClientConnection,
  payload: { auctionId: string },
  subs: SubscriptionManager
): void {
  if (!payload.auctionId) {
    client.send({
      type: 'secondary.auction.ack',
      payload: { error: 'missing_auction_id' },
    });
    return;
  }

  const isNew = subs.subscribe(auctionTopic(payload.auctionId), client);
  if (isNew) subscriptionsActive.inc({ subscription_type: 'secondary' });

  // Send current bids
  const bids = getSecondaryBids(payload.auctionId);
  if (bids.length > 0) {
    client.send({
      type: 'secondary.auction.bids',
      payload: { auctionId: payload.auctionId, bids },
    });
  }

  client.send({
    type: 'secondary.auction.ack',
    payload: { auctionId: payload.auctionId, subscribed: true },
  });
}

/**
 * Handle secondary.auction.unsubscribe
 */
export function handleSecondaryUnsubscribe(
  client: ClientConnection,
  payload: { auctionId: string },
  subs: SubscriptionManager
): void {
  if (payload.auctionId) {
    const wasRemoved = subs.unsubscribe(
      auctionTopic(payload.auctionId),
      client
    );
    if (wasRemoved) subscriptionsActive.dec({ subscription_type: 'secondary' });
    client.send({
      type: 'secondary.auction.ack',
      payload: { auctionId: payload.auctionId, unsubscribed: true },
    });
  }
}

/**
 * Handle secondary.feed.subscribe — buyer/bot subscribes to all new listings
 */
export function handleSecondaryFeedSubscribe(
  client: ClientConnection,
  subs: SubscriptionManager
): void {
  const isNew = subs.subscribe(GLOBAL_FEED_TOPIC, client);
  if (isNew) subscriptionsActive.inc({ subscription_type: 'secondary' });

  client.send({
    type: 'secondary.auction.ack',
    payload: { subscribed: true },
  });

  console.log(
    `[Secondary] Global feed subscriber added (total: ${subs.subscriberCount(GLOBAL_FEED_TOPIC)})`
  );
}

/**
 * Handle secondary.feed.unsubscribe — stop receiving global feed
 */
export function handleSecondaryFeedUnsubscribe(
  client: ClientConnection,
  subs: SubscriptionManager
): void {
  const wasRemoved = subs.unsubscribe(GLOBAL_FEED_TOPIC, client);
  if (wasRemoved) subscriptionsActive.dec({ subscription_type: 'secondary' });

  client.send({
    type: 'secondary.auction.ack',
    payload: { unsubscribed: true },
  });
}

/**
 * Handle secondary.listings.request — return all active (non-expired) listings
 */
export function handleSecondaryListingsRequest(client: ClientConnection): void {
  // Filter out quoteOnly listings — they shouldn't appear in the public snapshot
  const listings = getAllSecondaryListings().filter(
    (rec) => !rec.auction.quoteOnly
  );

  const details = listings.map((rec) => ({
    auctionId: rec.auctionId,
    token: rec.auction.token,
    collateral: rec.auction.collateral,
    tokenAmount: rec.auction.tokenAmount,
    seller: rec.auction.seller,
    sellerDeadline: rec.auction.sellerDeadline,
    chainId: rec.auction.chainId,
    escrowContract: rec.auction.escrowContract,
    createdAt: rec.createdAt,
    bidCount: rec.bids.length,
  }));

  client.send({
    type: 'secondary.listings.snapshot',
    payload: { listings: details },
  } as SecondaryServerToClientMessage);
}
