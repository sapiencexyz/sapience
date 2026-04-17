/**
 * Quote ranking + off-chain walk simulation.
 *
 * `rankQuotes` is a thin wrapper around the SDK's `pickBestPriceFirst`
 * so the rest of the keeper uses the same canonical comparator as the
 * relayer and the on-chain contract.
 *
 * `simulateWalk` mirrors the greedy walk described in spec 0.1 §1.9 /
 * PRD §4.5.5 (Option A single-shot) but assumes every quote is fillable
 * — the keeper does NOT model the 4.4 fallback ladder here (see
 * "Ambiguities" in the README: we don't have off-chain visibility into
 * CounterpartyVault balances + wallets, so the on-chain fallback is the
 * source of truth at execution time). If a counterparty turns out to be
 * insolvent, the contract either falls back to the next quote (still a
 * successful mint) or emits a slash-only outcome (commitment stays
 * alive, no state mutation on our side).
 */

import { pickBestPriceFirst } from '@sapience/sdk/auction/committedIntentSigning';
import type { Quote, Commitment } from '@sapience/sdk/types/committedIntent';
import type { Hex } from 'viem';
import type { SignedQuoteEntry } from './state';

export interface RankedQuote {
  quote: Quote;
  signature: Hex;
  quoteHash: Hex;
  receivedAt: number;
}

export interface WalkResult {
  /** Aggregate predictor collateral consumed. */
  filledIn: bigint;
  /** Aggregate counterparty collateral supplied (sum of sliceOut). */
  aggregateOut: bigint;
  /** Quotes (in ranked order) that were actually touched by the walk. */
  usedQuotes: RankedQuote[];
  /** Per-slice sliceIn, aligned with usedQuotes. */
  sliceIns: bigint[];
  /** Per-slice sliceOut, aligned with usedQuotes. */
  sliceOuts: bigint[];
  /** Number of quotes the walk touched. */
  feasibleSliceCount: number;
  /** True when at least one sorted pair violates the contract monotonicity rule. */
  monotonicityOk: boolean;
}

/**
 * Sort quote entries best-price-first. Filters out any quotes whose
 * deadline has already passed (the contract would revert `CI_QuoteExpired`).
 */
export function rankQuotes(
  quotes: SignedQuoteEntry[],
  nowSec: bigint = BigInt(Math.floor(Date.now() / 1000))
): RankedQuote[] {
  const live = quotes.filter((q) => q.quote.deadline > nowSec);
  const sorted = pickBestPriceFirst(live.map((e) => e.quote));
  // Pair each sorted quote back with its signature via identity of the
  // `Quote` object (pickBestPriceFirst is stable and doesn't clone).
  const index = new Map<Quote, SignedQuoteEntry>();
  for (const entry of live) index.set(entry.quote, entry);
  return sorted.map((q) => {
    const entry = index.get(q);
    if (!entry) {
      // unreachable: pickBestPriceFirst returns references from input.
      throw new Error('ranker: missing signed-quote entry for sorted quote');
    }
    return {
      quote: q,
      signature: entry.signature,
      quoteHash: computeLocalQuoteHash(entry),
      receivedAt: entry.receivedAt,
    };
  });
}

/**
 * Simulate the greedy walk in §1.9 assuming every quote is fillable.
 * Integer-floor division matches Solidity `*` + `/` semantics.
 *
 * Returns monotonicityOk=false if any adjacent pair violates the
 * cross-multiply rule; the keeper surfaces this and refuses to submit
 * (the contract would revert with `CI_NonMonotonicQuotes`).
 */
export function simulateWalk(
  c: Commitment,
  ranked: RankedQuote[]
): WalkResult {
  let remaining = c.amountIn;
  let aggregateOut = 0n;
  const used: RankedQuote[] = [];
  const sliceIns: bigint[] = [];
  const sliceOuts: bigint[] = [];

  let monotonicityOk = true;
  for (let i = 1; i < ranked.length; i++) {
    const prev = ranked[i - 1].quote;
    const curr = ranked[i].quote;
    if (prev.amountOut * curr.maxIn < curr.amountOut * prev.maxIn) {
      monotonicityOk = false;
      break;
    }
  }

  for (let i = 0; i < ranked.length && remaining > 0n; i++) {
    const q = ranked[i].quote;
    if (q.maxIn === 0n || q.amountOut === 0n) continue;
    const take = q.maxIn < remaining ? q.maxIn : remaining;
    const sliceOut = (take * q.amountOut) / q.maxIn;
    used.push(ranked[i]);
    sliceIns.push(take);
    sliceOuts.push(sliceOut);
    aggregateOut += sliceOut;
    remaining -= take;
  }

  return {
    filledIn: c.amountIn - remaining,
    aggregateOut,
    usedQuotes: used,
    sliceIns,
    sliceOuts,
    feasibleSliceCount: used.length,
    monotonicityOk,
  };
}

/**
 * Best-effort local hash used for de-dup + for diagnostics. We intentionally
 * avoid importing `computeQuoteHash` here (which would require the executor
 * address / chainId to be wired into the ranker). The relayer broadcast
 * carries the canonical `quoteHash`; this helper is only invoked when
 * someone calls `rankQuotes` on entries that didn't ship a pre-computed
 * hash. We fall back to a cheap stable pseudo-hash so the result is unique
 * per quote-field identity.
 */
function computeLocalQuoteHash(entry: SignedQuoteEntry): Hex {
  const cached = (entry as SignedQuoteEntry & { _cachedHash?: Hex })._cachedHash;
  if (cached) return cached;
  const q = entry.quote;
  const src = `${q.counterparty}|${q.deadline}|${q.commitmentHash}|${q.maxIn}|${q.amountOut}|${q.nonce}`;
  let acc = 0;
  for (let i = 0; i < src.length; i++) {
    acc = (acc * 131 + src.charCodeAt(i)) >>> 0;
  }
  const h = ('0x' + acc.toString(16).padStart(64, '0')) as Hex;
  (entry as SignedQuoteEntry & { _cachedHash?: Hex })._cachedHash = h;
  return h;
}
