// Treasury risk + payout analysis — a PURE fold over the entitlement worklist
// (allEntitlements already returns EVERY submission, including abandoned
// 0-line cards, so re-roll grinding is visible). No new chain reads, no DB.
// IO-free like sponsorshipPolicy.ts / analytics.ts so it unit-tests offline.
//
// Surfaces two views over the same fold: per-card winners (with the multiplier
// each hit) and a per-player rollup carrying aggregate risk flags.

import type { Address } from 'viem';
import type { EntitlementRow } from './types.js';

// ─── Tunable thresholds (the only opinionated knobs) ─────────────────────────
/** Min decided cards before a player's win rate is judged — guards against a
 *  lucky small sample reading as cheating. */
const WIN_RATE_MIN_DECIDED_CARDS = 3;
/** Flag when a player's win rate is at least this multiple of the population
 *  base rate. */
const WIN_RATE_OUTLIER_FACTOR = 1.5;
/** Flag when one player holds at least this share (bps) of total bonus owed. */
const CONCENTRATION_FLAG_BPS = 2000; // 20%

const BPS = 10_000n;

export type RiskFlag =
  | 'reroll' // a funded card sits above an abandoned (re-roll) index
  | 'self-referral' // a card referred by the player themselves
  | 'referral-ring' // reciprocal referral with another player (A↔B)
  | 'win-rate-outlier' // wins far above the population base rate
  | 'concentration'; // outsized share of total bonus owed

export interface WinnerCard {
  player: Address;
  poolId: string;
  cardIndex: number;
  receiptTokenId: string | null;
  wins: number;
  /** Effective multiplier in bps, inverted from bonus / price (no pool lookup). */
  multiplierBps: number;
  cardPriceWei: string;
  bonusOwedWei: string;
  bonusPaidOnChain: boolean | null;
  decided: boolean | null;
  provisional: boolean | null;
  /** Per-card subset of the player's flags that this card participates in. */
  flags: RiskFlag[];
}

export interface PlayerRollup {
  player: Address;
  cards: number;
  funded: number;
  abandoned: number;
  /** Abandoned (0-line) cards sitting below a funded index — the re-roll tell. */
  abandonedBelowFunded: number;
  totalStakedWei: string;
  totalBonusOwedWei: string;
  totalBonusPaidWei: string;
  maxMultiplierBps: number;
  /** Won / funded lines over decided complete cards; null if none decided. */
  winRate: number | null;
  /** Share of total bonus owed across all players, in bps. */
  bonusShareBps: number;
  riskFlags: RiskFlag[];
}

export interface TreasuryReport {
  winners: WinnerCard[];
  players: PlayerRollup[];
  totalBonusOwedWei: string;
  totalBonusPaidWei: string;
  /** Population win rate (won/funded lines over all decided cards); null if none. */
  baseWinRate: number | null;
}

const wei = (s: string | null): bigint => (s ? BigInt(s) : 0n);
const lc = (a: Address): string => a.toLowerCase();

function multiplierBps(bonusOwedWei: string | null, cardPriceWei: string): number {
  const price = wei(cardPriceWei);
  if (price <= 0n) return 0;
  return Number((wei(bonusOwedWei) * BPS) / price);
}

