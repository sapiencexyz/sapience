import type { AuctionRequestPayload } from './types';

/**
 * Helper function to create MintComboRequestData for the escrow mint() function
 * This matches the struct defined in the Solidity contract
 */
export interface MintComboRequestData {
  taker: string;
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
  resolver: string;
  wager: string;
  takerCollateral: string;
  // Note: ERC-20 approvals are handled off-chain by maker and taker separately
}

/**
 * Creates the MintComboRequestData struct for the escrow mint() function
 */
export function createMintComboRequestData(
  auction: AuctionRequestPayload,
  taker: string,
  takerCollateral: string
): MintComboRequestData {
  if (!auction.resolver) {
    throw new Error('Auction must have a resolver address');
  }

  return {
    taker: taker,
    predictedOutcomes: auction.predictedOutcomes,
    resolver: auction.resolver,
    wager: auction.wager,
    takerCollateral: takerCollateral,
  };
}

/**
 * Validates that an Auction has all required fields for the mint flow
 */
export function validateAuctionForMint(auction: AuctionRequestPayload): {
  valid: boolean;
  error?: string;
} {
  if (!auction.wager || BigInt(auction.wager) <= 0n) {
    return { valid: false, error: 'Invalid wager' };
  }
  if (!auction.predictedOutcomes || auction.predictedOutcomes.length === 0) {
    return { valid: false, error: 'No predicted outcomes' };
  }
  // chainId must be a finite positive number
  if (
    typeof auction.chainId !== 'number' ||
    !Number.isFinite(auction.chainId) ||
    auction.chainId <= 0
  ) {
    return { valid: false, error: 'Invalid chainId' };
  }
  // resolver must be a 0x address
  if (
    typeof auction.resolver !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(auction.resolver)
  ) {
    return { valid: false, error: 'Invalid resolver address' };
  }
  if (!auction.taker) {
    return { valid: false, error: 'Missing taker address' };
  }

  // Basic taker address validation (0x-prefixed 40-hex)
  if (
    typeof auction.taker !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(auction.taker)
  ) {
    return { valid: false, error: 'Invalid taker address' };
  }
  // takerNonce must be a finite number
  if (
    typeof auction.takerNonce !== 'number' ||
    !Number.isFinite(auction.takerNonce) ||
    auction.takerNonce < 0
  ) {
    return { valid: false, error: 'Invalid takerNonce' };
  }

  // Validate predicted outcomes are non-empty bytes strings
  for (const outcome of auction.predictedOutcomes) {
    if (!outcome || typeof outcome !== 'string' || outcome.length === 0) {
      return {
        valid: false,
        error: 'Invalid predicted outcome: must be non-empty bytes string',
      };
    }
  }

  return { valid: true };
}

/**
 * Calculates the expected payout for a position (wager + taker collateral)
 */
export function calculateExpectedPayout(
  wager: string,
  takerCollateral: string
): string {
  const wagerAmount = BigInt(wager);
  const takerAmount = BigInt(takerCollateral);
  return (wagerAmount + takerAmount).toString();
}

/**
 * Validates that a bid's payout matches the expected payout
 */
export function validatePayout(
  wager: string,
  takerCollateral: string,
  bidPayout: string
): boolean {
  const expectedPayout = calculateExpectedPayout(wager, takerCollateral);
  return BigInt(bidPayout) === BigInt(expectedPayout);
}

/**
 * Creates a standardized error message for common validation failures
 */
export function createValidationError(
  reason: string,
  context?: Record<string, unknown>
): string {
  const baseMessage = `Validation failed: ${reason}`;
  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    return `${baseMessage} (${contextStr})`;
  }
  return baseMessage;
}

/**
 * Verifies a maker bid using a typed payload scheme.
 * This function currently does structural checks only.
 */
export function verifyMakerBid(params: {
  auctionId: string;
  maker: string;
  makerCollateral: string;
  makerDeadline: number;
  makerSignature: string;
}): { ok: boolean; reason?: string } {
  try {
    const { auctionId, maker, makerCollateral, makerDeadline, makerSignature } =
      params;
    if (!auctionId || typeof auctionId !== 'string') {
      return { ok: false, reason: 'invalid_auction_id' };
    }
    if (typeof maker !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(maker)) {
      return { ok: false, reason: 'invalid_maker' };
    }
    if (!makerCollateral || BigInt(makerCollateral) <= 0n) {
      return { ok: false, reason: 'invalid_maker_collateral' };
    }
    if (
      typeof makerDeadline !== 'number' ||
      !Number.isFinite(makerDeadline) ||
      makerDeadline <= Math.floor(Date.now() / 1000)
    ) {
      return { ok: false, reason: 'quote_expired' };
    }
    if (
      typeof makerSignature !== 'string' ||
      !makerSignature.startsWith('0x') ||
      makerSignature.length < 10
    ) {
      return { ok: false, reason: 'invalid_maker_bid_signature_format' };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: 'verification_failed' };
  }
}
