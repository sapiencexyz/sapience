// Bonus + referral entitlement math, computed entirely from chain state:
// the receipt NFT (what was submitted), escrow PredictionCreated events
// (which lines were funded — monotonic, survives redeems), and resolver
// reads (line outcomes). No server records involved.

import type { Hex } from 'viem';
import { cardSeed, drawCells, poolSecret } from './draw.js';
import {
  cellResolution,
  fundedPickConfigIds,
  linePickConfigId,
  linePicks,
  type CellOutcome,
} from './chain.js';
import { env } from './config.js';
import { buildLines, CELL_COUNT, LINES_PER_CARD } from './lines.js';
import { allChainSubmissions, type ChainSubmission } from './receipt.js';
import type { EntitlementRow, PoolConfig } from './types.js';

const BPS = 10_000n;

interface LineState {
  funded: boolean;
  /** 'won' | 'lost' are final; 'open' can still change. */
  outcome: 'won' | 'lost' | 'open';
}

async function lineStates(
  pool: PoolConfig,
  submission: ChainSubmission,
): Promise<LineState[]> {
  const secret = poolSecret(env.SERVER_SECRET as Hex, pool.poolId);
  const cells = drawCells(
    pool.conditions,
    cardSeed(secret, pool.poolId, submission.player),
  );
  const lines = buildLines();
  const funded = await fundedPickConfigIds(submission.player);

  // One resolver read per distinct cell, shared across the lines that use it.
  const resolutions = new Map<number, CellOutcome>();
  await Promise.all(
    Array.from({ length: CELL_COUNT }, (_, i) => i).map(async (i) => {
      resolutions.set(
        i,
        await cellResolution(cells[i].resolver, cells[i].conditionId),
      );
    }),
  );

  return lines.map((line) => {
    const picks = linePicks(line, cells, submission.yesMask);
    const isFunded = funded.has(linePickConfigId(picks).toLowerCase());
    let lost = false;
    let allAgree = true;
    for (const idx of line.cellIndices) {
      const declaredYes = (submission.yesMask & (1 << idx)) !== 0;
      const res = resolutions.get(idx) ?? 'pending';
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
  pool: PoolConfig,
  submission: ChainSubmission,
): Promise<EntitlementRow> {
  const states = await lineStates(pool, submission);
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
  pools: readonly PoolConfig[],
): Promise<EntitlementRow[]> {
  const byId = new Map(pools.map((p) => [p.poolId, p]));
  const rows: EntitlementRow[] = [];
  // Sequential on purpose: each row already fans out ~17 RPC reads.
  for (const s of await allChainSubmissions()) {
    const pool = byId.get(s.poolId);
    if (!pool) continue; // pool no longer in config — not resolvable
    rows.push(await entitlementFor(pool, s));
  }
  return rows;
}
