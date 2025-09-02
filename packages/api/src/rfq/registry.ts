import { BidPayload, ValidatedBid, RfqRequestPayload } from './types';

interface RfqRecord {
  rfq: RfqRequestPayload;
  bids: ValidatedBid[];
  deadlineMs: number; // absolute epoch ms after which RFQ expires
}

const rfqs = new Map<string, RfqRecord>();

// Ranking algorithm removed - UI will select best bid based on highest taker collateral

export function upsertRfq(rfq: RfqRequestPayload) {
  const ttl = 60_000; // default 60s
  const deadlineMs = Date.now() + Math.max(5_000, Math.min(ttl, 5 * 60_000));
  rfqs.set(rfq.rfqId, { rfq, bids: [], deadlineMs });
}

export function getRfq(rfqId: string): RfqRecord | undefined {
  const rec = rfqs.get(rfqId);
  if (!rec) return undefined;
  if (Date.now() > rec.deadlineMs) {
    rfqs.delete(rfqId);
    return undefined;
  }
  return rec;
}

export function addBid(
  rfqId: string,
  bid: BidPayload
): ValidatedBid | undefined {
  const rec = getRfq(rfqId);
  if (!rec) return undefined;
  const bidId = `${rfqId}:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
  const validated: ValidatedBid = {
    ...bid,
    bidId,
  };
  rec.bids.push(validated);
  // Keep all bids - UI will select the best one
  rfqs.set(rfqId, rec);
  return validated;
}

export function getBids(rfqId: string): ValidatedBid[] {
  const rec = getRfq(rfqId);
  return rec?.bids ?? [];
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [id, rec] of rfqs.entries()) {
    if (now > rec.deadlineMs) {
      rfqs.delete(id);
    }
  }
}, 30_000).unref?.();
