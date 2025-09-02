import type { BidPayload, RfqRequestPayload } from './types';
import { validateRfqForMint, createValidationError } from './helpers';

export interface SimResult {
  ok: boolean;
  reason?: string;
}

export function basicValidateBid(
  rfq: RfqRequestPayload,
  bid: BidPayload
): SimResult {
  if (!rfq || !bid) return { ok: false, reason: 'invalid_payload' };

  // Validate RFQ structure for mint flow
  const rfqValidation = validateRfqForMint(rfq);
  if (!rfqValidation.valid) {
    return {
      ok: false,
      reason: createValidationError(rfqValidation.error || 'invalid_rfq'),
    };
  }

  // Validate taker wager is reasonable
  try {
    const takerWager = BigInt(bid.takerWager);
    const wager = BigInt(rfq.wager);

    // Basic validation: taker wager should be positive and not exceed maker wager
    if (takerWager <= 0n) {
      return { ok: false, reason: 'invalid_taker_wager' };
    }
    if (takerWager > wager) {
      return { ok: false, reason: 'taker_wager_too_high' };
    }
  } catch {
    return { ok: false, reason: 'invalid_wager_values' };
  }

  if (bid.expirationTimestamp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'quote_expired' };
  }

  // Validate mint data structure
  if (
    !bid.taker ||
    !bid.takerWager ||
    !bid.takerPermitSignature ||
    !bid.takerBidSignature
  ) {
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
