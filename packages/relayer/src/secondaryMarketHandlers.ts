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
import { secondaryMarketEscrow } from '@sapience/sdk/contracts/addresses';
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
// Helpers
// ============================================================================

function getVerifyingContract(chainId: number): Address | undefined {
  const entry = secondaryMarketEscrow[chainId];
  return entry?.address as Address | undefined;
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
 */
export async function handleSecondaryAuctionStart(
  client: ClientConnection,
  payload: SecondaryAuctionRequestPayload,
  subs: SubscriptionManager,
  _ctx: SecondaryHandlerContext
): Promise<void> {
  // Tier 1 validation — field presence, deadline, signature
  const verifyingContract = getVerifyingContract(payload.chainId);
  if (!verifyingContract) {
    errorsTotal.inc({
      type: 'validation',
      message_type: 'secondary.auction.start',
    });
    client.send({
      type: 'secondary.auction.ack',
      payload: { error: 'unsupported_chain' },
    });
    return;
  }

  const validation = await validateSecondaryListing(payload, {
    verifyingContract,
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
    return;
  }

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
    return;
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
}

/**
 * Handle secondary.bid.submit — buyer makes an offer
 */
export async function handleSecondaryBidSubmit(
  client: ClientConnection,
  payload: SecondaryBidPayload,
  subs: SubscriptionManager
): Promise<void> {
  const listing = getSecondaryListing(payload.auctionId);
  if (!listing) {
    secondaryBidsSubmitted.inc({ status: 'rejected' });
    client.send({
      type: 'secondary.bid.ack',
      payload: { error: 'auction_not_found_or_expired' },
    });
    return;
  }

  // Tier 1 validation — field presence, deadline, price, signature
  const verifyingContract = getVerifyingContract(listing.auction.chainId);
  if (!verifyingContract) {
    secondaryBidsSubmitted.inc({ status: 'rejected' });
    client.send({
      type: 'secondary.bid.ack',
      payload: { error: 'unsupported_chain' },
    });
    return;
  }

  const validation = await validateSecondaryBid(payload, listing.auction, {
    verifyingContract,
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
    return;
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
    return;
  }

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
  const listings = getAllSecondaryListings();

  const details = listings.map((rec) => ({
    auctionId: rec.auctionId,
    token: rec.auction.token,
    collateral: rec.auction.collateral,
    tokenAmount: rec.auction.tokenAmount,
    seller: rec.auction.seller,
    sellerDeadline: rec.auction.sellerDeadline,
    chainId: rec.auction.chainId,
    createdAt: rec.createdAt,
    bidCount: rec.bids.length,
  }));

  client.send({
    type: 'secondary.listings.snapshot',
    payload: { listings: details },
  } as SecondaryServerToClientMessage);
}
