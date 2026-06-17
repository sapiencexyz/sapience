// Pure sponsorship policy — no IO, no env, no chain. Kept separate from
// sponsorship.ts (which imports config + viem) so the decision logic unit-tests
// in isolation, the way draw/lines/pool policy already do.

import type { Address } from 'viem';

/** Sponsored card price === the budget granted per wallet (one free card). The
 *  single bingo-side knob; see SPONSORSHIP_PLAN.md "Knobs". 10 USDe (18 dec). */
export const SPONSORED_CARD_PRICE_WEI = 10n * 10n ** 18n;

/**
 * The eligibility rule (admin-managed grants):
 *   eligible = bankroll covers a card AND remaining >= cardPrice
 * Admin must grant budget before a wallet is eligible; there is no auto-grant
 * arm. The bankroll gate stops the UI promising a card the contract can't fund
 * (E9). Partial leftovers (< one card) are excluded (E11).
 */
export function sponsorEligibility(s: {
  allocated: bigint;
  remaining: bigint;
  bankroll: bigint;
  cardPrice: bigint;
}): boolean {
  return s.bankroll >= s.cardPrice && s.remaining >= s.cardPrice;
}

/**
 * Is THIS card a sponsored bingo card? Card-level, on-chain-derivable, so it
 * survives a page reload without any client-held flag. Both must hold:
 *   - price is exactly the sponsored amount, AND
 *   - the wallet holds a bingo grant (`allocated >= SPONSORED_CARD_PRICE_WEI`).
 * The `allocated >= cardPrice` check stops a partial cross-product budget (e.g.
 * an /app 1-USDe grant) from ever being read as a bingo-sponsored card (E11).
 */
export function isSponsoredCard(s: {
  cardPriceWei: bigint;
  allocated: bigint;
}): boolean {
  return (
    s.cardPriceWei === SPONSORED_CARD_PRICE_WEI &&
    s.allocated >= SPONSORED_CARD_PRICE_WEI
  );
}

/** Whether a single line of a card should be house-funded: the card is a
 *  sponsored card AND the remaining budget still covers this line's stake. */
export function isLineSponsored(s: {
  cardPriceWei: bigint;
  allocated: bigint;
  remaining: bigint;
  stakePerLineWei: bigint;
}): boolean {
  return (
    isSponsoredCard({ cardPriceWei: s.cardPriceWei, allocated: s.allocated }) &&
    s.remaining >= s.stakePerLineWei
  );
}

/** What `ensureSponsoredBudget` must do for a wallet about to submit a
 *  sponsored card — verify-only under admin-managed grants:
 *   - `reject` (with reason) — caller throws, no receipt is minted;
 *   - `ok`     — remaining covers a full card → submit. */
export type BudgetAction =
  | { kind: 'ok' }
  | { kind: 'reject'; reason: string };

export function sponsoredBudgetAction(s: {
  bankroll: bigint;
  allocated: bigint;
  remaining: bigint;
}): BudgetAction {
  if (s.bankroll < SPONSORED_CARD_PRICE_WEI) {
    return { kind: 'reject', reason: 'Sponsor bankroll underfunded' };
  }
  if (s.remaining >= SPONSORED_CARD_PRICE_WEI) {
    return { kind: 'ok' };
  }
  return { kind: 'reject', reason: 'Wallet not eligible for a sponsored card' };
}

/** Unique beneficiaries seen in BudgetSet logs (order preserved, first seen). */
export function beneficiariesFromBudgetSetLogs(
  logs: ReadonlyArray<{ beneficiary: Address }>,
): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const { beneficiary } of logs) {
    const key = beneficiary.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(beneficiary);
  }
  return out;
}
