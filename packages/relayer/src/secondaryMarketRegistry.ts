/**
 * Secondary Market Registry
 * In-memory store for active secondary market listings and bids
 */

import type {
  SecondaryAuctionRequestPayload,
  SecondaryValidatedBid,
} from '@sapience/sdk/types/secondary';
import type { SecondaryListingRecord } from './secondaryMarketTypes';

const listings = new Map<string, SecondaryListingRecord>();

/** Track used seller nonces to prevent replays: seller address → set of nonces */
const usedSellerNonces = new Map<string, Set<number>>();

/** Track used buyer nonces to prevent replays: buyer address → set of nonces */
const usedBuyerNonces = new Map<string, Set<number>>();

const MAX_TTL_MS = 30 * 60_000; // 30 minutes
const MAX_BIDS_PER_AUCTION = 50;

/**
 * Create a new secondary market listing (auction).
 * Nonce check-and-record is atomic — the nonce is added to the used set
 * before any async work, preventing concurrent duplicates.
 */
export function addSecondaryListing(
  auction: SecondaryAuctionRequestPayload
): string | null {
  const sellerKey = auction.seller.toLowerCase();

  // Atomic nonce check-and-set: record immediately to prevent race conditions
  if (!usedSellerNonces.has(sellerKey)) {
    usedSellerNonces.set(sellerKey, new Set());
  }
  const nonceSet = usedSellerNonces.get(sellerKey)!;
  if (nonceSet.has(auction.sellerNonce)) {
    return null; // nonce already used
  }
  // Record nonce immediately (before any other work)
  nonceSet.add(auction.sellerNonce);

  const auctionId = crypto.randomUUID();
  const now = Date.now();

  // Deadline from seller or default TTL
  const sellerDeadlineMs = auction.sellerDeadline * 1000;
  const deadlineMs = Math.min(
    Math.max(sellerDeadlineMs, now + 5_000),
    now + MAX_TTL_MS
  );

  listings.set(auctionId, {
    auctionId,
    auction,
    bids: [],
    deadlineMs,
    createdAt: new Date(now).toISOString(),
  });

  return auctionId;
}

/**
 * Get a listing by ID (returns undefined if expired)
 */
export function getSecondaryListing(
  auctionId: string
): SecondaryListingRecord | undefined {
  const rec = listings.get(auctionId);
  if (!rec) return undefined;
  if (Date.now() > rec.deadlineMs) {
    listings.delete(auctionId);
    return undefined;
  }
  return rec;
}

/**
 * Remove a listing by ID. Returns true if removed.
 */
export function removeSecondaryListing(auctionId: string): boolean {
  return listings.delete(auctionId);
}

/**
 * Get all active (non-expired) listings
 */
export function getAllSecondaryListings(): SecondaryListingRecord[] {
  const now = Date.now();
  const result: SecondaryListingRecord[] = [];
  for (const [id, rec] of listings.entries()) {
    if (now > rec.deadlineMs) {
      listings.delete(id);
    } else {
      result.push(rec);
    }
  }
  return result;
}

/**
 * Add a validated bid to a listing.
 * Rejects duplicate buyer nonces and enforces a per-auction bid cap.
 * Nonce check-and-record is atomic.
 */
export function addSecondaryBid(
  auctionId: string,
  bid: SecondaryValidatedBid
): boolean {
  const rec = getSecondaryListing(auctionId);
  if (!rec) return false;

  // Enforce per-auction bid cap
  if (rec.bids.length >= MAX_BIDS_PER_AUCTION) {
    return false;
  }

  // Atomic buyer nonce check-and-set
  const buyerKey = bid.buyer.toLowerCase();
  if (!usedBuyerNonces.has(buyerKey)) {
    usedBuyerNonces.set(buyerKey, new Set());
  }
  const nonceSet = usedBuyerNonces.get(buyerKey)!;
  if (nonceSet.has(bid.buyerNonce)) {
    return false;
  }
  // Record nonce immediately
  nonceSet.add(bid.buyerNonce);

  rec.bids.push(bid);
  return true;
}

/**
 * Get bids for a listing
 */
export function getSecondaryBids(auctionId: string): SecondaryValidatedBid[] {
  return getSecondaryListing(auctionId)?.bids ?? [];
}

/**
 * Check if a seller nonce has been used
 */
export function isSellerNonceUsed(seller: string, nonce: number): boolean {
  return usedSellerNonces.get(seller.toLowerCase())?.has(nonce) ?? false;
}

/**
 * Check if a buyer nonce has been used
 */
export function isBuyerNonceUsed(buyer: string, nonce: number): boolean {
  return usedBuyerNonces.get(buyer.toLowerCase())?.has(nonce) ?? false;
}

/**
 * Clear all listings (for testing)
 */
export function clearSecondaryListings(): void {
  listings.clear();
  usedSellerNonces.clear();
  usedBuyerNonces.clear();
}

/**
 * Cleanup expired listings and prune stale nonce entries.
 * Exported for testing; also runs on a 30-second interval.
 */
export function runSecondaryCleanup(): void {
  const now = Date.now();

  // Remove expired listings
  for (const [id, rec] of listings.entries()) {
    if (now > rec.deadlineMs) {
      listings.delete(id);
    }
  }

  // Prune seller nonce entries for sellers with no remaining active listings
  const activeSellers = new Set<string>();
  for (const rec of listings.values()) {
    activeSellers.add(rec.auction.seller.toLowerCase());
  }
  for (const sellerKey of usedSellerNonces.keys()) {
    if (!activeSellers.has(sellerKey)) {
      usedSellerNonces.delete(sellerKey);
    }
  }

  // Prune buyer nonce entries for buyers with no bids in any active listing
  const activeBuyers = new Set<string>();
  for (const rec of listings.values()) {
    for (const bid of rec.bids) {
      activeBuyers.add(bid.buyer.toLowerCase());
    }
  }
  for (const buyerKey of usedBuyerNonces.keys()) {
    if (!activeBuyers.has(buyerKey)) {
      usedBuyerNonces.delete(buyerKey);
    }
  }
}

// Periodic cleanup
setInterval(runSecondaryCleanup, 30_000).unref?.();