export function buildTreasuryReport(
  rows: readonly EntitlementRow[],
): TreasuryReport {
  const byPlayer = new Map<string, EntitlementRow[]>();
  for (const r of rows) {
    const key = lc(r.player);
    (byPlayer.get(key) ?? byPlayer.set(key, []).get(key)!).push(r);
  }

  // ── Referral graph: edges player→ref, restricted to refs that are players ──
  const playerSet = new Set(byPlayer.keys());
  const edges = new Map<string, Set<string>>();
  const selfReferrers = new Set<string>();
  for (const r of rows) {
    if (!r.ref) continue;
    const from = lc(r.player);
    const to = lc(r.ref);
    if (from === to) {
      selfReferrers.add(from);
      continue;
    }
    if (!playerSet.has(to)) continue; // referrer isn't a player — not a ring
    (edges.get(from) ?? edges.set(from, new Set()).get(from)!).add(to);
  }
  const ringPlayers = new Set<string>();
  for (const [from, tos] of edges) {
    for (const to of tos) {
      if (edges.get(to)?.has(from)) {
        ringPlayers.add(from);
        ringPlayers.add(to);
      }
    }
  }

  // ── Population win rate (won / funded lines over decided complete cards) ──
  let popWins = 0;
  let popLines = 0;
  for (const r of rows) {
    if (r.complete && r.decided && r.wins != null) {
      popWins += r.wins;
      popLines += r.linesFunded;
    }
  }
  const baseWinRate = popLines > 0 ? popWins / popLines : null;

  // ── Totals (for concentration share) ──
  let totalOwed = 0n;
  let totalPaid = 0n;
  for (const r of rows) {
    if (r.bonusPaidOnChain) totalPaid += wei(r.bonusOwedWei);
    else totalOwed += wei(r.bonusOwedWei);
  }

  // Per (player, pool): the highest funded card index — abandoned cards below
  // it are the re-roll discards.
  const maxFundedIdx = new Map<string, number>(); // `${player}:${pool}` → idx
  for (const r of rows) {
    if (r.linesFunded <= 0) continue;
    const k = `${lc(r.player)}:${r.poolId}`;
    maxFundedIdx.set(k, Math.max(maxFundedIdx.get(k) ?? -1, r.cardIndex));
  }
  const isRerollDiscard = (r: EntitlementRow): boolean =>
    r.linesFunded <= 0 &&
    r.cardIndex < (maxFundedIdx.get(`${lc(r.player)}:${r.poolId}`) ?? -1);

  // Per (player,pool), the indices of abandoned cards, so a funded card can
  // tell whether any discard sits below it.
  const discardIdx = new Map<string, number[]>();
  for (const r of rows) {
    if (!isRerollDiscard(r)) continue;
    const k = `${lc(r.player)}:${r.poolId}`;
    (discardIdx.get(k) ?? discardIdx.set(k, []).get(k)!).push(r.cardIndex);
  }
  const cardHasRerollFlag = (r: EntitlementRow): boolean => {
    if (r.linesFunded <= 0) return false;
    const below = discardIdx.get(`${lc(r.player)}:${r.poolId}`);
    return !!below && below.some((i) => i < r.cardIndex);
  };

  const players: PlayerRollup[] = [];
  const winners: WinnerCard[] = [];

  for (const [key, prows] of byPlayer) {
    const player = prows[0].player;
    let funded = 0;
    let abandoned = 0;
    let abandonedBelowFunded = 0;
    let staked = 0n;
    let owed = 0n;
    let paid = 0n;
    let maxMult = 0;
    let pWins = 0;
    let pLines = 0;
    let decidedCards = 0;

    for (const r of prows) {
      staked += wei(r.cardPriceWei);
      if (r.linesFunded > 0) funded += 1;
      else abandoned += 1;
      if (isRerollDiscard(r)) abandonedBelowFunded += 1;
      if (r.bonusPaidOnChain) paid += wei(r.bonusOwedWei);
      else owed += wei(r.bonusOwedWei);
      if (r.complete && r.decided && r.wins != null) {
        decidedCards += 1;
        pWins += r.wins;
        pLines += r.linesFunded;
      }

      const bonus = wei(r.bonusOwedWei);
      if (bonus > 0n) {
        const mult = multiplierBps(r.bonusOwedWei, r.cardPriceWei);
        maxMult = Math.max(maxMult, mult);
        const flags: RiskFlag[] = [];
        if (cardHasRerollFlag(r)) flags.push('reroll');
        if (r.ref && lc(r.ref) === key) flags.push('self-referral');
        if (ringPlayers.has(key)) flags.push('referral-ring');
        winners.push({
          player: r.player,
          poolId: r.poolId,
          cardIndex: r.cardIndex,
          receiptTokenId: r.receiptTokenId,
          wins: r.wins ?? 0,
          multiplierBps: mult,
          cardPriceWei: r.cardPriceWei,
          bonusOwedWei: r.bonusOwedWei ?? '0',
          bonusPaidOnChain: r.bonusPaidOnChain,
          decided: r.decided,
          provisional: r.provisional,
          flags,
        });
      }
    }

    const winRate = pLines > 0 ? pWins / pLines : null;
    const bonusShareBps =
      totalOwed > 0n ? Number((owed * BPS) / totalOwed) : 0;

    const riskFlags: RiskFlag[] = [];
    if (abandonedBelowFunded > 0) riskFlags.push('reroll');
    if (selfReferrers.has(key)) riskFlags.push('self-referral');
    if (ringPlayers.has(key)) riskFlags.push('referral-ring');
    if (
      baseWinRate != null &&
      baseWinRate > 0 &&
      winRate != null &&
      decidedCards >= WIN_RATE_MIN_DECIDED_CARDS &&
      winRate >= baseWinRate * WIN_RATE_OUTLIER_FACTOR
    ) {
      riskFlags.push('win-rate-outlier');
    }
    if (bonusShareBps >= CONCENTRATION_FLAG_BPS) riskFlags.push('concentration');

    players.push({
      player,
      cards: prows.length,
      funded,
      abandoned,
      abandonedBelowFunded,
      totalStakedWei: staked.toString(),
      totalBonusOwedWei: owed.toString(),
      totalBonusPaidWei: paid.toString(),
      maxMultiplierBps: maxMult,
      winRate,
      bonusShareBps,
      riskFlags,
    });
  }

  winners.sort((a, b) => b.multiplierBps - a.multiplierBps);
  players.sort((a, b) => {
    const d = wei(b.totalBonusOwedWei) - wei(a.totalBonusOwedWei);
    return d > 0n ? 1 : d < 0n ? -1 : 0;
  });

  return {
    winners,
    players,
    totalBonusOwedWei: totalOwed.toString(),
    totalBonusPaidWei: totalPaid.toString(),
    baseWinRate,
  };
}
