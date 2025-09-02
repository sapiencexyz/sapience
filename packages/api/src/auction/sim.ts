import type { BidPayload, AuctionRequestPayload } from './types';
import {
  validateAuctionForMint,
  createValidationError,
  extractTakerWagerFromSignature,
  extractTakerFromSignature,
} from './helpers';

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

  // Derive taker address from signature
  const taker = extractTakerFromSignature(bid.takerBidSignature);

  if (!taker) {
    return { ok: false, reason: 'invalid_taker_signature' };
  }

  // Derive taker wager from signature and validate
  const takerWager = extractTakerWagerFromSignature(bid.takerBidSignature);

  if (!takerWager) {
    return { ok: false, reason: 'invalid_taker_wager' };
  }

  try {
    const takerWagerBigInt = BigInt(takerWager);
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

  // Validate mint data structure
  if (!bid.takerPermitSignature || !bid.takerBidSignature) {
    return { ok: false, reason: 'incomplete_mint_data' };
  }

  // Basic taker permit signature validation (format check only)
  if (
    !bid.takerPermitSignature ||
    typeof bid.takerPermitSignature !== 'string'
  ) {
    return { ok: false, reason: 'invalid_taker_permit_signature_format' };
  }

  // Check if taker permit signature looks like a valid hex string
  if (
    !bid.takerPermitSignature.startsWith('0x') ||
    bid.takerPermitSignature.length < 10
  ) {
    return { ok: false, reason: 'invalid_taker_permit_signature_format' };
  }

  // Basic taker bid signature validation (format check only)
  if (!bid.takerBidSignature || typeof bid.takerBidSignature !== 'string') {
    return { ok: false, reason: 'invalid_taker_bid_signature_format' };
  }

  // Check if taker bid signature looks like a valid hex string
  if (
    !bid.takerBidSignature.startsWith('0x') ||
    bid.takerBidSignature.length < 10
  ) {
    return { ok: false, reason: 'invalid_taker_bid_signature_format' };
  }

  // TODO: decode tx target and calldata to verify it calls mint(MintParlayRequestData)
  // TODO: validate ERC20 permit signature for taker (maker signature provided on bid submission)
  // TODO: verify resolver address and market validation

  return { ok: true };
}
