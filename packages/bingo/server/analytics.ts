// Admin analytics — a PURE fold over data already fetched from chain by the
// entitlements worklist (allEntitlements) and the sponsorship listing
// (listSponsorships). No new RPC, no contract, no DB: the inputs are chain
// truth, the output is arithmetic, so this projection can never drift. Keep it
// IO-free (like sponsorshipPolicy.ts) so it unit-tests without a chain.

import type { Address } from 'viem';
import { isSponsoredCard } from './sponsorshipPolicy.js';
import type { SponsorshipHistory } from './sponsorship.js';
import { LINES_PER_CARD } from './lines.js';
import type { EntitlementRow } from './types.js';

export interface AnalyticsSummary {
  cards: {
    total: number;
    complete: number;
    sponsored: number;
    selfFunded: number;
    distinctPlayers: number;
  };
  staked: {
    totalWei: string;
    sponsoredWei: string;
    selfFundedWei: string;
  };
  wins: {
    /** Win-count histogram over DECIDED complete cards; index = wins (0..N). */
    histogram: number[];
    decidedCards: number;
  };
  bonuses: {
    /** Owed, decided, and not yet paid — safe to pay now. */
    payableWei: string;
    payableCount: number;
    /** Complete but still provisional — owed amount can still grow; don't pay. */
    provisionalWei: string;
    /** Already settled on-chain (sum of owed on paid cards). */
    paidWei: string;
    paidCount: number;
  };
  referrals: {
    payableWei: string;
    payableCount: number;
    paidWei: string;
    paidCount: number;
    distinctReferrers: number;
  };
  sponsorship: {
    sponsorAddress: Address | null;
    bankrollWei: string;
    beneficiaries: number;
    played: number;
    allocatedWei: string;
    usedWei: string;
    remainingWei: string;
  };
}

const wei = (s: string | null): bigint => (s ? BigInt(s) : 0n);

/** Aggregate the per-card worklist + grant listing into a dashboard summary. */
export function buildAnalytics(
  rows: readonly EntitlementRow[],
  sponsorships: SponsorshipHistory,
): AnalyticsSummary {
  // Player → granted allocation, so a card counts as sponsored only when its
  // price matches AND its player actually holds a bingo grant (isSponsoredCard).
  const allocatedByPlayer = new Map<string, bigint>(
    sponsorships.rows.map((r) => [
      r.smartAccount.toLowerCase(),
      wei(r.allocatedWei),
    ]),
  );

  const players = new Set<string>();
  const referrers = new Set<string>();
  const histogram = new Array<number>(LINES_PER_CARD + 1).fill(0);

  let complete = 0;
  let sponsored = 0;
  let totalStaked = 0n;
  let sponsoredStaked = 0n;
  let decidedCards = 0;

  let bonusPayable = 0n;
  let bonusPayableCount = 0;
  let bonusProvisional = 0n;
  let bonusPaid = 0n;
  let bonusPaidCount = 0;

  let refPayable = 0n;
  let refPayableCount = 0;
  let refPaid = 0n;
  let refPaidCount = 0;

  for (const r of rows) {
    players.add(r.player.toLowerCase());
    const price = wei(r.cardPriceWei);
    totalStaked += price;
    if (r.complete) complete += 1;

    const isSponsored = isSponsoredCard({
      cardPriceWei: price,
      allocated: allocatedByPlayer.get(r.player.toLowerCase()) ?? 0n,
    });
    if (isSponsored) {
      sponsored += 1;
      sponsoredStaked += price;
    }

    if (r.complete && r.decided && r.wins != null) {
      decidedCards += 1;
      if (r.wins >= 0 && r.wins < histogram.length) histogram[r.wins] += 1;
    }

    // Bonuses: paid is terminal; otherwise decided+owed is payable, and a
    // still-provisional complete card is held back (its owed can still grow).
    const bonus = wei(r.bonusOwedWei);
    if (r.bonusPaidOnChain) {
      bonusPaid += bonus;
      bonusPaidCount += 1;
    } else if (r.complete && r.provisional) {
      bonusProvisional += bonus;
    } else if (r.decided && bonus > 0n) {
      bonusPayable += bonus;
      bonusPayableCount += 1;
    }

    // Referrals: only cards that carry a referrer.
    if (r.ref) {
      referrers.add(r.ref.toLowerCase());
      const owed = wei(r.referralOwedWei);
      if (r.referralPaidOnChain) {
        refPaid += owed;
        refPaidCount += 1;
      } else if (r.decided && owed > 0n) {
        refPayable += owed;
        refPayableCount += 1;
      }
    }
  }

  let allocated = 0n;
  let used = 0n;
  let remaining = 0n;
  let played = 0;
  for (const r of sponsorships.rows) {
    allocated += wei(r.allocatedWei);
    used += wei(r.usedWei);
    remaining += wei(r.remainingWei);
    if (r.played) played += 1;
  }

  return {
    cards: {
      total: rows.length,
      complete,
      sponsored,
      selfFunded: rows.length - sponsored,
      distinctPlayers: players.size,
    },
    staked: {
      totalWei: totalStaked.toString(),
      sponsoredWei: sponsoredStaked.toString(),
      selfFundedWei: (totalStaked - sponsoredStaked).toString(),
    },
    wins: { histogram, decidedCards },
    bonuses: {
      payableWei: bonusPayable.toString(),
      payableCount: bonusPayableCount,
      provisionalWei: bonusProvisional.toString(),
      paidWei: bonusPaid.toString(),
      paidCount: bonusPaidCount,
    },
    referrals: {
      payableWei: refPayable.toString(),
      payableCount: refPayableCount,
      paidWei: refPaid.toString(),
      paidCount: refPaidCount,
      distinctReferrers: referrers.size,
    },
    sponsorship: {
      sponsorAddress: sponsorships.sponsorAddress,
      bankrollWei: sponsorships.bankrollWei,
      beneficiaries: sponsorships.rows.length,
      played,
      allocatedWei: allocated.toString(),
      usedWei: used.toString(),
      remainingWei: remaining.toString(),
    },
  };
}
