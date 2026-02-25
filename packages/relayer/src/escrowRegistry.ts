/**
 * Escrow Auction Registry
 * Stores and manages escrow auctions and bids
 */

import type {
  AuctionRequestPayload,
  ValidatedBid,
} from '@sapience/sdk/types';
import type { EscrowAuctionRecord, BidPayload } from './escrowTypes';
import { validateEscrowBid } from './escrowHelpers';
import { computeEscrowPickConfigId } from './escrowHelpers';

const escrowAuctions = new Map<string, EscrowAuctionRecord>();

/**
 * Create or update an escrow auction
 */
export function upsertEscrowAuction(auction: AuctionRequestPayload): string {
  const auctionId = crypto.randomUUID();
  const ttl = 60_000; // default 60s
  const deadlineMs = Date.now() + Math.max(5_000, Math.min(ttl, 5 * 60_000));

  // Compute pickConfigId from picks
  const pickConfigId = computeEscrowPickConfigId(auction.picks);

  escrowAuctions.set(auctionId, {
    auction,
    bids: [],
    deadlineMs,
    pickConfigId,
  });

  return auctionId;
}

/**
 * Get an escrow auction by ID
 */
export function getEscrowAuction(auctionId: string): EscrowAuctionRecord | undefined {
  const rec = escrowAuctions.get(auctionId);
  if (!rec) return undefined;
  if (Date.now() > rec.deadlineMs) {
    escrowAuctions.delete(auctionId);
    return undefined;
  }
  return rec;
}

/**
 * Add a bid to an escrow auction
 */
export function addEscrowBid(
  auctionId: string,
  bid: BidPayload
): ValidatedBid | undefined {
  const rec = getEscrowAuction(auctionId);
  if (!rec) return undefined;

  // Validate bid structure
  const validation = validateEscrowBid(bid, rec.auction);
  if (!validation.valid) {
    console.warn(`[EscrowRegistry] Bid validation failed: ${validation.error}`);
    return undefined;
  }

  const validated: ValidatedBid = {
    auctionId,
    counterparty: bid.counterparty,
    counterpartyCollateral: bid.counterpartyCollateral,
    counterpartyNonce: bid.counterpartyNonce,
    counterpartyDeadline: bid.counterpartyDeadline,
    counterpartySignature: bid.counterpartySignature,
    counterpartySessionKeyData: bid.counterpartySessionKeyData,
    receivedAt: new Date().toISOString(),
  };

  rec.bids.push(validated);
  rec.deadlineMs = Math.max(rec.deadlineMs, bid.counterpartyDeadline * 1000);
  escrowAuctions.set(auctionId, rec);

  return validated;
}

/**
 * Get all bids for an escrow auction
 */
export function getEscrowBids(auctionId: string): ValidatedBid[] {
  const rec = getEscrowAuction(auctionId);
  return rec?.bids ?? [];
}

/**
 * Get auction details for broadcast
 */
export function getEscrowAuctionDetails(
  auctionId: string
): import('@sapience/sdk/types').AuctionDetails | undefined {
  const rec = getEscrowAuction(auctionId);
  if (!rec) return undefined;

  return {
    auctionId,
    picks: rec.auction.picks,
    predictorCollateral: rec.auction.predictorCollateral,
    ...(rec.auction.counterpartyCollateral && { counterpartyCollateral: rec.auction.counterpartyCollateral }),
    predictor: rec.auction.predictor,
    predictorNonce: rec.auction.predictorNonce,
    predictorDeadline: rec.auction.predictorDeadline,
    chainId: rec.auction.chainId,
    createdAt: new Date(rec.deadlineMs - 60_000).toISOString(), // Approximate creation time
  };
}

// Periodic cleanup of expired auctions
setInterval(() => {
  const now = Date.now();
  for (const [id, rec] of escrowAuctions.entries()) {
    if (now > rec.deadlineMs) {
      escrowAuctions.delete(id);
    }
  }
}, 30_000).unref?.();
