import { zeroAddress } from 'viem';
import { BidPayload, ValidatedBid, AuctionRequestPayload } from './types';
import { verifyMakerBid } from './helpers';
import {
  verifyMakerBidSignature,
  type AuctionStartLike,
} from '@sapience/sdk';

interface AuctionRecord {
  auction: AuctionRequestPayload;
  bids: ValidatedBid[];
  deadlineMs: number; // absolute epoch ms after which auction expires
}

const auctions = new Map<string, AuctionRecord>();

// Ranking algorithm removed - UI will select best bid based on highest maker wager

export function upsertAuction(auction: AuctionRequestPayload): string {
  const auctionId = crypto.randomUUID();
  const ttl = 60_000; // default 60s
  const deadlineMs = Date.now() + Math.max(5_000, Math.min(ttl, 5 * 60_000));
  auctions.set(auctionId, { auction, bids: [], deadlineMs });
  return auctionId;
}

export function getAuction(auctionId: string): AuctionRecord | undefined {
  const rec = auctions.get(auctionId);
  if (!rec) return undefined;
  if (Date.now() > rec.deadlineMs) {
    auctions.delete(auctionId);
    return undefined;
  }
  return rec;
}

export function addBid(
  auctionId: string,
  bid: BidPayload
): ValidatedBid | undefined {
  const rec = getAuction(auctionId);
  if (!rec) return undefined;

  // Validate passed-in fields and signature
  const verification = verifyMakerBid({
    auctionId,
    maker: bid.maker,
    makerWager: bid.makerWager,
    makerDeadline: bid.makerDeadline,
    makerSignature: bid.makerSignature,
  });
  if (!verification.ok) return undefined;

  const validated: ValidatedBid = { ...bid };
  rec.bids.push(validated);
  rec.deadlineMs = Math.max(rec.deadlineMs, bid.makerDeadline * 1000);
  // Keep all bids - UI will select the best one
  auctions.set(auctionId, rec);
  return validated;
}

/**
 * Add a bid with cryptographic signature verification for anonymous (zero-address) auctions.
 * This prevents spoofing of maker addresses when displaying quotes to anonymous users.
 * For non-anonymous auctions, falls back to regular addBid (no signature verification).
 */
export async function addBidWithVerification(
  auctionId: string,
  bid: BidPayload
): Promise<ValidatedBid | undefined> {
  const rec = getAuction(auctionId);
  if (!rec) return undefined;

  const auction = rec.auction;
  const isAnonymousAuction = auction.taker.toLowerCase() === zeroAddress;

  // for non-anon use addBid 
  if (!isAnonymousAuction) {
    return addBid(auctionId, bid);
  }

  // For anonymous auctions, verify signature 
  const verification = verifyMakerBid({
    auctionId,
    maker: bid.maker,
    makerWager: bid.makerWager,
    makerDeadline: bid.makerDeadline,
    makerSignature: bid.makerSignature,
  });
  if (!verification.ok) return undefined;

  const auctionForSig: AuctionStartLike = {
    wager: auction.wager,
    predictedOutcomes: auction.predictedOutcomes as `0x${string}`[],
    resolver: auction.resolver as `0x${string}`,
    taker: auction.taker as `0x${string}`,
  };

  const sigVerification = await verifyMakerBidSignature({
    auction: auctionForSig,
    bid: {
      maker: bid.maker as `0x${string}`,
      makerWager: bid.makerWager,
      makerDeadline: bid.makerDeadline,
      makerSignature: bid.makerSignature as `0x${string}`,
      makerNonce: auction.takerNonce,
    },
    chainId: auction.chainId,
  });

  if (!sigVerification.valid) {
    console.warn(
      `[Registry] Bid signature verification failed for anonymous auction=${auctionId} maker=${bid.maker}: ${sigVerification.error}`
    );
    return undefined;
  }

  const validated: ValidatedBid = { ...bid };
  rec.bids.push(validated);
  rec.deadlineMs = Math.max(rec.deadlineMs, bid.makerDeadline * 1000);
  auctions.set(auctionId, rec);
  return validated;
}

export function getBids(auctionId: string): ValidatedBid[] {
  const rec = getAuction(auctionId);
  return rec?.bids ?? [];
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [id, rec] of auctions.entries()) {
    if (now > rec.deadlineMs) {
      auctions.delete(id);
    }
  }
}, 30_000).unref?.();

