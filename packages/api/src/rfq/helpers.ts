import type { RfqRequestPayload } from './types';

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
  rfq: RfqRequestPayload,
  taker: string,
  takerCollateral: string,
  makerSignature: string,
  takerSignature: string
): MintParlayRequestData {
  if (!rfq.resolver) {
    throw new Error('RFQ must have a resolver address');
  }

  return {
    taker: taker,
    predictedOutcomes: rfq.predictedOutcomes,
    resolver: rfq.resolver,
    wager: rfq.wager,
    takerCollateral: takerCollateral,
    makerSignature: makerSignature,
    takerSignature: takerSignature,
  };
}

/**
 * Validates that an RFQ has all required fields for the mint flow
 */
export function validateRfqForMint(rfq: RfqRequestPayload): {
  valid: boolean;
  error?: string;
} {
  if (!rfq.wager || BigInt(rfq.wager) <= 0n) {
    return { valid: false, error: 'Invalid wager' };
  }
  if (!rfq.predictedOutcomes || rfq.predictedOutcomes.length === 0) {
    return { valid: false, error: 'No predicted outcomes' };
  }
  if (!rfq.resolver) {
    return { valid: false, error: 'Missing resolver address' };
  }

  // Validate predicted outcomes are non-empty bytes strings
  for (const outcome of rfq.predictedOutcomes) {
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
