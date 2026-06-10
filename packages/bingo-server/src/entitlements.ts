// Bonus + referral entitlement math — the same rules the old contract
// enforced, computed off-chain against escrow + resolver state.

import type { Address } from 'viem';
import { cardSeed, drawCells } from './draw.js';
import {
  cellResolution,
  lineFunded,
  linePicks,
  type CellOutcome,
} from './chain.js';
import { buildLines, CELL_COUNT, LINES_PER_CARD } from './lines.js';
import { receiptPaidState } from './receipt.js';
import type { Store } from './store.js';
import type {
  CardSubmission,
  EntitlementRow,
  PoolRecord,
} from './types.js';

const BPS = 10_000n;

interface LineState {
  funded: boolean;
  /** 'won' | 'lost' are final; 'open' can still change. */
  outcome: 'won' | 'lost' | 'open';
}

async function lineStates(
  record: PoolRecord,
  store: Store,
  submission: CardSubmission,
): Promise<LineState[]> {
  // Funded = journal record (monotonic — survives the player redeeming the
  // position, which burns the tokens) OR live predictor-token balance (covers
  // lines minted before the journal record existed).
  const journaled = store.fundedLineIds(submission.player, submission.poolId);
  const cells = drawCells(
    record.pool.conditions,
    cardSeed(record.secret, record.pool.poolId, submission.player),
  );
  const lines = buildLines();

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

  return Promise.all(
    lines.map(async (line) => {
      const picks = linePicks(line, cells, submission.yesMask);
      const funded =
        journaled.has(line.id) ||
        (await lineFunded(submission.player, picks));
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
      return { funded, outcome };
    }),
  );
}

export async function entitlementFor(
  record: PoolRecord,
  store: Store,
  submission: CardSubmission,
): Promise<EntitlementRow> {
  const states = await lineStates(record, store, submission);
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
      (price * BigInt(record.pool.multiplierBps[wins] ?? 0)) /
      BPS
    ).toString();
    if (submission.ref) {
      referralOwedWei = (
        (price * BigInt(record.pool.referralBps)) /
        BPS
      ).toString();
    }
  }

  // On-chain payout state from the receipt NFT, when configured.
  const paid = await receiptPaidState(
    submission.poolId,
    submission.player,
  ).catch(() => null);

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
    receiptTokenId: paid?.tokenId.toString() ?? null,
    bonusPaidOnChain: paid?.bonusPaid ?? null,
    referralPaidOnChain: paid?.referralPaid ?? null,
  };
}

/** Every submission across every known pool — the admin payout worklist. */
export async function allEntitlements(store: Store): Promise<EntitlementRow[]> {
  const rows: EntitlementRow[] = [];
  // Sequential on purpose: each row already fans out ~26 RPC reads.
  for (const s of store.allSubmissions()) {
    const record = store.getPool(s.poolId);
    if (!record) continue; // pool predates the journal — not resolvable
    rows.push(await entitlementFor(record, store, s));
  }
  return rows;
}

/** Per-card line funded flags, used by GET /card. */
export async function fundedFlags(
  record: PoolRecord,
  store: Store,
  player: Address,
  yesMask: number,
): Promise<boolean[]> {
  const cells = drawCells(
    record.pool.conditions,
    cardSeed(record.secret, record.pool.poolId, player),
  );
  const journaled = store.fundedLineIds(player, record.pool.poolId);
  return Promise.all(
    buildLines().map(
      async (line) =>
        journaled.has(line.id) ||
        lineFunded(player, linePicks(line, cells, yesMask)),
    ),
  );
}
