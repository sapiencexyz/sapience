/**
 * Committed-Intent WebSocket wire protocol.
 *
 * Canonical reference: `prd-001-spec-0.1-canonical.md` §4.
 *
 * All payloads use the JSON transport types from
 * `types/committedIntent.ts` — bigints are decimal strings, no
 * in-process bigint leaks through JSON.stringify.
 */

import type {
  CommitmentJson,
  QuoteJson,
  QuoteCancelJson,
  SignedCommitmentJson,
  SignedQuoteJson,
} from '../types/committedIntent';
import type { PickJson } from '../types/escrow';

// ============================================================================
// Client → Server messages (§4.1)
// ============================================================================

/** Wire envelope for `quote.cancel` (invalidate all quotes with `nonce < minNonce`). */
export type QuoteCancelPayload = QuoteCancelJson;

/** Wire envelope for subscribing to a commitment's quote stream. */
export interface CommitmentSubscribePayload {
  commitmentHash: string;
}

/** Discriminated union of messages the client may send to the relayer. */
export type CommittedIntentClientMessage =
  | { type: 'commitment.submit'; payload: SignedCommitmentJson }
  | { type: 'commitment.subscribe'; payload: CommitmentSubscribePayload }
  | { type: 'commitment.unsubscribe'; payload: CommitmentSubscribePayload }
  | { type: 'quote.submit'; payload: SignedQuoteJson }
  | { type: 'quote.cancel'; payload: QuoteCancelPayload };

// ============================================================================
// Server → Client broadcast payloads (§4.2)
// ============================================================================

/**
 * Broadcast when a new commitment lands at the relayer.
 * Mirrors `SignedCommitmentJson` + the relayer's `createdAt` stamp.
 */
export interface CommitmentBroadcast {
  commitment: CommitmentJson;
  signature: string;
  predictorSponsor?: string;
  predictorSponsorData?: string;
  chainId: number;
  executorContract: string;
  /** ISO timestamp when the relayer accepted the commitment. */
  createdAt: string;
  /** Canonical hash (see `computeCommitmentHash`). Convenience for subscribers. */
  commitmentHash: string;
  /** Canonical picks array — needed by executor.execute() calldata and pricing engines. */
  picks: PickJson[];
}

/** Broadcast when a new signed quote arrives. */
export interface QuoteBroadcast {
  quote: QuoteJson;
  signature: string;
  /** ISO timestamp when the relayer accepted the quote. */
  receivedAt: string;
  /** Canonical hash (see `computeQuoteHash`). Convenience for subscribers. */
  quoteHash: string;
}

/** Per-slice record inside an ExecutionBroadcast. */
export interface ExecutionSliceBroadcast {
  quoteHash: string;
  counterparty: string;
  /** Filled-in for this slice (decimal string, 18d). */
  sliceIn: string;
  /** Filled-out for this slice. */
  sliceOut: string;
  /** Make-whole + pool-draw carried into this slice's mint. */
  sliceBonusCollateral: string;
  /** Resulting `predictionId` (bytes32). */
  predictionId: string;
}

/** Broadcast after a successful or slash-only `execute()` tx. */
export interface ExecutionBroadcast {
  commitmentHash: string;
  /** Address that called `execute` (predictor in T₁, anyone in T₂). */
  caller: string;
  /** Aggregate filled-in. 0 under slash-only-stay-alive outcome. */
  filledIn: string;
  /** Aggregate filled-out. */
  filledOut: string;
  /** Unfilled portion refunded to escrow. */
  refundedIn: string;
  /** Tip actually paid (0 when `caller == predictor`). */
  tipPaid: string;
  slices: ExecutionSliceBroadcast[];
  txHash: string;
}

/** Broadcast after a counterparty total-slash event (case 1 or case 2). */
export interface SlashBroadcast {
  commitmentHash: string;
  counterparty: string;
  /** Entire vault balance taken at slash time. */
  vaultDrained: string;
  /** Portion earmarked to top up the fallback slice's mint. */
  makeWhole: string;
  /** Portion drawn from the InsurancePool to close the delta gap. */
  poolContribution: string;
  /** Excess over delta deposited into the InsurancePool. */
  poolReceived: string;
  txHash: string;
}

/** Broadcast when `expire()` runs and releases the escrow. */
export interface CommitmentExpiredBroadcast {
  commitmentHash: string;
  txHash: string;
}

/** Ack payload for client-initiated messages. */
export interface CommitmentAckPayload {
  commitmentHash?: string;
  error?: string;
  id?: string;
}

/** Ack payload specific to `quote.submit`. */
export interface QuoteAckPayload {
  quoteHash?: string;
  error?: string;
  id?: string;
}

/** Discriminated union of messages the relayer may send to the client. */
export type CommittedIntentServerMessage =
  | { type: 'commitment.created'; payload: CommitmentBroadcast }
  | { type: 'commitment.quote'; payload: QuoteBroadcast }
  | { type: 'commitment.executed'; payload: ExecutionBroadcast }
  | { type: 'commitment.expired'; payload: CommitmentExpiredBroadcast }
  | { type: 'commitment.slashed'; payload: SlashBroadcast }
  | { type: 'commitment.ack'; payload: CommitmentAckPayload }
  | { type: 'quote.ack'; payload: QuoteAckPayload };
