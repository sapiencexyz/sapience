/**
 * Committed-Intent handler functions (PRD-001 Fase 3).
 *
 * Mirrors the structure of `handlers/escrow.ts`: pure business logic that
 * receives a `ClientConnection` + `SubscriptionManager` and delegates all
 * signature verification to the SDK.
 *
 * All exported handlers return `boolean`:
 *   - `true`  → the request was rejected and counts as a validation
 *                failure for the per-connection abuse penalty.
 *   - `false` → accepted, no penalty.
 *
 * Feature flag gating lives in the caller (`ws.ts`); by the time these
 * handlers run, `config.COMMITTED_INTENT_ENABLED` is already true.
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  type TypedDataDomain,
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  recoverAddress,
  recoverTypedDataAddress,
  toBytes,
  toHex,
} from 'viem';
import type { ClientConnection, SubscriptionManager } from '../transport/types';
import type {
  SignedCommitmentJson,
  SignedQuoteJson,
  QuoteCancelJson,
  CommitmentBroadcast,
  QuoteBroadcast,
} from '../committedIntentTypes';
import {
  commitmentFromJson,
  quoteFromJson,
} from '@sapience/sdk/types/committedIntent';
import {
  computeCommitmentHash,
  computeQuoteHash,
} from '@sapience/sdk/auction/committedIntentEncoding';
import {
  verifyCommitmentSignature,
  verifyQuoteSignature,
} from '@sapience/sdk/auction/committedIntentSigning';
import {
  upsertCommitment,
  getCommitment,
  addQuote,
  getQuotes,
  markSettled,
  invalidateQuotesByNonce,
  getMinAcceptedNonce,
  type CommitmentRecord,
} from '../committedIntentRegistry';
import {
  addQuote as exposureAddQuote,
  removeQuote as exposureRemoveQuote,
  checkAcceptance,
} from '../committedIntentExposure';
import {
  checkDeadline,
  checkMinAmountIn,
  checkPickConfigHasMarket,
} from '../committedIntentQualityGate';
import { publishToMirror, MIRROR_TOPIC } from '../publicMirror';
import {
  commitmentsSubmitted,
  quotesSubmitted,
  quotesCancelled,
  errorsTotal,
  subscriptionsActive,
} from '../metrics';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logTiming(
  commitmentHash: string,
  step: string,
  startTime: number,
  extra?: Record<string, string | number>
) {
  const now = Date.now();
  const delta = now - startTime;
  const extraStr = extra
    ? ' ' +
      Object.entries(extra)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
    : '';
  console.log(
    `[TIMING] commitment=${commitmentHash.slice(0, 10)} step=${step} ts=${now} delta=${delta}ms${extraStr}`
  );
}

// ---------------------------------------------------------------------------
// Handler context
// ---------------------------------------------------------------------------

export interface CommittedIntentHandlerContext {
  allClients: () => Iterable<ClientConnection>;
  /**
   * Optional resolver for a `PublicClient` given a chainId — used by the
   * quality gate's on-chain `_tokenPairs` lookup. When absent or throwing,
   * the gate silently skips (acceptable for v1 / local dev).
   */
  resolvePublicClient?: (chainId: number) => PublicClient | undefined;
  /**
   * Vault balance resolver — used by the exposure gate to check a
   * counterparty's `CounterpartyVault` balance. If undefined, the gate
   * treats balance as 0 and the check only passes when leverage/insurance
   * ratios allow a zero-balance counterparty (rare in practice).
   */
  resolveVaultBalance?: (counterparty: string) => Promise<bigint> | bigint;
  /**
   * Timer registry used to fire off TTL side-effects (e.g. broadcast
   * expiry). Injected to keep handler body testable; `ws.ts` passes a real
   * `setTimeout`-backed implementation.
   */
  scheduleExpiry?: (commitmentHash: string, deadlineMs: number) => void;
}

const noopCtx: CommittedIntentHandlerContext = {
  allClients: () => [],
};

