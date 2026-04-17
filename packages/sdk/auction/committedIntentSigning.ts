/**
 * Committed-Intent signing / verification / calldata helpers.
 *
 * Public API surface per spec 0.1 §3.3 + spec 0.3 §5 Fase 2.1:
 *
 *   - `buildCommitmentTypedData`, `buildQuoteTypedData`
 *   - `hashCommitment` (= `computeCommitmentHash`), `hashQuote` (= `computeQuoteHash`)
 *   - `signCommitment`, `signQuote`
 *   - `verifyCommitmentSignature`, `verifyQuoteSignature`
 *   - `encodeCommitCalldata`, `encodeExecuteCalldata`, `encodeExpireCalldata`
 *   - `pickBestPriceFirst` — sort quotes by implicit price, contract-matching.
 *
 * Verification walks through the shared `session/eip712Verify.ts` helper
 * (D-1): ECDSA first, ERC-1271 fallback if a `publicClient` is supplied.
 * Smart-account derivation (off-chain only) is optional for relayer use.
 */

import {
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import type { Pick } from '../types/escrow';
import type { Commitment, Quote } from '../types/committedIntent';
import {
  buildCommitmentDomain,
  computeCommitmentHash,
  computeQuoteHash,
  COMMITMENT_EIP712_TYPES,
  COMMITMENT_TYPE_STRING,
  QUOTE_EIP712_TYPES,
  QUOTE_TYPE_STRING,
} from './committedIntentEncoding';
import {
  verifyEip712Signature,
  type Eip712TypedData,
} from '../session/eip712Verify';
import { committedIntentExecutorAbi } from '../abis/CommittedIntentExecutor';

// ============================================================================
// Re-exports — stable public identifiers
// ============================================================================

export {
  COMMITMENT_EIP712_TYPES as COMMITMENT_TYPES,
  QUOTE_EIP712_TYPES as QUOTE_TYPES,
  COMMITMENT_TYPE_STRING,
  QUOTE_TYPE_STRING,
};

// ============================================================================
// Typed data builders
// ============================================================================

/** Signer callback — same shape as `auction/initiate.ts#signIntent`. */
export type Eip712SignerFn = (typedData: Eip712TypedData) => Promise<Hex>;

/** Build the `Commitment` typed data that a predictor signs. */
export function buildCommitmentTypedData(
  c: Commitment,
  exec: Address,
  chainId: number
): Eip712TypedData {
  return {
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
  };
}

/** Build the `Quote` typed data that a counterparty signs. */
export function buildQuoteTypedData(
  q: Quote,
  exec: Address,
  chainId: number
): Eip712TypedData {
  return {
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
  };
}

// ============================================================================
// Hash helpers — exported under the spec-0.1 names AND the 0.3 aliases
// ============================================================================

/** Alias of {@link computeCommitmentHash} — matches spec 0.3 naming. */
export function hashCommitment(
  c: Commitment,
  exec: Address,
  chainId: number
): Hex {
  return computeCommitmentHash(c, exec, chainId);
}

/** Alias of {@link computeQuoteHash} — matches spec 0.3 naming. */
export function hashQuote(q: Quote, exec: Address, chainId: number): Hex {
  return computeQuoteHash(q, exec, chainId);
}

// ============================================================================
// Signing
// ============================================================================

/**
 * Sign a `Commitment` using a caller-provided signer callback.
 * Mirrors `prepareAuctionRFQ#signIntent` — caller controls the signer
 * (EOA, session key, ZeroDev kernel client, etc.).
 */
export async function signCommitment(
  signer: Eip712SignerFn,
  c: Commitment,
  exec: Address,
  chainId: number
): Promise<Hex> {
  return signer(buildCommitmentTypedData(c, exec, chainId));
}

/** Sign a `Quote` using a caller-provided signer callback. */
export async function signQuote(
  signer: Eip712SignerFn,
  q: Quote,
  exec: Address,
  chainId: number
): Promise<Hex> {
  return signer(buildQuoteTypedData(q, exec, chainId));
}

// ============================================================================
// Verification
// ============================================================================

export interface VerifyCommitmentParams {
  commitment: Commitment;
  signature: Hex;
  exec: Address;
  chainId: number;
  /** Required for ERC-1271 fallback against smart-account predictors. */
  publicClient?: PublicClient;
  /** Enable off-chain smart-account derivation branch (relayer only). */
  smartAccountDerivationEnabled?: boolean;
}

/**
 * Verify the predictor's signature on a Commitment.
 *
 * Runs ECDSA recovery first; if `publicClient` is provided, falls back
 * to `IERC1271.isValidSignature` against `commitment.predictor`.
 */
export async function verifyCommitmentSignature(
  params: VerifyCommitmentParams
): Promise<{ valid: boolean; recoveredAddress?: Address }> {
  const typedData = buildCommitmentTypedData(
    params.commitment,
    params.exec,
    params.chainId
  );
  const result = await verifyEip712Signature(
    typedData,
    params.signature,
    params.commitment.predictor,
    {
      publicClient: params.publicClient,
      smartAccountDerivationEnabled: params.smartAccountDerivationEnabled,
    }
  );
  return { valid: result.valid, recoveredAddress: result.recoveredAddress };
}

export interface VerifyQuoteParams {
  quote: Quote;
  signature: Hex;
  exec: Address;
  chainId: number;
  publicClient?: PublicClient;
  smartAccountDerivationEnabled?: boolean;
}

/** Verify the counterparty's signature on a Quote. */
export async function verifyQuoteSignature(
  params: VerifyQuoteParams
): Promise<{ valid: boolean; recoveredAddress?: Address }> {
  const typedData = buildQuoteTypedData(
    params.quote,
    params.exec,
    params.chainId
  );
  const result = await verifyEip712Signature(
    typedData,
    params.signature,
    params.quote.counterparty,
    {
      publicClient: params.publicClient,
      smartAccountDerivationEnabled: params.smartAccountDerivationEnabled,
    }
  );
  return { valid: result.valid, recoveredAddress: result.recoveredAddress };
}

// ============================================================================
// Calldata encoders
// ============================================================================

/**
 * Encode `CommittedIntentExecutor.commit(c, predictorSig)`.
 *
 * Called by the predictor in a separate tx after signing the Commitment
 * to trigger the sponsor-first + wallet pull into `PreMintEscrow`
 * (decision A-4).
 */
export function encodeCommitCalldata(c: Commitment, predictorSig: Hex): Hex {
  return encodeFunctionData({
    abi: committedIntentExecutorAbi,
    functionName: 'commit',
    args: [commitmentToAbiTuple(c), predictorSig],
  });
}

export interface EncodeExecuteParams {
  c: Commitment;
  predictorSig: Hex;
  picks: Pick[];
  quotes: Quote[];
  counterpartySigs: Hex[];
  /** `address(0)` → `msg.sender` on-chain. */
  tipRecipient: Address;
}

/**
 * Encode `CommittedIntentExecutor.execute(c, predictorSig, picks, quotes, counterpartySigs, tipRecipient)`.
 *
 * Flat calldata per §1.3 canonical. Callers MUST pre-sort `quotes`
 * best-price-first (see {@link pickBestPriceFirst}); the contract
 * verifies monotonicity with a cross-multiply check and reverts otherwise.
 */
export function encodeExecuteCalldata(params: EncodeExecuteParams): Hex {
  return encodeFunctionData({
    abi: committedIntentExecutorAbi,
    functionName: 'execute',
    args: [
      commitmentToAbiTuple(params.c),
      params.predictorSig,
      params.picks.map(pickToAbiTuple),
      params.quotes.map(quoteToAbiTuple),
      params.counterpartySigs,
      params.tipRecipient,
    ],
  });
}

/**
 * Encode `CommittedIntentExecutor.expire(c, predictorSig)`.
 *
 * Callable by anyone after `c.deadline`. Releases the predictor's escrow
 * back to wallet credit + sponsor pool per §4.3.1.
 */
export function encodeExpireCalldata(c: Commitment, predictorSig: Hex): Hex {
  return encodeFunctionData({
    abi: committedIntentExecutorAbi,
    functionName: 'expire',
    args: [commitmentToAbiTuple(c), predictorSig],
  });
}

// ============================================================================
// Best-price-first ordering (matches contract's monotonicity check)
// ============================================================================

/**
 * Sort quotes best-price-first by implicit price `amountOut / maxIn`.
 *
 * The comparator uses a cross-multiply (`a.amountOut * b.maxIn` vs
 * `b.amountOut * a.maxIn`) to avoid division and match the on-chain
 * monotonicity check byte-for-byte:
 *
 *     require(quotes[i-1].amountOut * q.maxIn >= q.amountOut * quotes[i-1].maxIn)
 *
 * Used by the commitment-executor keeper (Fase 5) and the relayer when
 * they assemble the executor-sorted quote array.
 *
 * Stable w.r.t. ties. Does not mutate the input.
 */
export function pickBestPriceFirst(quotes: Quote[]): Quote[] {
  return [...quotes].sort((a, b) => {
    // We want descending implicit price (amountOut / maxIn): the better
    // quote (higher amountOut per unit maxIn) comes first.
    //
    // a before b ⇔ a.amountOut / a.maxIn > b.amountOut / b.maxIn
    //           ⇔ a.amountOut * b.maxIn > b.amountOut * a.maxIn
    const left = a.amountOut * b.maxIn;
    const right = b.amountOut * a.maxIn;
    if (left > right) return -1;
    if (left < right) return 1;
    return 0;
  });
}

// ============================================================================
// Internal — struct → ABI tuple adapters
// ============================================================================

function commitmentToAbiTuple(c: Commitment) {
  return {
    predictor: c.predictor,
    predictorWindowEnd: c.predictorWindowEnd,
    deadline: c.deadline,
    pickConfigId: c.pickConfigId,
    amountIn: c.amountIn,
    minFillIn: c.minFillIn,
    minAmountOut: c.minAmountOut,
    executorTip: c.executorTip,
    nonce: c.nonce,
  };
}

function quoteToAbiTuple(q: Quote) {
  return {
    counterparty: q.counterparty,
    deadline: q.deadline,
    commitmentHash: q.commitmentHash,
    maxIn: q.maxIn,
    amountOut: q.amountOut,
    nonce: q.nonce,
  };
}

function pickToAbiTuple(p: Pick) {
  return {
    conditionResolver: p.conditionResolver,
    conditionId: p.conditionId,
    predictedOutcome: p.predictedOutcome,
  };
}
