/**
 * Escrow Validation Helpers for Relayer
 */

import type { AuctionRFQPayload, BidPayload } from './escrowTypes';
import { computePickConfigId } from '@sapience/sdk/auction/escrowEncoding';
import type { Pick } from '@sapience/sdk/types';
import type { Address, Hex } from 'viem';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an escrow auction request has all required fields
 */
export function validateEscrowAuctionRequest(
  payload: AuctionRFQPayload
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
    if (!pick.conditionId || !/^0x[a-fA-F0-9]+$/.test(pick.conditionId) || pick.conditionId.length < 66) {
      return { valid: false, error: `Invalid conditionId in pick ${i}` };
    }
    if (pick.predictedOutcome !== 0 && pick.predictedOutcome !== 1) {
      return { valid: false, error: `Invalid predictedOutcome in pick ${i}` };
    }
  }

  // Validate predictor wager
  if (!payload.predictorCollateral) {
    return { valid: false, error: 'Missing predictorCollateral' };
  }
  try {
    const wager = BigInt(payload.predictorCollateral);
    if (wager <= 0n) {
      return { valid: false, error: 'predictorCollateral must be positive' };
    }
  } catch {
    return { valid: false, error: 'Invalid predictorCollateral format' };
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

  // Validate intent signature format if present (backward-compatible — old clients may omit)
  if (
    payload.intentSignature &&
    (typeof payload.intentSignature !== 'string' ||
      !payload.intentSignature.startsWith('0x') ||
      payload.intentSignature.length < 10)
  ) {
    return { valid: false, error: 'Invalid intentSignature format' };
  }

  return { valid: true };
}

/**
 * Validates an escrow bid has all required fields
 */
export function validateEscrowBid(
  bid: BidPayload,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  auction: AuctionRFQPayload
): ValidationResult {
  // Validate auctionId
  if (!bid.auctionId || typeof bid.auctionId !== 'string') {
    return { valid: false, error: 'Invalid auctionId' };
  }

  // Validate counterparty address
  if (!bid.counterparty || !/^0x[a-fA-F0-9]{40}$/.test(bid.counterparty)) {
    return { valid: false, error: 'Invalid counterparty address' };
  }

  // Validate counterpartyCollateral (wei string)
  if (!bid.counterpartyCollateral || typeof bid.counterpartyCollateral !== 'string') {
    return { valid: false, error: 'Missing counterpartyCollateral' };
  }
  try {
    const wager = BigInt(bid.counterpartyCollateral);
    if (wager <= 0n) {
      return { valid: false, error: 'counterpartyCollateral must be positive' };
    }
  } catch {
    return { valid: false, error: 'Invalid counterpartyCollateral format' };
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
export function computeEscrowPickConfigId(picks: AuctionRFQPayload['picks']): string {
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
export function createEscrowValidationError(
  reason: string,
  context?: Record<string, unknown>
): string {
  const baseMessage = `Escrow validation failed: ${reason}`;
  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    return `${baseMessage} (${contextStr})`;
  }
  return baseMessage;
}