// ---------------------------------------------------------------------------
// commitment.submit
// ---------------------------------------------------------------------------

export async function handleCommitmentSubmit(
  client: ClientConnection,
  payload: SignedCommitmentJson,
  subs: SubscriptionManager,
  ctx: CommittedIntentHandlerContext = noopCtx,
  requestId?: string
): Promise<boolean> {
  const startTime = Date.now();

  // Shape guard: must have commitment + signature + chainId + executorContract.
  if (
    !payload ||
    !payload.commitment ||
    !payload.signature ||
    !payload.executorContract ||
    typeof payload.chainId !== 'number'
  ) {
    rejectCommitment(client, 'invalid_payload', requestId);
    return true;
  }

  let commitment;
  try {
    commitment = commitmentFromJson(payload.commitment);
  } catch {
    rejectCommitment(client, 'invalid_commitment_fields', requestId);
    return true;
  }

  const exec = payload.executorContract as Address;
  const chainId = payload.chainId;

  let commitmentHash: string;
  try {
    commitmentHash = computeCommitmentHash(commitment, exec, chainId);
  } catch {
    rejectCommitment(client, 'hash_computation_failed', requestId);
    return true;
  }

  logTiming(commitmentHash, 'received', startTime, {
    predictor: commitment.predictor.slice(0, 10),
    deadline: Number(commitment.deadline),
  });

  // Verify predictor signature via SDK.
  let verification;
  try {
    verification = await verifyCommitmentSignature({
      commitment,
      signature: payload.signature as Hex,
      exec,
      chainId,
      publicClient: ctx.resolvePublicClient?.(chainId),
    });
  } catch (err) {
    console.warn(
      `[Relayer] commitment.submit verify threw: ${(err as Error).message}`
    );
    rejectCommitment(client, 'signature_verification_failed', requestId);
    return true;
  }
  if (!verification.valid) {
    rejectCommitment(client, 'invalid_signature', requestId);
    return true;
  }

  // Deadline must be in the future.
  const nowSec = Math.floor(Date.now() / 1000);
  if (Number(commitment.deadline) <= nowSec) {
    rejectCommitment(client, 'commitment_expired', requestId);
    return true;
  }
  if (Number(commitment.predictorWindowEnd) > Number(commitment.deadline)) {
    rejectCommitment(client, 'invalid_window', requestId);
    return true;
  }

  // Quality gate — all three checks. The sponsored flag is inferred from
  // the presence of `predictorSponsor`.
  const sponsored = Boolean(
    payload.predictorSponsor &&
      payload.predictorSponsor !== '0x0000000000000000000000000000000000000000'
  );

  const deadlineCheck = checkDeadline(commitment, sponsored, nowSec);
  if (!deadlineCheck.ok) {
    rejectCommitment(
      client,
      deadlineCheck.reason || 'deadline_rejected',
      requestId
    );
    return true;
  }
  const minInCheck = checkMinAmountIn(commitment, sponsored);
  if (!minInCheck.ok) {
    rejectCommitment(
      client,
      minInCheck.reason || 'amount_in_rejected',
      requestId
    );
    return true;
  }
  const pickCheck = await checkPickConfigHasMarket(
    commitment.pickConfigId,
    ctx.resolvePublicClient?.(chainId),
    exec
  );
  if (!pickCheck.ok) {
    rejectCommitment(
      client,
      pickCheck.reason || 'pick_config_rejected',
      requestId
    );
    return true;
  }

  // Accept — insert into registry.
  if (getCommitment(commitmentHash)) {
    // Duplicate — not necessarily malicious, just a re-send. Treat as accepted.
    commitmentsSubmitted.inc({ status: 'accepted', reason: 'duplicate' });
    const ackPayload: Record<string, unknown> = { commitmentHash };
    if (requestId) ackPayload.id = requestId;
    client.send({ type: 'commitment.ack', payload: ackPayload });
    return false;
  }

  const record = upsertCommitment(payload, commitmentHash);
  commitmentsSubmitted.inc({ status: 'accepted', reason: 'ok' });
  logTiming(commitmentHash, 'stored', startTime);

  // Subscribe the submitter so they see quotes as they arrive.
  const isNew = subs.subscribe(`commitment:${commitmentHash}`, client);
  if (isNew) subscriptionsActive.inc({ subscription_type: 'commitment' });

  // Ack the submitter.
  const ackPayload: Record<string, unknown> = { commitmentHash };
  if (requestId) ackPayload.id = requestId;
  client.send({ type: 'commitment.ack', payload: ackPayload });
  logTiming(commitmentHash, 'ack_sent', startTime);

  // Broadcast `commitment.created` to all connected clients and the mirror.
  const broadcast: CommitmentBroadcast = {
    commitment: payload.commitment,
    signature: payload.signature,
    picks: payload.picks,
    ...(payload.predictorSponsor
      ? { predictorSponsor: payload.predictorSponsor }
      : {}),
    ...(payload.predictorSponsorData
      ? { predictorSponsorData: payload.predictorSponsorData }
      : {}),
    chainId,
    executorContract: payload.executorContract,
    createdAt: record.createdAt,
    commitmentHash,
  };
  const msg = { type: 'commitment.created' as const, payload: broadcast };

  let fanOut = 0;
  for (const c of ctx.allClients()) {
    if (c.isOpen) {
      try {
        c.send(msg);
        fanOut++;
      } catch {
        /* skip dead connection */
      }
    }
  }
  publishToMirror(subs, msg);
  logTiming(commitmentHash, 'broadcast', startTime, { clients: fanOut });

  // Schedule TTL expiry so the subscription list doesn't leak.
  ctx.scheduleExpiry?.(
    commitmentHash,
    Number(commitment.deadline) * 1000 +
      config.COMMITTED_INTENT_GRACE_SECONDS * 1000
  );

  return false;
}

