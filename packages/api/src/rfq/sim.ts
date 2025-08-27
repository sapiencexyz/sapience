import type { BidPayload, RfqRequestPayload } from './types';

export interface SimResult {
  ok: boolean;
  reason?: string;
}

export function basicValidateBid(rfq: RfqRequestPayload, bid: BidPayload): SimResult {
  if (!rfq || !bid) return { ok: false, reason: 'invalid_payload' };
  if (rfq.chainId !== bid.chainId) return { ok: false, reason: 'chain_mismatch' };
  try {
    const minPayout = BigInt(rfq.minPayout);
    const payout = BigInt(bid.quote.payout);
    if (payout < minPayout) return { ok: false, reason: 'payout_below_min' };
  } catch {
    return { ok: false, reason: 'invalid_payout_values' };
  }

  if (bid.quote.validUntil <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'quote_expired' };
  }
  if (rfq.orderExpirationTime <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'order_expired' };
  }

  // Ensure fill structure is present
  if (!('rawSignedTx' in (bid.fill as any)) && !('callData' in (bid.fill as any))) {
    return { ok: false, reason: 'missing_fill' };
  }

  // TODO: decode tx target and calldata to verify it calls fillParlayOrder(requestId, refCode)
  // TODO: recover signer from rawSignedTx and compare to taker

  return { ok: true };
}


