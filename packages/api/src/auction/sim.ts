import type { BidPayload, AuctionRequestPayload } from './types';
import { validateAuctionForMint, createValidationError } from './helpers';

export interface SimResult {
  ok: boolean;
  reason?: string;
}

export function basicValidateBid(
  auction: AuctionRequestPayload,
  bid: BidPayload
): SimResult {
  if (!auction || !bid) return { ok: false, reason: 'invalid_payload' };

  // Validate Auction structure for mint flow
  const auctionValidation = validateAuctionForMint(auction);
  if (!auctionValidation.valid) {
    return {
      ok: false,
      reason: createValidationError(
        auctionValidation.error || 'invalid_auction'
      ),
    };
  }

  // Validate taker fields in payload
  if (!bid.taker || typeof bid.taker !== 'string') {
    return { ok: false, reason: 'invalid_taker' };
  }
  if (!bid.takerWager) {
    return { ok: false, reason: 'invalid_taker_wager' };
  }

  try {
    const takerWagerBigInt = BigInt(bid.takerWager);
    const wager = BigInt(auction.wager);

    // Basic validation: taker wager should be positive and not exceed maker wager
    if (takerWagerBigInt <= 0n) {
      return { ok: false, reason: 'invalid_taker_wager' };
    }
    if (takerWagerBigInt > wager) {
      return { ok: false, reason: 'taker_wager_too_high' };
    }
  } catch {
    return { ok: false, reason: 'invalid_wager_values' };
  }

  // Basic taker bid signature validation (format check only)
  if (!bid.takerSignature || typeof bid.takerSignature !== 'string') {
    return { ok: false, reason: 'invalid_taker_bid_signature_format' };
  }

  // Check if taker bid signature looks like a valid hex string
  if (!bid.takerSignature.startsWith('0x') || bid.takerSignature.length < 10) {
    return { ok: false, reason: 'invalid_taker_bid_signature_format' };
  }

  // Note: Collateral transfer now relies on standard ERC20 approvals, not permits.
  // Bots should ensure the taker has approved the Parlay contract prior to bid submission.
  // TODO: verify resolver address and market validation

  return { ok: true };
}
