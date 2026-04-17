/**
 * Committed-Intent encoding & hashing helpers.
 *
 * Canonical reference: `prd-001-spec-0.1-canonical.md` §2 (EIP-712) and §3.3.
 * Mirrors `CommittedIntentExecutor.sol`'s `commitmentHash`, `quoteHash`,
 * and `DOMAIN_SEPARATOR` views.
 */

import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  toBytes,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem';
import type { Pick } from '../types/escrow';
import type { Commitment, Quote } from '../types/committedIntent';
import { computePickConfigId } from './escrowEncoding';

// ============================================================================
// Constants — canonical type strings (spec §2.3)
// ============================================================================

/**
 * Canonical `Commitment` type string, verbatim per spec §2.2/§2.3.
 * Field order matches the Solidity struct.
 */
export const COMMITMENT_TYPE_STRING =
  'Commitment(address predictor,uint64 predictorWindowEnd,uint64 deadline,bytes32 pickConfigId,uint256 amountIn,uint256 minFillIn,uint256 minAmountOut,uint256 executorTip,uint256 nonce)';

/** Canonical `Quote` type string. */
export const QUOTE_TYPE_STRING =
  'Quote(address counterparty,uint64 deadline,bytes32 commitmentHash,uint256 maxIn,uint256 amountOut,uint256 nonce)';

/** EIP-712 domain name for CommittedIntentExecutor. */
export const COMMITTED_INTENT_DOMAIN_NAME = 'SapienceCommittedIntent';
/** EIP-712 domain version for CommittedIntentExecutor. */
export const COMMITTED_INTENT_DOMAIN_VERSION = '1';

// ============================================================================
// Type hashes
// ============================================================================

/**
 * `keccak256(COMMITMENT_TYPE_STRING)`.
 * Must equal `COMMITMENT_TYPEHASH` in the executor contract.
 */
export function commitmentTypeHash(): Hex {
  return keccak256(toBytes(COMMITMENT_TYPE_STRING));
}

/**
 * `keccak256(QUOTE_TYPE_STRING)`.
 * Must equal `QUOTE_TYPEHASH` in the executor contract.
 */
export function quoteTypeHash(): Hex {
  return keccak256(toBytes(QUOTE_TYPE_STRING));
}

// ============================================================================
// Domain
// ============================================================================

/**
 * Build the EIP-712 domain separator used by `CommittedIntentExecutor`.
 *
 * `{name:"SapienceCommittedIntent", version:"1", chainId, verifyingContract:executor}`.
 */
export function buildCommitmentDomain(
  exec: Address,
  chainId: number
): TypedDataDomain {
  return {
    name: COMMITTED_INTENT_DOMAIN_NAME,
    version: COMMITTED_INTENT_DOMAIN_VERSION,
    chainId,
    verifyingContract: exec,
  };
}

// ============================================================================
// Canonical pickConfigId — thin re-export (do NOT duplicate)
// ============================================================================

/**
 * Compute the canonical `pickConfigId` for a set of picks.
 *
 * Thin wrapper over {@link computePickConfigId} — the on-chain executor
 * verifies `keccak256(canonicalize(picks)) == c.pickConfigId`, so callers
 * must canonicalize picks before computing this (see `canonicalizePicks`).
 */
export function canonicalizePickConfigId(picks: Pick[]): Hex {
  return computePickConfigId(picks);
}

// ============================================================================
// EIP-712 structural types for viem
// ============================================================================

/** Viem `types` object for a Commitment typed-data payload. */
export const COMMITMENT_EIP712_TYPES = {
  Commitment: [
    { name: 'predictor', type: 'address' },
    { name: 'predictorWindowEnd', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
    { name: 'pickConfigId', type: 'bytes32' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'minFillIn', type: 'uint256' },
    { name: 'minAmountOut', type: 'uint256' },
    { name: 'executorTip', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

/** Viem `types` object for a Quote typed-data payload. */
export const QUOTE_EIP712_TYPES = {
  Quote: [
    { name: 'counterparty', type: 'address' },
    { name: 'deadline', type: 'uint64' },
    { name: 'commitmentHash', type: 'bytes32' },
    { name: 'maxIn', type: 'uint256' },
    { name: 'amountOut', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

// ============================================================================
// Commitment / Quote hash computation
// ============================================================================

/**
 * Compute the EIP-712 hash of a Commitment.
 *
 * Matches `CommittedIntentExecutor.commitmentHash(Commitment)` and is the
 * digest signed by the predictor.
 */
export function computeCommitmentHash(
  c: Commitment,
  exec: Address,
  chainId: number
): Hex {
  return hashTypedData({
    domain: buildCommitmentDomain(exec, chainId),
    types: COMMITMENT_EIP712_TYPES,
    primaryType: 'Commitment',
    message: {
      predictor: c.predictor,
      predictorWindowEnd: c.predictorWindowEnd,
      deadline: c.deadline,
      pickConfigId: c.pickConfigId,
      amountIn: c.amountIn,
      minFillIn: c.minFillIn,
      minAmountOut: c.minAmountOut,
      executorTip: c.executorTip,
      nonce: c.nonce,
    },
  });
}

/**
 * Compute the EIP-712 hash of a Quote.
 *
 * Matches `CommittedIntentExecutor.quoteHash(Quote)` and is the digest
 * signed by the counterparty.
 */
export function computeQuoteHash(
  q: Quote,
  exec: Address,
  chainId: number
): Hex {
  return hashTypedData({
    domain: buildCommitmentDomain(exec, chainId),
    types: QUOTE_EIP712_TYPES,
    primaryType: 'Quote',
    message: {
      counterparty: q.counterparty,
      deadline: q.deadline,
      commitmentHash: q.commitmentHash,
      maxIn: q.maxIn,
      amountOut: q.amountOut,
      nonce: q.nonce,
    },
  });
}

// ============================================================================
// Domain separator helper
// ============================================================================

/**
 * Compute the EIP-712 `DOMAIN_SEPARATOR` for the executor.
 *
 * `keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, keccak(name), keccak(version),
 * chainId, verifyingContract))`.
 *
 * Matches `CommittedIntentExecutor.DOMAIN_SEPARATOR()`.
 */
export function computeDomainSeparator(exec: Address, chainId: number): Hex {
  const EIP712_DOMAIN_TYPEHASH = keccak256(
    toBytes(
      'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    )
  );
  const nameHash = keccak256(toBytes(COMMITTED_INTENT_DOMAIN_NAME));
  const versionHash = keccak256(toBytes(COMMITTED_INTENT_DOMAIN_VERSION));

  const encoded = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'bytes32' },
      { type: 'bytes32' },
      { type: 'uint256' },
      { type: 'address' },
    ],
    [EIP712_DOMAIN_TYPEHASH, nameHash, versionHash, BigInt(chainId), exec]
  );
  return keccak256(encoded);
}