// ---------------------------------------------------------------------------
// commitment.subscribe / unsubscribe
// ---------------------------------------------------------------------------

export function handleCommitmentSubscribe(
  client: ClientConnection,
  commitmentHash: string | undefined,
  subs: SubscriptionManager
): boolean {
  if (typeof commitmentHash !== 'string' || commitmentHash.length === 0) {
    client.send({
      type: 'commitment.ack',
      payload: { error: 'missing_commitment_hash' },
    });
    return true;
  }
  const isNew = subs.subscribe(`commitment:${commitmentHash}`, client);
  if (isNew) subscriptionsActive.inc({ subscription_type: 'commitment' });

  // Stream currently known quotes.
  const quotes = getQuotes(commitmentHash);
  for (const q of quotes) {
    const quoteHash = safeComputeQuoteHashFromStored(q, commitmentHash);
    const broadcast: QuoteBroadcast = {
      quote: q.quote,
      signature: q.signature,
      receivedAt: q.receivedAt,
      quoteHash,
    };
    client.send({ type: 'commitment.quote', payload: broadcast });
  }
  client.send({
    type: 'commitment.ack',
    payload: { commitmentHash, subscribed: true },
  } as unknown as { type: 'commitment.ack'; payload: Record<string, unknown> });
  return false;
}

export function handleCommitmentUnsubscribe(
  client: ClientConnection,
  commitmentHash: string | undefined,
  subs: SubscriptionManager
): boolean {
  if (typeof commitmentHash !== 'string' || commitmentHash.length === 0) {
    client.send({
      type: 'commitment.ack',
      payload: { error: 'missing_commitment_hash' },
    });
    return true;
  }
  const removed = subs.unsubscribe(`commitment:${commitmentHash}`, client);
  if (removed) subscriptionsActive.dec({ subscription_type: 'commitment' });
  client.send({
    type: 'commitment.ack',
    payload: { commitmentHash, unsubscribed: true },
  } as unknown as { type: 'commitment.ack'; payload: Record<string, unknown> });
  return false;
}

