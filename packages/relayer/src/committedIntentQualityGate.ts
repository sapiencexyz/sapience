/**
 * Committed Intent Quality Gate
 *
 * Relayer-side filters that refuse obviously unsafe / unquotable
 * commitments before they enter the registry (PRD-001 §4.3.2).
 * All functions are pure where possible and return
 * `{ ok: boolean; reason?: string }` so the caller can stamp the
 * rejection reason onto metrics + ack payloads uniformly.
 *
 * Defaults are sourced from `config`:
 *   - `COMMITTED_INTENT_MAX_SPONSORED_DEADLINE_SECONDS` (default 60)
 *   - `COMMITTED_INTENT_MIN_SPONSORED_AMOUNT_IN`        (default 1e18)
 *
 * Feature flag gating lives in the handler, NOT here — these helpers are
 * invoked only when `COMMITTED_INTENT_ENABLED` is true.
 */

import type { Address, PublicClient } from 'viem';
import type { Commitment } from '@sapience/sdk/types/committedIntent';
import { config } from './config';

export interface GateResult {
  ok: boolean;
  reason?: string;
}

/**
 * Check 1 — deadline ceiling for sponsored commitments.
 * PRD §4.3.2: sponsored `deadline - now` must be ≤ the configured max so
 * griefing lockups are bounded.
 */
export function checkDeadline(
  commitment: Commitment,
  sponsored: boolean,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): GateResult {
  if (!sponsored) return { ok: true };
  const deadline = Number(commitment.deadline);
  if (!Number.isFinite(deadline)) {
    return { ok: false, reason: 'invalid_deadline' };
  }
  if (deadline <= nowSeconds) {
    return { ok: false, reason: 'deadline_in_past' };
  }
  const windowSeconds = deadline - nowSeconds;
  if (windowSeconds > config.COMMITTED_INTENT_MAX_SPONSORED_DEADLINE_SECONDS) {
    return { ok: false, reason: 'sponsored_deadline_too_far' };
  }
  return { ok: true };
}

/**
 * Check 2 — minimum `amountIn` for sponsored commitments.
 * Forces the predictor to put meaningful wallet collateral alongside any
 * sponsorship draw.
 */
export function checkMinAmountIn(
  commitment: Commitment,
  sponsored: boolean
): GateResult {
  if (!sponsored) return { ok: true };
  if (commitment.amountIn < config.COMMITTED_INTENT_MIN_SPONSORED_AMOUNT_IN) {
    return { ok: false, reason: 'amount_in_below_sponsored_min' };
  }
  return { ok: true };
}

/**
 * Check 3 — best-effort verification that the `pickConfigId` corresponds
 * to a known token pair in `PredictionMarketEscrow`. Missing deployment
 * information (no publicClient, no address) is treated as a warn-and-skip
 * so local / staging stacks are not blocked.
 *
 * The read is intentionally minimal — this is a spam filter, not an
 * authoritative check. If the lookup throws we log and accept.
 */
export async function checkPickConfigHasMarket(
  pickConfigId: string,
  publicClient?: PublicClient,
  escrowContract?: Address
): Promise<GateResult> {
  if (!publicClient || !escrowContract) {
    console.warn(
      '[Relayer] committed-intent quality gate: skipping pickConfig market check — missing deployment info'
    );
    return { ok: true };
  }

  try {
    const tokenPair = (await publicClient.readContract({
      address: escrowContract,
      abi: PREDICTION_MARKET_ESCROW_TOKEN_PAIRS_ABI,
      functionName: '_tokenPairs',
      args: [pickConfigId as `0x${string}`],
    })) as readonly [Address, Address] | Address;

    // `_tokenPairs(bytes32)` returns the struct/tuple; a missing entry is
    // the zero address on any of the tokens.
    if (Array.isArray(tokenPair)) {
      const [a, b] = tokenPair;
      if (
        a === '0x0000000000000000000000000000000000000000' &&
        b === '0x0000000000000000000000000000000000000000'
      ) {
        return { ok: false, reason: 'unknown_pick_config' };
      }
      return { ok: true };
    }

    if (tokenPair === '0x0000000000000000000000000000000000000000') {
      return { ok: false, reason: 'unknown_pick_config' };
    }
    return { ok: true };
  } catch (err) {
    console.warn(
      `[Relayer] committed-intent quality gate: pickConfig market read failed (${(err as Error).message}); accepting`
    );
    return { ok: true };
  }
}

/**
 * Minimal hand-rolled fragment covering the single getter the gate needs.
 * We don't import the big ABI bundle here — this keeps the gate independent
 * of the on-chain struct's concrete layout.
 */
const PREDICTION_MARKET_ESCROW_TOKEN_PAIRS_ABI = [
  {
    type: 'function',
    name: '_tokenPairs',
    stateMutability: 'view',
    inputs: [{ name: 'pickConfigId', type: 'bytes32' }],
    outputs: [
      { name: 'predictorToken', type: 'address' },
      { name: 'counterpartyToken', type: 'address' },
    ],
  },
] as const;
