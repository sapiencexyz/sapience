import { BidPayload, ValidatedBid, AuctionRequestPayload } from './types';
import { verifyTakerBid } from './helpers';

interface AuctionRecord {
  auction: AuctionRequestPayload;
  bids: ValidatedBid[];
  deadlineMs: number; // absolute epoch ms after which auction expires
}

const auctions = new Map<string, AuctionRecord>();

// Ranking algorithm removed - UI will select best bid based on highest taker collateral

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
  const verification = verifyTakerBid({
    auctionId,
    taker: bid.taker,
    takerWager: bid.takerWager,
    takerDeadline: bid.takerDeadline,
    takerSignature: bid.takerSignature,
  });
  if (!verification.ok) return undefined;

  const validated: ValidatedBid = { ...bid };
  rec.bids.push(validated);
  // Keep all bids - UI will select the best one
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