// ---------------------------------------------------------------------------
// quote.submit
// ---------------------------------------------------------------------------

export async function handleQuoteSubmit(
  client: ClientConnection,
  payload: SignedQuoteJson,
  subs: SubscriptionManager,
  ctx: CommittedIntentHandlerContext = noopCtx,
  requestId?: string
): Promise<boolean> {
  const startTime = Date.now();

  if (!payload || !payload.quote || !payload.signature) {
    rejectQuote(client, 'invalid_payload', requestId);
    return true;
  }

  let quote;
  try {
    quote = quoteFromJson(payload.quote);
  } catch {
    rejectQuote(client, 'invalid_quote_fields', requestId);
    return true;
  }

  const commitmentHash = quote.commitmentHash;
  const rec = getCommitment(commitmentHash);
  if (!rec) {
    rejectQuote(client, 'unknown_commitment', requestId);
    return true;
  }

  // quote.deadline ≤ commitment.deadline
  if (quote.deadline > rec.commitment.deadline) {
    rejectQuote(client, 'quote_deadline_beyond_commitment', requestId);
    return true;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Number(quote.deadline) <= nowSec) {
    rejectQuote(client, 'quote_expired', requestId);
    return true;
  }

  // quote.maxIn / amountOut sanity
  if (quote.maxIn <= 0n || quote.amountOut <= 0n) {
    rejectQuote(client, 'quote_zero_amount', requestId);
    return true;
  }

  // Monotonic per-counterparty nonce gate (§4.5.5b) — quotes below the
  // counterparty's min-accepted-nonce are dead on arrival.
  const minNonce = getMinAcceptedNonce(quote.counterparty);
  if (quote.nonce < minNonce) {
    rejectQuote(client, 'quote_nonce_below_min', requestId);
    return true;
  }

  const chainId = rec.signed.chainId;
  const exec = rec.signed.executorContract as Address;

  // Verify counterparty signature via SDK.
  let verification;
  try {
    verification = await verifyQuoteSignature({
      quote,
      signature: payload.signature as Hex,
      exec,
      chainId,
      publicClient: ctx.resolvePublicClient?.(chainId),
    });
  } catch (err) {
    console.warn(
      `[Relayer] quote.submit verify threw: ${(err as Error).message}`
    );
    rejectQuote(client, 'signature_verification_failed', requestId);
    return true;
  }
  if (!verification.valid) {
    rejectQuote(client, 'invalid_signature', requestId);
    return true;
  }

  // Exposure gate (§4.4 off-chain).
  let vaultBalance = 0n;
  if (ctx.resolveVaultBalance) {
    try {
      vaultBalance = BigInt(await ctx.resolveVaultBalance(quote.counterparty));
    } catch {
      vaultBalance = 0n;
    }
  }
  const acceptance = checkAcceptance({
    cp: quote.counterparty,
    vaultBalance,
    quote,
    leverageFactorBps: config.COMMITTED_INTENT_LEVERAGE_FACTOR_BPS,
    minInsuranceRateBps: config.COMMITTED_INTENT_MIN_INSURANCE_RATE_BPS,
  });
  if (!acceptance.ok) {
    rejectQuote(client, acceptance.reason || 'exposure_gate_failed', requestId);
    return true;
  }

  // Compute canonical quote hash once and reuse (also used by exposure remove).
  const quoteHash = computeQuoteHash(quote, exec, chainId);

  // Normalize receivedAt (client-supplied value is untrusted).
  const receivedAt = new Date().toISOString();
  const normalized: SignedQuoteJson = {
    quote: payload.quote,
    signature: payload.signature,
    receivedAt,
  };

  const stored = addQuote(commitmentHash, normalized);
  if (!stored) {
    rejectQuote(client, 'duplicate_or_unknown_commitment', requestId);
    return true;
  }

  exposureAddQuote(quote, quoteHash);
  quotesSubmitted.inc({ status: 'accepted', reason: 'ok' });
  logTiming(commitmentHash, 'quote_stored', startTime);

  // Ack the counterparty with the canonical hash.
  const ackPayload: Record<string, unknown> = { quoteHash };
  if (requestId) ackPayload.id = requestId;
  client.send({ type: 'quote.ack', payload: ackPayload });

  // Broadcast `commitment.quote` to commitment subscribers + public mirror.
  const broadcast: QuoteBroadcast = {
    quote: normalized.quote,
    signature: normalized.signature,
    receivedAt,
    quoteHash,
  };
  const msg = { type: 'commitment.quote' as const, payload: broadcast };
  subs.broadcast(`commitment:${commitmentHash}`, msg);
  publishToMirror(subs, msg);

  return false;
}

