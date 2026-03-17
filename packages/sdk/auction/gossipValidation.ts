/**
 * Gossip payload validation for peer mesh messages.
 *
 * Two tiers:
 * - `isValidGossipPayload` — synchronous, structural only (fast path)
 * - `validateGossipPayloadAsync` — async, cryptographic signature verification
 *   using SDK validation functions. Must pass before dedup/delivery.
 */

import type { Address } from 'viem';
import type { AuctionRFQPayload } from '../types/escrow';
import { validateAuctionRFQ } from './validation';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function isAddress(v: unknown): v is string {
  return typeof v === 'string' && ADDRESS_RE.test(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Max length for numeric string fields (collateral, etc.) to prevent BigInt parse DoS. */
const MAX_NUMERIC_STRING_LEN = 78; // uint256 max is 78 decimal digits

function isBoundedNumericString(v: unknown): v is string {
  return isNonEmptyString(v) && v.length <= MAX_NUMERIC_STRING_LEN;
}

/** Max conditionId hex length. bytes32 = 66 chars (0x + 64); allow up to 322 for Pyth encoding. */
const MAX_CONDITION_ID_LEN = 322;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPickJson(p: unknown): boolean {
  if (typeof p !== 'object' || p === null) return false;
  const pick = p as Record<string, unknown>;
  return (
    isAddress(pick.conditionResolver) &&
    typeof pick.conditionId === 'string' &&
    /^0x[a-fA-F0-9]+$/.test(pick.conditionId) &&
    pick.conditionId.length >= 66 &&
    pick.conditionId.length <= MAX_CONDITION_ID_LEN &&
    (pick.predictedOutcome === 0 || pick.predictedOutcome === 1)
  );
}

function hasValidPicks(payload: Record<string, unknown>): boolean {
  return (
    Array.isArray(payload.picks) &&
    payload.picks.length > 0 &&
    payload.picks.every(isPickJson)
  );
}

/**
 * Validates the structural shape of a gossip payload for known message types.
 * Returns true if the payload is well-formed, false if it should be dropped.
 *
 * Unknown message types return false (deny by default).
 */
export function isValidGossipPayload(type: string, payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;

  switch (type) {
    case 'auction.start':
      return (
        hasValidPicks(p) &&
        isAddress(p.predictor) &&
        isBoundedNumericString(p.predictorCollateral) &&
        isFiniteNumber(p.chainId) &&
        p.chainId > 0
      );

    case 'auction.started':
      return (
        isNonEmptyString(p.auctionId) &&
        hasValidPicks(p) &&
        isAddress(p.predictor) &&
        isBoundedNumericString(p.predictorCollateral) &&
        isFiniteNumber(p.chainId) &&
        p.chainId > 0
      );

    case 'auction.bids':
      return (
        isNonEmptyString(p.auctionId) &&
        Array.isArray(p.bids) &&
        p.bids.every((b: unknown) => {
          if (typeof b !== 'object' || b === null) return false;
          const bid = b as Record<string, unknown>;
          return (
            isNonEmptyString(bid.auctionId) &&
            isAddress(bid.counterparty) &&
            isBoundedNumericString(bid.counterpartyCollateral)
          );
        })
      );

    case 'bid.submit':
      return (
        isNonEmptyString(p.auctionId) &&
        isAddress(p.counterparty) &&
        isBoundedNumericString(p.counterpartyCollateral)
      );

    case 'bid.ack':
      return isNonEmptyString(p.auctionId);

    case 'auction.filled':
      return (
        isNonEmptyString(p.auctionId) && isNonEmptyString(p.transactionHash)
      );

    case 'auction.expired':
      return isNonEmptyString(p.auctionId) && isNonEmptyString(p.reason);

    case 'order.created':
      // Loose — just require it's an object with an id or auctionId
      return isNonEmptyString(p.id) || isNonEmptyString(p.auctionId);

    default:
      return false;
  }
}

// ─── Async Cryptographic Validation ──────────────────────────────────────────

export interface GossipValidationContext {
  /** Escrow contract address for signature verification. */
  verifyingContract: Address;
  /** Expected chain ID. */
  chainId: number;
}

/**
 * Async gossip payload validation with cryptographic signature verification.
 *
 * Runs structural checks first (via isValidGossipPayload), then verifies
 * signatures using the SDK validation functions. Returns true if the payload
 * should be accepted, false if it should be dropped.
 *
 * - auction.start / auction.started → verifies predictor intent signature
 * - bid.submit / auction.bids / status messages → structural only
 *   (bid signatures are verified on-chain at settlement)
 */
export async function validateGossipPayloadAsync(
  type: string,
  payload: unknown,
  ctx: GossipValidationContext
): Promise<boolean> {
  // Fast structural rejection
  if (!isValidGossipPayload(type, payload)) return false;

  const p = payload as Record<string, unknown>;

  try {
    switch (type) {
      case 'auction.start':
      case 'auction.started': {
        const result = await validateAuctionRFQ(
          p as unknown as AuctionRFQPayload,
          {
            verifyingContract: ctx.verifyingContract,
            chainId: ctx.chainId,
            requireSignature: true,
          }
        );
        return result.status === 'valid';
      }

      // Bids and status messages — structural check already passed.
      // Bid signatures are verified on-chain at settlement; no auction
      // context needed here.
      case 'bid.submit':
      case 'auction.bids':
      case 'bid.ack':
      case 'auction.filled':
      case 'auction.expired':
      case 'order.created':
        return true;

      default:
        return false;
    }
  } catch {
    // Signature verification or other validation errors — treat as invalid
    return false;
  }
}
