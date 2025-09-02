import type { BidPayload, RfqRequestPayload } from './types';
import {
  validateRfqForMint,
  validatePayout,
  createValidationError,
} from './helpers';

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

  // Validate payout matches expected total (wager + taker collateral)
  try {
    // For mint flow, payout should equal wager + takerCollateral
    if (!validatePayout(rfq.wager, bid.quote.delta, bid.quote.payout)) {
      return { ok: false, reason: 'payout_mismatch' };
    }
  } catch {
    return { ok: false, reason: 'invalid_payout_values' };
  }

  if (bid.quote.validUntil <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'quote_expired' };
  }

  // Validate taker collateral is reasonable (for now, allow bots to offer different amounts)
  try {
    const bidTakerCollateral = BigInt(bid.quote.delta);
    const wager = BigInt(rfq.wager);

    // Basic validation: taker collateral should be positive and not exceed wager
    if (bidTakerCollateral <= 0n) {
      return { ok: false, reason: 'invalid_taker_collateral' };
    }
    if (bidTakerCollateral > wager) {
      return { ok: false, reason: 'taker_collateral_too_high' };
    }
  } catch {
    return { ok: false, reason: 'invalid_collateral_values' };
  }

  // Ensure fill structure is present and valid for mint flow
  const fillData = bid.fill as unknown;
  if (
    !('rawSignedTx' in (fillData as Record<string, unknown>)) &&
    !('callData' in (fillData as Record<string, unknown>)) &&
    !('taker' in (fillData as Record<string, unknown>))
  ) {
    return { ok: false, reason: 'missing_fill' };
  }

  // For mint flow, validate MintParlayData structure
  if ('taker' in (fillData as Record<string, unknown>)) {
    const mintData = fillData as Record<string, unknown>;
    if (
      !mintData.taker ||
      !mintData.takerCollateral ||
      !mintData.takerSignature
    ) {
      return { ok: false, reason: 'incomplete_mint_data' };
    }

    // Validate taker matches bid taker
    if (
      typeof mintData.taker === 'string' &&
      mintData.taker.toLowerCase() !== bid.taker.toLowerCase()
    ) {
      return { ok: false, reason: 'taker_mismatch' };
    }

    // Validate taker collateral matches bid delta
    if (
      typeof mintData.takerCollateral === 'string' &&
      BigInt(mintData.takerCollateral) !== BigInt(bid.quote.delta)
    ) {
      return { ok: false, reason: 'mint_collateral_mismatch' };
    }

    // Basic taker signature validation (format check only)
    if (
      !mintData.takerSignature ||
      typeof mintData.takerSignature !== 'string'
    ) {
      return { ok: false, reason: 'invalid_taker_signature_format' };
    }

    // Check if taker signature looks like a valid hex string
    if (
      !mintData.takerSignature.startsWith('0x') ||
      mintData.takerSignature.length < 10
    ) {
      return { ok: false, reason: 'invalid_taker_signature_format' };
    }
  }

  // TODO: decode tx target and calldata to verify it calls mint(MintParlayRequestData)
  // TODO: validate ERC20 permit signature for taker (maker signature provided on bid submission)
  // TODO: verify resolver address and market validation

  return { ok: true };
}