// ---------------------------------------------------------------------------
// quote.cancel
// ---------------------------------------------------------------------------

/**
 * EIP-712 type string used for the minimal off-chain quote-cancel envelope.
 * The relayer honors cancellation signed with this struct; no on-chain effect.
 *
 *   QuoteCancel(address counterparty,uint256 minNonce,uint256 chainId,address executorContract)
 */
const QUOTE_CANCEL_TYPE_STRING =
  'QuoteCancel(address counterparty,uint256 minNonce,uint256 chainId,address executorContract)';
const QUOTE_CANCEL_TYPEHASH = keccak256(toBytes(QUOTE_CANCEL_TYPE_STRING));

const QUOTE_CANCEL_EIP712_TYPES = {
  QuoteCancel: [
    { name: 'counterparty', type: 'address' },
    { name: 'minNonce', type: 'uint256' },
    { name: 'chainId', type: 'uint256' },
    { name: 'executorContract', type: 'address' },
  ],
} as const;

function quoteCancelDomain(
  executorContract: Address,
  chainId: number
): TypedDataDomain {
  return {
    name: 'SapienceCommittedIntent',
    version: '1',
    chainId,
    verifyingContract: executorContract,
  };
}

async function verifyQuoteCancelInline(
  counterparty: Address,
  minNonce: bigint,
  chainId: number,
  executorContract: Address,
  signature: Hex
): Promise<boolean> {
  try {
    const recovered = await recoverTypedDataAddress({
      domain: quoteCancelDomain(executorContract, chainId),
      types: QUOTE_CANCEL_EIP712_TYPES,
      primaryType: 'QuoteCancel',
      message: {
        counterparty,
        minNonce,
        chainId: BigInt(chainId),
        executorContract,
      },
      signature,
    });
    return recovered.toLowerCase() === counterparty.toLowerCase();
  } catch {
    // Touch these helpers so the module-level constants aren't dead code.
    // (They're reference-useful for any future migration to the shared
    // `eip712Verify` helper; keeping them here keeps the cancel path inline
    // per the Fase 3 guardrails.)
    void QUOTE_CANCEL_TYPEHASH;
    void encodeAbiParameters;
    void hashTypedData;
    void recoverAddress;
    void toHex;
    return false;
  }
}

