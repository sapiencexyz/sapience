import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';
import type { Pick, PickJson, OutcomeSide } from '../types/escrow';

// ============================================================================
// Pick Encoding
// ============================================================================
//
// ## conditionId: variable-length bytes
//
// The on-chain Pick struct uses `bytes conditionId` (variable length).
// For UMA/Polymarket resolvers this is an abi-encoded bytes32 market ID.
// For Pyth resolvers the conditionId is `abi.encode(priceId, endTime,
// strikePrice, strikeExpo, overWinsOnTie)` (160 bytes).
// For CT resolvers, conditionId may include a deadline timestamp:
// 32 bytes = raw conditionId, 64 bytes = conditionId + uint256 deadline.
//
// conditionIds are passed as-is to the on-chain Pick struct (no hashing).
// Canonical ordering of picks compares keccak256(conditionId) to match
// the on-chain _validatePicks logic.
//

/**
 * ABI parameters for encoding a Pick struct
 * Matches the Pick struct in PredictionMarketEscrow
 */
const PICK_TUPLE_TYPE = {
  type: 'tuple',
  components: [
    { name: 'conditionResolver', type: 'address' },
    { name: 'conditionId', type: 'bytes' },
    { name: 'predictedOutcome', type: 'uint8' },
  ],
} as const;

/**
 * ABI parameters for encoding a Pick[] array
 */
const PICKS_ARRAY_TYPE = {
  type: 'tuple[]',
  components: PICK_TUPLE_TYPE.components,
} as const;

/**
 * Encode an array of picks for ABI encoding
 * Internal helper that formats picks for encodeAbiParameters
 */
function formatPicksForEncoding(picks: Pick[]): Array<{
  conditionResolver: Address;
  conditionId: Hex;
  predictedOutcome: number;
}> {
  return picks.map((pick) => ({
    conditionResolver: pick.conditionResolver,
    // On-chain Pick struct uses bytes conditionId — pass as-is (no hashing)
    conditionId: pick.conditionId,
    predictedOutcome: pick.predictedOutcome,
  }));
}

/**
 * Compute pickConfigId from an array of picks
 *
 * Mirrors `PredictionMarketEscrow._computePickConfigId`:
 * `keccak256(abi.encode(picks))`
 *
 * @param picks Array of Pick structs (must be canonically ordered)
 * @returns bytes32 pickConfigId
 */
export function computePickConfigId(picks: Pick[]): Hex {
  const encoded = encodeAbiParameters(
    [PICKS_ARRAY_TYPE],
    [formatPicksForEncoding(picks)]
  );
  return keccak256(encoded);
}

/**
 * Compute predictionId from pickConfigId, predictor, counterparty, and nonces
 *
 * Mirrors `PredictionMarketEscrow.mint`:
 * `keccak256(abi.encode(pickConfigId, predictor, counterparty, predictorNonce, counterpartyNonce))`
 *
 * @param pickConfigId The pick configuration ID
 * @param predictor The predictor address
 * @param counterparty The counterparty address
 * @param predictorNonce The predictor's nonce
 * @param counterpartyNonce The counterparty's nonce
 * @returns bytes32 predictionId
 */
export function computePredictionId(
  pickConfigId: Hex,
  predictor: Address,
  counterparty: Address,
  predictorNonce: bigint,
  counterpartyNonce: bigint
): Hex {
  const encoded = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
    ],
    [pickConfigId, predictor, counterparty, predictorNonce, counterpartyNonce]
  );
  return keccak256(encoded);
}

/**
 * Encode picks array for transport/storage
 *
 * @param picks Array of Pick structs
 * @returns ABI-encoded bytes
 */
export function encodePicks(picks: Pick[]): Hex {
  return encodeAbiParameters(
    [PICKS_ARRAY_TYPE],
    [formatPicksForEncoding(picks)]
  );
}

// ============================================================================
// JSON Conversion Utilities
// ============================================================================

/**
 * Convert a Pick to JSON-safe format (for WebSocket/API transport)
 */
export function pickToJson(pick: Pick): PickJson {
  return {
    conditionResolver: pick.conditionResolver,
    conditionId: pick.conditionId,
    predictedOutcome: pick.predictedOutcome,
  };
}

/**
 * Convert picks array to JSON-safe format
 */
export function picksToJson(picks: Pick[]): PickJson[] {
  return picks.map(pickToJson);
}

/**
 * Convert JSON pick back to typed Pick
 */
export function jsonToPick(json: PickJson): Pick {
  return {
    conditionResolver: json.conditionResolver as Address,
    conditionId: json.conditionId as Hex,
    predictedOutcome: json.predictedOutcome as OutcomeSide,
  };
}

/**
 * Convert JSON picks array back to typed Picks
 */
export function jsonToPicks(json: PickJson[]): Pick[] {
  return json.map(jsonToPick);
}

// ============================================================================
// Pick Validation & Canonicalization
// ============================================================================

/**
 * Sort picks into canonical order for consistent pickConfigId computation
 *
 * Sorts by:
 * 1. conditionResolver (address, ascending)
 * 2. keccak256(conditionId) (ascending)
 *
 * @param picks Array of picks (will not be mutated)
 * @returns New array with picks in canonical order
 */
export function canonicalizePicks(picks: Pick[]): Pick[] {
  return [...picks].sort((a, b) => {
    // First sort by resolver address
    const resolverCmp = a.conditionResolver
      .toLowerCase()
      .localeCompare(b.conditionResolver.toLowerCase());
    if (resolverCmp !== 0) return resolverCmp;

    // Then by keccak256(conditionId) — matches on-chain canonical ordering
    const hashA = keccak256(a.conditionId as Hex);
    const hashB = keccak256(b.conditionId as Hex);
    return hashA.toLowerCase().localeCompare(hashB.toLowerCase());
  });
}

/**
 * Validate that a pick has valid structure
 */
export function isValidPick(pick: unknown): pick is Pick {
  if (typeof pick !== 'object' || pick === null) return false;
  const p = pick as Record<string, unknown>;

  // Check conditionResolver is valid address format
  if (
    typeof p.conditionResolver !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(p.conditionResolver)
  ) {
    return false;
  }

  // Check conditionId is valid hex — must be at least bytes32 (66 chars = "0x" + 64).
  // Longer values are valid: Pyth picks carry the full raw ABI encoding,
  // CT resolvers may include a deadline (64 bytes / 130 hex chars).
  if (
    typeof p.conditionId !== 'string' ||
    !/^0x[a-fA-F0-9]+$/.test(p.conditionId) ||
    p.conditionId.length < 66 // bytes32 minimum
  ) {
    return false;
  }

  // Check predictedOutcome is 0 or 1
  if (
    typeof p.predictedOutcome !== 'number' ||
    (p.predictedOutcome !== 0 && p.predictedOutcome !== 1)
  ) {
    return false;
  }

  return true;
}

/**
 * Validate an array of picks
 */
export function isValidPicksArray(picks: unknown): picks is Pick[] {
  if (!Array.isArray(picks)) return false;
  if (picks.length === 0) return false;
  return picks.every(isValidPick);
}
