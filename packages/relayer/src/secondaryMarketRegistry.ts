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

const DEFAULT_TTL_MS = 5 * 60_000; // 5 minutes
const MAX_TTL_MS = 30 * 60_000; // 30 minutes

/**
 * Create a new secondary market listing (auction)
 */
export function addSecondaryListing(
  auction: SecondaryAuctionRequestPayload
): string | null {
  const sellerKey = auction.seller.toLowerCase();

  // Check nonce replay
  const usedNonces = usedSellerNonces.get(sellerKey);
  if (usedNonces?.has(auction.sellerNonce)) {
    return null; // nonce already used
  }

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

  // Record nonce
  if (!usedSellerNonces.has(sellerKey)) {
    usedSellerNonces.set(sellerKey, new Set());
  }
  usedSellerNonces.get(sellerKey)!.add(auction.sellerNonce);

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
 * Add a validated bid to a listing
 */
export function addSecondaryBid(
  auctionId: string,
  bid: SecondaryValidatedBid
): boolean {
  const rec = getSecondaryListing(auctionId);
  if (!rec) return false;
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
 * Clear all listings (for testing)
 */
export function clearSecondaryListings(): void {
  listings.clear();
  usedSellerNonces.clear();
}

// Periodic cleanup of expired listings
setInterval(() => {
  const now = Date.now();
  for (const [id, rec] of listings.entries()) {
    if (now > rec.deadlineMs) {
      listings.delete(id);
    }
  }
}, 30_000).unref?.();
