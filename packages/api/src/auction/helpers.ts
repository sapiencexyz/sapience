import type { AuctionRequestPayload } from './types';

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
  makerSignature: string;
  takerSignature: string;
}

/**
 * Creates the MintParlayRequestData struct for the ParlayPool.mint() function
 */
export function createMintParlayRequestData(
  auction: AuctionRequestPayload,
  taker: string,
  takerCollateral: string,
  makerSignature: string,
  takerSignature: string
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
    makerSignature: makerSignature,
    takerSignature: takerSignature,
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
 * Extracts taker address from takerBidSignature
 * The signature should be signed by the taker's private key
 * This is a simplified implementation - in production you'd want proper signature recovery
 */
export function extractTakerFromSignature(
  takerBidSignature: string
): string | null {
  try {
    // Basic validation
    if (
      !takerBidSignature ||
      !takerBidSignature.startsWith('0x') ||
      takerBidSignature.length < 10
    ) {
      return null;
    }

    // For now, we'll use a simple approach where the signature contains encoded data
    // In a real implementation, you'd recover the address from the signature using ecrecover
    // This is a placeholder that extracts from the signature bytes

    // Remove '0x' prefix and get the signature data
    const signatureData = takerBidSignature.slice(2);

    // For demonstration, we'll extract the first 40 bytes (80 hex chars) as the taker address
    // In reality, you'd need to properly recover the address from the signature
    if (signatureData.length >= 80) {
      // Extract the first 40 bytes (80 hex chars) as taker address
      const addressHex = signatureData.slice(0, 80);
      const taker = '0x' + addressHex;

      // Basic validation - address should be valid format
      if (/^0x[a-fA-F0-9]{40}$/.test(taker)) {
        return taker;
      }
    }

    return null;
  } catch (error) {
    console.warn('Failed to extract taker from signature:', error);
    return null;
  }
}

/**
 * Extracts takerWager from takerBidSignature
 * The signature should sign a message containing the takerWager amount
 * This is a simplified implementation - in production you'd want proper EIP-712 verification
 */
export function extractTakerWagerFromSignature(
  takerBidSignature: string
): string | null {
  try {
    // Basic validation
    if (
      !takerBidSignature ||
      !takerBidSignature.startsWith('0x') ||
      takerBidSignature.length < 10
    ) {
      return null;
    }

    // For now, we'll use a simple approach where the signature contains encoded data
    // In a real implementation, you'd decode the signature and verify it properly
    // This is a placeholder that extracts from the signature bytes

    // Remove '0x' prefix and get the signature data
    const signatureData = takerBidSignature.slice(2);

    // For demonstration, we'll extract the last 32 bytes (64 hex chars) as the takerWager
    // In reality, you'd need to properly decode the signed message
    if (signatureData.length >= 64) {
      // Extract the last 32 bytes (64 hex chars) as takerWager
      const wagerHex = signatureData.slice(-64);
      const takerWager = BigInt('0x' + wagerHex).toString();

      // Basic validation - wager should be reasonable
      if (
        BigInt(takerWager) > 0n &&
        BigInt(takerWager) < BigInt('1000000000000000000000000')
      ) {
        // Max 1M tokens
        return takerWager;
      }
    }

    return null;
  } catch (error) {
    console.warn('Failed to extract takerWager from signature:', error);
    return null;
  }
}