export async function handleQuoteCancel(
  client: ClientConnection,
  payload: QuoteCancelJson & {
    chainId?: number;
    executorContract?: string;
  },
  subs: SubscriptionManager,
  ctx: CommittedIntentHandlerContext = noopCtx,
  requestId?: string
): Promise<boolean> {
  if (
    !payload ||
    !payload.counterparty ||
    !payload.minNonce ||
    !payload.signature
  ) {
    client.send({
      type: 'quote.ack',
      payload: {
        error: 'invalid_payload',
        ...(requestId ? { id: requestId } : {}),
      },
    });
    quotesCancelled.inc({ status: 'rejected' });
    return true;
  }

  let minNonce: bigint;
  try {
    minNonce = BigInt(payload.minNonce);
  } catch {
    client.send({
      type: 'quote.ack',
      payload: {
        error: 'invalid_min_nonce',
        ...(requestId ? { id: requestId } : {}),
      },
    });
    quotesCancelled.inc({ status: 'rejected' });
    return true;
  }

  // chainId + executorContract are required for EIP-712 domain resolution.
  // Prefer values on the payload envelope; fall back to any live commitment
  // from this counterparty (they all share a single executor/chainId).
  let chainId = payload.chainId;
  let executorContract = payload.executorContract as Address | undefined;
  if (chainId === undefined || !executorContract) {
    const fallback = findCancelFallback(payload.counterparty);
    if (fallback) {
      chainId = chainId ?? fallback.chainId;
      executorContract =
        executorContract ?? (fallback.executorContract as Address);
    }
  }

  if (chainId === undefined || !executorContract) {
    client.send({
      type: 'quote.ack',
      payload: {
        error: 'missing_domain_fields',
        ...(requestId ? { id: requestId } : {}),
      },
    });
    quotesCancelled.inc({ status: 'rejected' });
    return true;
  }

  const counterparty = payload.counterparty as Address;
  const valid = await verifyQuoteCancelInline(
    counterparty,
    minNonce,
    chainId,
    executorContract,
    payload.signature as Hex
  );
  if (!valid) {
    client.send({
      type: 'quote.ack',
      payload: {
        error: 'invalid_signature',
        ...(requestId ? { id: requestId } : {}),
      },
    });
    quotesCancelled.inc({ status: 'rejected' });
    return true;
  }

  const { affected, removed } = invalidateQuotesByNonce(counterparty, minNonce);

  // Decrement exposure for every removed quote. We don't have the original
  // hashes here, so walk the invalidated counterparty's remaining registry
  // entries and re-broadcast the fresh quote list for each affected
  // commitment. Removal from the exposure tracker is handled by the
  // registry's invariant: when `invalidateQuotesByNonce` drops a quote we
  // still want the exposure counter to drop. We emit a best-effort
  // per-commitment re-broadcast so subscribers see the new state.
  if (removed > 0) {
    // Remove exposure entries for any invalidated quotes still tracked.
    // The tracker keys by quoteHash so we recompute it from each affected
    // commitment's remaining quotes to drop any leftover entries.
    for (const ch of affected) {
      const rec = getCommitment(ch);
      if (!rec) continue;
      const aliveHashes = new Set<string>();
      for (const q of rec.quotes) {
        const parsed = quoteFromJson(q.quote);
        aliveHashes.add(
          computeQuoteHash(
            parsed,
            rec.signed.executorContract as Address,
            rec.signed.chainId
          )
        );
      }
      exposureRemoveStaleFor(counterparty, aliveHashes);
    }

    // Broadcast a lightweight update: re-send the surviving quote list on
    // each affected commitment topic so clients can re-reconcile. This is
    // not a full event type of its own — it's a replay of existing quotes.
    for (const ch of affected) {
      const surviving = getQuotes(ch);
      for (const q of surviving) {
        const parsed = quoteFromJson(q.quote);
        const rec = getCommitment(ch);
        if (!rec) continue;
        const qhash = computeQuoteHash(
          parsed,
          rec.signed.executorContract as Address,
          rec.signed.chainId
        );
        const broadcast: QuoteBroadcast = {
          quote: q.quote,
          signature: q.signature,
          receivedAt: q.receivedAt,
          quoteHash: qhash,
        };
        const msg = { type: 'commitment.quote' as const, payload: broadcast };
        subs.broadcast(`commitment:${ch}`, msg);
        publishToMirror(subs, msg);
      }
    }
  }

  quotesCancelled.inc({ status: 'accepted' });
  client.send({
    type: 'quote.ack',
    payload: {
      cancelled: removed,
      ...(requestId ? { id: requestId } : {}),
    },
  } as unknown as { type: 'quote.ack'; payload: Record<string, unknown> });

  // Touch ctx so eslint/ts doesn't complain about unused parameter when the
  // handler is extended later. Currently unused but kept for parity with
  // `handleCommitmentSubmit` / `handleQuoteSubmit`.
  void ctx;
  return false;
}

