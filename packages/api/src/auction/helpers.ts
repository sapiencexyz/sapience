import type { AuctionRequestPayload, BidPayload } from './types';
import {
  encodeAbiParameters,
  keccak256,
  verifyTypedData,
  getAddress,
} from 'viem';

/**
 * Helper function to create MintParlayRequestData for the ParlayPool.mint() function
 * This matches the struct defined in the Solidity contract
 */
export interface MintParlayRequestData {
  taker: string;
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
  resolver: string;
  wager: string;
  takerCollateral: string;
  // Note: ERC-20 approvals are handled off-chain by maker and taker separately
}

/**
 * Creates the MintParlayRequestData struct for the ParlayPool.mint() function
 */
export function createMintParlayRequestData(
  auction: AuctionRequestPayload,
  taker: string,
  takerCollateral: string
): MintParlayRequestData {
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
  if (!auction.resolver) {
    return { valid: false, error: 'Missing resolver address' };
  }
  if (!auction.maker) {
    return { valid: false, error: 'Missing maker address' };
  }

  // Basic maker address validation (0x-prefixed 40-hex)
  if (
    typeof auction.maker !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(auction.maker)
  ) {
    return { valid: false, error: 'Invalid maker address' };
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
 * Calculates the expected payout for a parlay (wager + taker collateral)
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
 * Extracts taker address from takerSignature (deprecated helper)
 * The signature should be signed by the taker's private key
 * This is a simplified implementation - in production you'd want proper signature recovery
 */
export function extractTakerFromSignature(): string | null {
  // Deprecated: taker is not derivable from a signature alone. Use verifyTakerBid instead.
  return null;
}

/**
 * Extracts takerWager from takerSignature (deprecated helper)
 * The signature should sign a message containing the takerWager amount
 * This is a simplified implementation - in production you'd want proper EIP-712 verification
 */
export function extractTakerWagerFromSignature(): string | null {
  // Deprecated: wager is not derivable from a signature alone. Use verifyTakerBid instead.
  return null;
}

/**
 * Verifies a taker bid using a typed payload scheme (e.g., EIP-712 or personal_sign preimage).
 * This function currently does structural checks only; wire in real signature recovery for production.
 */
export function verifyTakerBid(params: {
  auctionId: string;
  taker: string;
  takerWager: string;
  takerDeadline: number;
  takerSignature: string;
}): { ok: boolean; reason?: string } {
  try {
    const { auctionId, taker, takerWager, takerDeadline, takerSignature } =
      params;
    if (!auctionId || typeof auctionId !== 'string') {
      return { ok: false, reason: 'invalid_auction_id' };
    }
    if (typeof taker !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(taker)) {
      return { ok: false, reason: 'invalid_taker' };
    }
    if (!takerWager || BigInt(takerWager) <= 0n) {
      return { ok: false, reason: 'invalid_taker_wager' };
    }
    if (
      typeof takerDeadline !== 'number' ||
      !Number.isFinite(takerDeadline) ||
      takerDeadline <= Math.floor(Date.now() / 1000)
    ) {
      return { ok: false, reason: 'quote_expired' };
    }
    if (
      typeof takerSignature !== 'string' ||
      !takerSignature.startsWith('0x') ||
      takerSignature.length < 10
    ) {
      return { ok: false, reason: 'invalid_taker_bid_signature_format' };
    }

    // TODO: Implement real signature verification (EIP-712) against the exact typed payload
    // For now, treat format-valid signatures as acceptable.
    return { ok: true };
  } catch {
    return { ok: false, reason: 'verification_failed' };
  }
}

export async function verifyTakerBidStrict(params: {
  auction: AuctionRequestPayload;
  bid: BidPayload;
  chainId: number;
  verifyingContract: `0x${string}`;
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { auction, bid, chainId, verifyingContract } = params;

    // Basic guards
    if (!auction || !bid) return { ok: false, reason: 'invalid_payload' };
    if (!auction.predictedOutcomes?.length)
      return { ok: false, reason: 'invalid_auction_outcomes' };

    const encodedPredictedOutcomes = auction
      .predictedOutcomes[0] as `0x${string}`;

    // Hash the inner message per contract
    const inner = encodeAbiParameters(
      [
        { type: 'bytes' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
      ],
      [
        encodedPredictedOutcomes,
        BigInt(bid.takerWager),
        BigInt(auction.wager),
        auction.resolver as `0x${string}`,
        auction.maker as `0x${string}`,
        BigInt(bid.takerDeadline),
      ]
    );

    const messageHash = keccak256(inner);

    // EIP-712 domain and types must match SignatureProcessor
    const domain = {
      name: 'SignatureProcessor',
      version: '1',
      chainId,
      verifyingContract,
    } as const;

    const types = {
      Approve: [
        { name: 'messageHash', type: 'bytes32' },
        { name: 'owner', type: 'address' },
      ],
    } as const;

    const message = {
      messageHash,
      owner: getAddress(bid.taker),
    } as const;

    const ok = await verifyTypedData({
      address: getAddress(bid.taker),
      domain,
      primaryType: 'Approve',
      types,
      message,
      signature: bid.takerSignature as `0x${string}`,
    });

    return ok ? { ok: true } : { ok: false, reason: 'invalid_signature' };
  } catch {
    return { ok: false, reason: 'verification_failed' };
  }
}
