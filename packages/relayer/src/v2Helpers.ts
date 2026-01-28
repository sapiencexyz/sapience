/**
 * V2 Validation Helpers for Relayer
 */

import type { V2AuctionRequestPayload, V2BidPayload } from './v2Types';
import { computePickConfigId } from '@sapience/sdk/auction/v2Encoding';
import type { Pick } from '@sapience/sdk/types/v2';
import type { Address, Hex } from 'viem';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a V2 auction request has all required fields
 */
export function validateV2AuctionRequest(
  payload: V2AuctionRequestPayload
): ValidationResult {
  // Validate picks array
  if (!payload.picks || !Array.isArray(payload.picks) || payload.picks.length === 0) {
    return { valid: false, error: 'Invalid or empty picks array' };
  }

  // Validate each pick
  for (let i = 0; i < payload.picks.length; i++) {
    const pick = payload.picks[i];
    if (!pick.conditionResolver || !/^0x[a-fA-F0-9]{40}$/.test(pick.conditionResolver)) {
      return { valid: false, error: `Invalid conditionResolver in pick ${i}` };
    }
    if (!pick.conditionId || !/^0x[a-fA-F0-9]{64}$/.test(pick.conditionId)) {
      return { valid: false, error: `Invalid conditionId in pick ${i}` };
    }
    if (pick.predictedOutcome !== 0 && pick.predictedOutcome !== 1) {
      return { valid: false, error: `Invalid predictedOutcome in pick ${i}` };
    }
  }

  // Validate predictor wager
  if (!payload.predictorWager) {
    return { valid: false, error: 'Missing predictorWager' };
  }
  try {
    const wager = BigInt(payload.predictorWager);
    if (wager <= 0n) {
      return { valid: false, error: 'predictorWager must be positive' };
    }
  } catch {
    return { valid: false, error: 'Invalid predictorWager format' };
  }

  // Validate counterparty wager
  if (!payload.counterpartyWager) {
    return { valid: false, error: 'Missing counterpartyWager' };
  }
  try {
    const wager = BigInt(payload.counterpartyWager);
    if (wager <= 0n) {
      return { valid: false, error: 'counterpartyWager must be positive' };
    }
  } catch {
    return { valid: false, error: 'Invalid counterpartyWager format' };
  }

  // Validate predictor address
  if (!payload.predictor || !/^0x[a-fA-F0-9]{40}$/.test(payload.predictor)) {
    return { valid: false, error: 'Invalid predictor address' };
  }

  // Validate nonce
  if (
    typeof payload.predictorNonce !== 'number' ||
    !Number.isFinite(payload.predictorNonce) ||
    payload.predictorNonce < 0
  ) {
    return { valid: false, error: 'Invalid predictorNonce' };
  }

  // Validate deadline
  if (
    typeof payload.predictorDeadline !== 'number' ||
    !Number.isFinite(payload.predictorDeadline) ||
    payload.predictorDeadline <= Math.floor(Date.now() / 1000)
  ) {
    return { valid: false, error: 'predictorDeadline must be in the future' };
  }

  // Validate chainId
  if (
    typeof payload.chainId !== 'number' ||
    !Number.isFinite(payload.chainId) ||
    payload.chainId <= 0
  ) {
    return { valid: false, error: 'Invalid chainId' };
  }

  // Validate signature format (required for V2)
  if (
    !payload.predictorSignature ||
    typeof payload.predictorSignature !== 'string' ||
    !payload.predictorSignature.startsWith('0x') ||
    payload.predictorSignature.length < 10
  ) {
    return { valid: false, error: 'Invalid predictorSignature format' };
  }

  return { valid: true };
}

/**
 * Validates a V2 bid has all required fields
 */
export function validateV2Bid(
  bid: V2BidPayload,
  auction: V2AuctionRequestPayload
): ValidationResult {
  // Validate auctionId
  if (!bid.auctionId || typeof bid.auctionId !== 'string') {
    return { valid: false, error: 'Invalid auctionId' };
  }

  // Validate counterparty address
  if (!bid.counterparty || !/^0x[a-fA-F0-9]{40}$/.test(bid.counterparty)) {
    return { valid: false, error: 'Invalid counterparty address' };
  }

  // Counterparty cannot be same as predictor
  if (bid.counterparty.toLowerCase() === auction.predictor.toLowerCase()) {
    return { valid: false, error: 'Counterparty cannot be same as predictor' };
  }

  // Validate nonce
  if (
    typeof bid.counterpartyNonce !== 'number' ||
    !Number.isFinite(bid.counterpartyNonce) ||
    bid.counterpartyNonce < 0
  ) {
    return { valid: false, error: 'Invalid counterpartyNonce' };
  }

  // Validate deadline
  if (
    typeof bid.counterpartyDeadline !== 'number' ||
    !Number.isFinite(bid.counterpartyDeadline) ||
    bid.counterpartyDeadline <= Math.floor(Date.now() / 1000)
  ) {
    return { valid: false, error: 'counterpartyDeadline must be in the future' };
  }

  // Validate signature format
  if (
    !bid.counterpartySignature ||
    typeof bid.counterpartySignature !== 'string' ||
    !bid.counterpartySignature.startsWith('0x') ||
    bid.counterpartySignature.length < 10
  ) {
    return { valid: false, error: 'Invalid counterpartySignature format' };
  }

  return { valid: true };
}

/**
 * Compute pickConfigId from picks array
 */
export function computeV2PickConfigId(picks: V2AuctionRequestPayload['picks']): string {
  const sdkPicks: Pick[] = picks.map((p) => ({
    conditionResolver: p.conditionResolver as Address,
    conditionId: p.conditionId as Hex,
    predictedOutcome: p.predictedOutcome,
  }));
  return computePickConfigId(sdkPicks);
}

/**
 * Creates a standardized error message
 */
export function createV2ValidationError(
  reason: string,
  context?: Record<string, unknown>
): string {
  const baseMessage = `V2 Validation failed: ${reason}`;
  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    return `${baseMessage} (${contextStr})`;
  }
  return baseMessage;
}
