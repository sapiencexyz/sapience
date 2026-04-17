/**
 * Committed Intent Exposure Tracker
 *
 * Per-counterparty live exposure accumulator used by the relayer quality
 * gate (PRD-001 §4.4: "off-chain enforcement"). This module is pure —
 * it doesn't read config directly or the registry; callers pass the
 * relevant parameters so the logic is trivially testable.
 *
 * Exposure = Σ `amountOut` of signed, unexpired, unconsumed quotes from
 * this counterparty. The relayer increments on accept, decrements on
 * cancel / expiry / consumption.
 *
 * Gate rule (`checkAcceptance`):
 *   totalExposureAfter = getExposure(cp) + quote.amountOut
 *   require(totalExposureAfter <= vaultBalance * leverageFactor / 1e4)
 *   require(vaultBalance     >= totalExposureAfter * minInsuranceRate / 1e4)
 */

import type { Quote } from '@sapience/sdk/types/committedIntent';
import { committedIntentExposure } from './metrics';

// quoteHash → amountOut at time of acceptance (so removal is exact even if
// the original quote object is no longer around).
const quoteAmountByHash = new Map<string, bigint>();
const quoteCpByHash = new Map<string, string>();

// cp (lowercase) → running Σ amountOut.
const exposureByCp = new Map<string, bigint>();

function key(addr: string): string {
  return addr.toLowerCase();
}

function truncateForLabel(addr: string): string {
  return addr.slice(0, 10).toLowerCase();
}

function setGauge(cp: string, value: bigint): void {
  // prom-client only accepts numeric values; clamp at Number.MAX_SAFE_INTEGER.
  const num =
    value >= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number.MAX_SAFE_INTEGER
      : Number(value);
  try {
    committedIntentExposure.set({ counterparty: truncateForLabel(cp) }, num);
  } catch {
    /* metrics never crash the hot path */
  }
}

/**
 * Record a new live quote's `amountOut` toward the counterparty's exposure.
 * Idempotent by quoteHash — re-adding the same hash is a no-op.
 */
export function addQuote(quote: Quote, quoteHash: string): void {
  if (quoteAmountByHash.has(quoteHash)) return;
  const cp = key(quote.counterparty);
  quoteAmountByHash.set(quoteHash, quote.amountOut);
  quoteCpByHash.set(quoteHash, cp);
  const prev = exposureByCp.get(cp) ?? 0n;
  const next = prev + quote.amountOut;
  exposureByCp.set(cp, next);
  setGauge(cp, next);
}

/**
 * Release the quote's contribution to live exposure. Returns the amount that
 * was removed (0 if the quoteHash was not tracked).
 */
export function removeQuote(quoteHash: string): bigint {
  const amt = quoteAmountByHash.get(quoteHash);
  if (amt === undefined) return 0n;
  const cp = quoteCpByHash.get(quoteHash);
  quoteAmountByHash.delete(quoteHash);
  quoteCpByHash.delete(quoteHash);
  if (!cp) return amt;
  const prev = exposureByCp.get(cp) ?? 0n;
  const next = prev - amt < 0n ? 0n : prev - amt;
  if (next === 0n) {
    exposureByCp.delete(cp);
  } else {
    exposureByCp.set(cp, next);
  }
  setGauge(cp, next);
  return amt;
}

/** Current Σ amountOut of live quotes from `cp`. */
export function getExposure(cp: string): bigint {
  return exposureByCp.get(key(cp)) ?? 0n;
}

export interface AcceptanceCheckInput {
  cp: string;
  vaultBalance: bigint;
  /** The candidate quote we are deciding whether to accept. */
  quote: Quote;
  /** Leverage factor in basis points (10_000 = 1x). */
  leverageFactorBps: number;
  /** Minimum insurance rate in basis points (1000 = 10%). */
  minInsuranceRateBps: number;
}

export interface AcceptanceCheckResult {
  ok: boolean;
  reason?: string;
  totalExposureAfter: bigint;
}

/**
 * Decide whether a new quote should be accepted without pushing the
 * counterparty past their on-chain solvency rails.
 *
 * Numerically strict: does not depend on floating point or division; both
 * checks multiply through to compare bigints.
 */
export function checkAcceptance(
  input: AcceptanceCheckInput
): AcceptanceCheckResult {
  const { cp, vaultBalance, quote, leverageFactorBps, minInsuranceRateBps } =
    input;

  const current = getExposure(cp);
  const totalExposureAfter = current + quote.amountOut;

  if (leverageFactorBps <= 0) {
    return {
      ok: false,
      reason: 'leverage_factor_non_positive',
      totalExposureAfter,
    };
  }

  // Leverage rail: totalExposureAfter * 10_000 <= vaultBalance * leverageFactorBps
  const lhs = totalExposureAfter * 10_000n;
  const rhs = vaultBalance * BigInt(leverageFactorBps);
  if (lhs > rhs) {
    return {
      ok: false,
      reason: 'exposure_exceeds_leverage',
      totalExposureAfter,
    };
  }

  // Insurance rail: vaultBalance * 10_000 >= totalExposureAfter * minInsuranceRateBps
  const lhs2 = vaultBalance * 10_000n;
  const rhs2 = totalExposureAfter * BigInt(minInsuranceRateBps);
  if (lhs2 < rhs2) {
    return {
      ok: false,
      reason: 'insurance_rate_below_minimum',
      totalExposureAfter,
    };
  }

  return { ok: true, totalExposureAfter };
}

/** Test-only: wipe all counterparty exposure state. */
export function _clearExposureForTesting(): void {
  quoteAmountByHash.clear();
  quoteCpByHash.clear();
  exposureByCp.clear();
}
