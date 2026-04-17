import type { Address, Hex } from 'viem';
import type { PickJson } from './escrow';

/**
 * Committed-Intent Types
 *
 * TypeScript mirror of the Solidity structs defined in
 * `ICommittedIntent.sol` (see prd-001-spec-0.1-canonical.md §1.1, §1.2).
 *
 * Two variants are exported for every struct:
 *   - Runtime type (bigint / Address / Hex) — used in-process, signing,
 *     contract calls.
 *   - JSON type (decimal strings) — used on the wire (WebSocket, REST).
 *
 * Paired converters `commitmentFromJson`/`commitmentToJson` (and the
 * same for quotes) handle the bigint ↔ string conversion.
 */

// ============================================================================
// Runtime types (bigint, Address, Hex)
// ============================================================================

/**
 * Predictor-signed Commitment (EIP-712).
 *
 * Field order must match the Solidity struct exactly — the SDK encodes in
 * this order and the contract hashes in this order. See §1.1 canonical.
 */
export interface Commitment {
  /** Predictor EOA / smart account. Signer of the commitment. */
  predictor: Address;
  /** End of T₁ predictor-exclusive window (unix seconds). Packed with deadline. */
  predictorWindowEnd: bigint;
  /** End of T₂ / expiry (unix seconds). `deadline > predictorWindowEnd`. */
  deadline: bigint;
  /** Canonical `pickConfigId` (keccak256 of abi-encoded canonical picks). */
  pickConfigId: Hex;
  /** Total predictor collateral offered (18 decimals). */
  amountIn: bigint;
  /** Minimum aggregate filled-in for a successful mint. */
  minFillIn: bigint;
  /** Floor on aggregate `amountOut` over the filled portion. */
  minAmountOut: bigint;
  /** Fixed tip paid to executor iff `msg.sender != predictor`. Escrowed separately from amountIn. */
  executorTip: bigint;
  /** Commitment-level nonce (executor's own bitmap, independent of Escrow). */
  nonce: bigint;
}

/**
 * Counterparty-signed Quote (EIP-712). Binds the counterparty to fill
 * up to `maxIn` of the predictor's collateral at implicit price
 * `amountOut / maxIn`.
 */
export interface Quote {
  /** Counterparty EOA / smart account producing the quote. */
  counterparty: Address;
  /** Quote expiry (unix seconds). Must be ≤ `commitment.deadline`. */
  deadline: bigint;
  /** Hash of the Commitment this quote is bidding against. */
  commitmentHash: Hex;
  /** Max predictor collateral this quote is willing to fill. */
  maxIn: bigint;
  /** `amountOut` returned by the counterparty if fully consumed (pro-rated for partial fills). */
  amountOut: bigint;
  /** Monotonic per-counterparty nonce — enables bulk off-chain cancel ("invalidate ≤ k"). */
  nonce: bigint;
}

// ============================================================================
// JSON transport types (decimal strings, lowercase hex)
// ============================================================================

/** Commitment shape used on the wire. Bigints serialized as decimal strings. */
export interface CommitmentJson {
  predictor: string;
  predictorWindowEnd: string;
  deadline: string;
  pickConfigId: string;
  amountIn: string;
  minFillIn: string;
  minAmountOut: string;
  executorTip: string;
  nonce: string;
}

/** Quote shape used on the wire. */
export interface QuoteJson {
  counterparty: string;
  deadline: string;
  commitmentHash: string;
  maxIn: string;
  amountOut: string;
  nonce: string;
}

/**
 * Envelope submitted to the relayer when the predictor publishes a
 * commitment. Includes the EIP-712 signature plus sponsorship hints so
 * the relayer knows how `PreMintEscrow.lock` should source funds.
 */
export interface SignedCommitmentJson {
  commitment: CommitmentJson;
  /** EIP-712 signature produced by the predictor (or session key / ERC-1271 fallback). */
  signature: string;
  /** Optional sponsor contract to pull part of the escrow from (address(0) = self-funded). */
  predictorSponsor?: string;
  /** Opaque data forwarded to the sponsor. */
  predictorSponsorData?: string;
  chainId: number;
  /** `CommittedIntentExecutor` address the commitment is bound to via domain. */
  executorContract: string;
  /** Canonical picks array — needed by executor.execute() and pricing engines. */
  picks: PickJson[];
}

/** Envelope submitted by a counterparty carrying a signed Quote. */
export interface SignedQuoteJson {
  quote: QuoteJson;
  /** EIP-712 signature by the counterparty. */
  signature: string;
  /** ISO timestamp when the relayer received the quote (filled by relayer). */
  receivedAt: string;
}

/**
 * Bulk off-chain quote-cancel payload. Invalidates every quote from
 * `counterparty` with `nonce < minNonce` at the relayer layer only —
 * contracts do not read this (per 4.5.5b).
 */
export interface QuoteCancelJson {
  counterparty: string;
  /** All live quotes with `nonce < minNonce` are cancelled. */
  minNonce: string;
  /** Signature over the cancel payload (off-chain auth). */
  signature: string;
}

// ============================================================================
// JSON <-> runtime converters
// ============================================================================

/**
 * Convert a runtime Commitment to the JSON transport shape.
 * Pairs with {@link commitmentFromJson}.
 */
export function commitmentToJson(c: Commitment): CommitmentJson {
  return {
    predictor: c.predictor,
    predictorWindowEnd: c.predictorWindowEnd.toString(),
    deadline: c.deadline.toString(),
    pickConfigId: c.pickConfigId,
    amountIn: c.amountIn.toString(),
    minFillIn: c.minFillIn.toString(),
    minAmountOut: c.minAmountOut.toString(),
    executorTip: c.executorTip.toString(),
    nonce: c.nonce.toString(),
  };
}

/** Convert a JSON Commitment back to runtime types (bigints, branded hex). */
export function commitmentFromJson(j: CommitmentJson): Commitment {
  return {
    predictor: j.predictor as Address,
    predictorWindowEnd: BigInt(j.predictorWindowEnd),
    deadline: BigInt(j.deadline),
    pickConfigId: j.pickConfigId as Hex,
    amountIn: BigInt(j.amountIn),
    minFillIn: BigInt(j.minFillIn),
    minAmountOut: BigInt(j.minAmountOut),
    executorTip: BigInt(j.executorTip),
    nonce: BigInt(j.nonce),
  };
}

/** Convert a runtime Quote to the JSON transport shape. */
export function quoteToJson(q: Quote): QuoteJson {
  return {
    counterparty: q.counterparty,
    deadline: q.deadline.toString(),
    commitmentHash: q.commitmentHash,
    maxIn: q.maxIn.toString(),
    amountOut: q.amountOut.toString(),
    nonce: q.nonce.toString(),
  };
}

/** Convert a JSON Quote back to runtime types. */
export function quoteFromJson(j: QuoteJson): Quote {
  return {
    counterparty: j.counterparty as Address,
    deadline: BigInt(j.deadline),
    commitmentHash: j.commitmentHash as Hex,
    maxIn: BigInt(j.maxIn),
    amountOut: BigInt(j.amountOut),
    nonce: BigInt(j.nonce),
  };
}
