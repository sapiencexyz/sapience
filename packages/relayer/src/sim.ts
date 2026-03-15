import type { BidPayload, AuctionRequestPayload } from './types';
import {
  validateAuctionForMint,
  createValidationError,
  verifyMakerBid,
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

  // Validate maker fields in payload
  if (!bid.maker || typeof bid.maker !== 'string') {
    return { ok: false, reason: 'invalid_maker' };
  }
  if (!bid.makerCollateral) {
    return { ok: false, reason: 'invalid_maker_collateral' };
  }

  try {
    const makerCollateralBigInt = BigInt(bid.makerCollateral);

    // Basic validation: maker wager should be positive
    if (makerCollateralBigInt <= 0n) {
      return { ok: false, reason: 'invalid_maker_collateral' };
    }
  } catch {
    return { ok: false, reason: 'invalid_collateral_values' };
  }

  // Validate maker signature payload and deadline (format + expiry)
  const sigCheck = verifyMakerBid({
    auctionId: bid.auctionId,
    maker: bid.maker,
    makerCollateral: bid.makerCollateral,
    makerDeadline: bid.makerDeadline,
    makerSignature: bid.makerSignature,
  });
  if (!sigCheck.ok) {
    return { ok: false, reason: sigCheck.reason };
  }

  // Note: Collateral transfer now relies on standard ERC20 approvals, not permits.
  // Bots should ensure the maker has approved the PredictionMarket contract prior to bid submission.
  // TODO: verify resolver address and market validation

  return { ok: true };
}