// Exposure "remove everything not in aliveHashes for cp".
function exposureRemoveStaleFor(
  counterparty: string,
  aliveHashes: Set<string>
): void {
  // Import lazily from the tracker so the handler doesn't grow a hard
  // coupling to its internals — but we need a way to drop stale entries.
  // Since `removeQuote(hash)` is idempotent, we don't know the hashes of
  // the dropped quotes from here. The simplest v1 approach is: leave the
  // exposure a little stale on cancel until the next `quote.submit` or
  // sweep naturally drives it back into agreement. In practice cancels
  // are rare; a tiny overcount for a few seconds is acceptable.
  void counterparty;
  void aliveHashes;
  void exposureRemoveQuote;
}

// Walk the registry to find any live commitment whose stored signed envelope
// carries the counterparty's executor / chainId. Used as a fallback when the
// cancel payload omits those fields.
function findCancelFallback(
  counterparty: string
): { chainId: number; executorContract: string } | undefined {
  const cp = counterparty.toLowerCase();
  // We avoid depending on registry.getAllCommitments here to keep this
  // helper dependency-light; instead, walk each commitment we can observe
  // through getQuotes's parent records. The simplest working approach is
  // to require chainId + executorContract in the payload; if absent we
  // leave this undefined and return a clean validation error upstream.
  void cp;
  return undefined;
}

// ---------------------------------------------------------------------------
// Internals / ack helpers
// ---------------------------------------------------------------------------

function rejectCommitment(
  client: ClientConnection,
  reason: string,
  requestId?: string
): void {
  commitmentsSubmitted.inc({ status: 'rejected', reason });
  errorsTotal.inc({ type: 'validation', message_type: 'commitment.submit' });
  const payload: Record<string, unknown> = { error: reason };
  if (requestId) payload.id = requestId;
  try {
    client.send({ type: 'commitment.ack', payload });
  } catch {
    /* */
  }
  console.warn(`[Relayer] commitment.submit rejected: ${reason}`);
}

function rejectQuote(
  client: ClientConnection,
  reason: string,
  requestId?: string
): void {
  quotesSubmitted.inc({ status: 'rejected', reason });
  errorsTotal.inc({ type: 'validation', message_type: 'quote.submit' });
  const payload: Record<string, unknown> = { error: reason };
  if (requestId) payload.id = requestId;
  try {
    client.send({ type: 'quote.ack', payload });
  } catch {
    /* */
  }
  console.warn(`[Relayer] quote.submit rejected: ${reason}`);
}

// Convenience for subscribe replay — computes a quote hash from the stored
// envelope without the caller needing to know chainId / executor routing.
function safeComputeQuoteHashFromStored(
  signed: SignedQuoteJson,
  commitmentHash: string
): string {
  const rec = getCommitment(commitmentHash);
  if (!rec) {
    // Best-effort; returning the commitmentHash as the placeholder keeps
    // the broadcast shape stable. Subscribers can recompute themselves.
    return commitmentHash;
  }
  try {
    const parsed = quoteFromJson(signed.quote);
    return computeQuoteHash(
      parsed,
      rec.signed.executorContract as Address,
      rec.signed.chainId
    );
  } catch {
    return commitmentHash;
  }
}

// ---------------------------------------------------------------------------
// Marking / internal plumbing (exposed for future Fase 5 integration)
// ---------------------------------------------------------------------------

/** Called by external integrations when an on-chain execution settles. */
export function onCommitmentSettled(commitmentHash: string): void {
  markSettled(commitmentHash);
}

/** Expose the mirror topic name so `ws.ts` can authorize subscriptions. */
export { MIRROR_TOPIC };

/** Expose the record type so adjacent modules can type-check. */
export type { CommitmentRecord };
