/**
 * V2 Auction Registry
 * Stores and manages V2 auctions and bids
 */

import type {
  V2AuctionRequestPayload,
  V2ValidatedBid,
} from '@sapience/sdk/types/v2';
import type { V2AuctionRecord, V2BidPayload } from './v2Types';
import { validateV2Bid } from './v2Helpers';
import { computeV2PickConfigId } from './v2Helpers';

const v2Auctions = new Map<string, V2AuctionRecord>();

/**
 * Create or update a V2 auction
 */
export function upsertV2Auction(auction: V2AuctionRequestPayload): string {
  const auctionId = crypto.randomUUID();
  const ttl = 60_000; // default 60s
  const deadlineMs = Date.now() + Math.max(5_000, Math.min(ttl, 5 * 60_000));

  // Compute pickConfigId from picks
  const pickConfigId = computeV2PickConfigId(auction.picks);

  v2Auctions.set(auctionId, {
    auction,
    bids: [],
    deadlineMs,
    pickConfigId,
  });

  return auctionId;
}

/**
 * Get a V2 auction by ID
 */
export function getV2Auction(auctionId: string): V2AuctionRecord | undefined {
  const rec = v2Auctions.get(auctionId);
  if (!rec) return undefined;
  if (Date.now() > rec.deadlineMs) {
    v2Auctions.delete(auctionId);
    return undefined;
  }
  return rec;
}

/**
 * Add a bid to a V2 auction
 */
export function addV2Bid(
  auctionId: string,
  bid: V2BidPayload
): V2ValidatedBid | undefined {
  const rec = getV2Auction(auctionId);
  if (!rec) return undefined;

  // Validate bid structure
  const validation = validateV2Bid(bid, rec.auction);
  if (!validation.valid) {
    console.warn(`[V2Registry] Bid validation failed: ${validation.error}`);
    return undefined;
  }

  const validated: V2ValidatedBid = {
    auctionId,
    counterparty: bid.counterparty,
    counterpartyDeadline: bid.counterpartyDeadline,
    receivedAt: new Date().toISOString(),
  };

  rec.bids.push(validated);
  rec.deadlineMs = Math.max(rec.deadlineMs, bid.counterpartyDeadline * 1000);
  v2Auctions.set(auctionId, rec);

  return validated;
}

/**
 * Get all bids for a V2 auction
 */
export function getV2Bids(auctionId: string): V2ValidatedBid[] {
  const rec = getV2Auction(auctionId);
  return rec?.bids ?? [];
}

/**
 * Get auction details for broadcast
 */
export function getV2AuctionDetails(
  auctionId: string
): import('@sapience/sdk/types/v2').V2AuctionDetails | undefined {
  const rec = getV2Auction(auctionId);
  if (!rec) return undefined;

  return {
    auctionId,
    picks: rec.auction.picks,
    predictorWager: rec.auction.predictorWager,
    counterpartyWager: rec.auction.counterpartyWager,
    predictor: rec.auction.predictor,
    predictorDeadline: rec.auction.predictorDeadline,
    chainId: rec.auction.chainId,
    createdAt: new Date(rec.deadlineMs - 60_000).toISOString(), // Approximate creation time
  };
}

// Periodic cleanup of expired auctions
setInterval(() => {
  const now = Date.now();
  for (const [id, rec] of v2Auctions.entries()) {
    if (now > rec.deadlineMs) {
      v2Auctions.delete(id);
    }
  }
}, 30_000).unref?.();
