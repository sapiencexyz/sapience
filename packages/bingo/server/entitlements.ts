// Bonus + referral entitlement math, computed entirely from chain state:
// the receipt NFT (what was submitted), escrow PredictionCreated events
// (which lines were funded — monotonic, survives redeems), and resolver
// reads (line outcomes). No server records involved.
//
// Funded-line attribution: a line counts only if its escrow event matches
// the card's refCode tag AND its exact per-line stake. The tag is set by
// this backend at mint time but is ultimately player-forgeable (the player
// owns the smart account), so entitlements remain an admin-reviewed
// worklist — payouts are discretionary treasury transfers, not automatic.

import type { Address, Hex } from 'viem';
import { cardTag, drawCells } from './draw.js';
import {
  cellResolution,
  fundedPredictions,
  lineIsFunded,
  linePicks,
  type CellOutcome,
  type FundedPrediction,
} from './chain.js';
import { buildLines, LINES_PER_CARD } from './lines.js';
import type { Network } from './network.js';
import { allChainSubmissions, type ChainSubmission } from './receipt.js';
import type { EntitlementRow, PoolConfig } from './types.js';

const BPS = 10_000n;

interface LineState {
  funded: boolean;
  /** 'won' | 'lost' are final; 'open' can still change. */
  outcome: 'won' | 'lost' | 'open';
}

/** Shared per-call caches: one funded-events fetch per player (reused by
 *  all their cards) and one resolver read per distinct condition. */
export interface EntitlementCaches {
  funded: Map<string, Promise<FundedPrediction[]>>;
  resolutions: Map<string, Promise<CellOutcome>>;
}

export const newCaches = (): EntitlementCaches => ({
  funded: new Map(),
  resolutions: new Map(),
});

function fundedFor(
  network: Network,
  caches: EntitlementCaches,
  player: Address,
): Promise<FundedPrediction[]> {
  const key = player.toLowerCase();
  let p = caches.funded.get(key);
  if (!p) {
    p = fundedPredictions(network, player);
    caches.funded.set(key, p);
  }
  return p;
}

function resolutionFor(
  network: Network,
  caches: EntitlementCaches,
  resolver: Address,
  conditionId: Hex,
): Promise<CellOutcome> {
  const key = `${resolver.toLowerCase()}:${conditionId.toLowerCase()}`;
  let p = caches.resolutions.get(key);
  if (!p) {
    p = cellResolution(network, resolver, conditionId);
    caches.resolutions.set(key, p);
  }
  return p;
}

async function lineStates(
  network: Network,
  pool: PoolConfig,
  submission: ChainSubmission,
  caches: EntitlementCaches,
): Promise<LineState[]> {
  // The receipt stamps the seed — use the chain's record, not a re-derive.
  const cells = drawCells(pool.conditions, submission.seed);
  const lines = buildLines();
  const tag = cardTag(pool.poolId, submission.player, submission.cardIndex);
  const stakePerLineWei =
    BigInt(submission.cardPriceWei) / BigInt(LINES_PER_CARD);
  const funded = await fundedFor(network, caches, submission.player);

  const resolutions = await Promise.all(
    cells.map((c) => resolutionFor(network, caches, c.resolver, c.conditionId)),
  );

  return lines.map((line) => {
    const picks = linePicks(line, cells, submission.yesMask);
    const isFunded = lineIsFunded(funded, picks, tag, stakePerLineWei);
    let lost = false;
    let allAgree = true;
    for (const idx of line.cellIndices) {
      const declaredYes = (submission.yesMask & (1 << idx)) !== 0;
      const res = resolutions[idx] ?? 'pending';
      if (res === 'pending') {
        allAgree = false;
      } else if (res === 'tie' || (res === 'yes') !== declaredYes) {
        // A decisive miss (or a tie) loses the line for good.
        lost = true;
      }
    }
    const outcome: LineState['outcome'] = lost
      ? 'lost'
      : allAgree
        ? 'won'
        : 'open';
    return { funded: isFunded, outcome };
  });
}

export async function entitlementFor(
  network: Network,
  pool: PoolConfig,
  submission: ChainSubmission,
  caches: EntitlementCaches = newCaches(),
): Promise<EntitlementRow> {
  const states = await lineStates(network, pool, submission, caches);
  const fundedStates = states.filter((s) => s.funded);
  const linesFunded = fundedStates.length;
  const complete = linesFunded === LINES_PER_CARD;

  let wins: number | null = null;
  let decided: boolean | null = null;
  let bonusOwedWei: string | null = null;
  let referralOwedWei: string | null = null;

  if (complete) {
    wins = fundedStates.filter((s) => s.outcome === 'won').length;
    decided = fundedStates.every((s) => s.outcome !== 'open');
    const price = BigInt(submission.cardPriceWei);
    bonusOwedWei = (
      (price * BigInt(pool.multiplierBps[wins] ?? 0)) /
      BPS
    ).toString();
    if (submission.ref) {
      referralOwedWei = (
        (price * BigInt(pool.referralBps)) /
        BPS
      ).toString();
    }
  }

  return {
    player: submission.player,
    poolId: submission.poolId,
    cardIndex: submission.cardIndex,
    cardPriceWei: submission.cardPriceWei,
    linesFunded,
    complete,
    wins,
    decided,
    // Owed amounts can only grow until every line is decided — pay only
    // when `provisional` is false.
    provisional: complete ? !decided : null,
    bonusOwedWei,
    ref: submission.ref,
    referralOwedWei,
    receiptTokenId: submission.tokenId.toString(),
    bonusPaidOnChain: submission.bonusPaid,
    referralPaidOnChain: submission.referralPaid,
  };
}

/** Every submission on the chain, joined against the configured pools — the
 *  admin payout worklist. */
export async function allEntitlements(
  network: Network,
  pools: readonly PoolConfig[],
): Promise<EntitlementRow[]> {
  const byId = new Map(pools.map((p) => [p.poolId, p]));
  const caches = newCaches();
  const rows: EntitlementRow[] = [];
  // Sequential on purpose: the caches collapse most RPC fan-out, but each
  // new player/condition still costs reads.
  for (const s of await allChainSubmissions(network)) {
    const pool = byId.get(s.poolId);
    if (!pool) continue; // pool no longer in config — not resolvable
    rows.push(await entitlementFor(network, pool, s, caches));
  }
  return rows;
}
