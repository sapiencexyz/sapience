// Pure sponsorship policy — no IO, no env, no chain. Kept separate from
// sponsorship.ts (which imports config + viem) so the decision logic unit-tests
// in isolation, the way draw/lines/pool policy already do.

/** Sponsored card price === the budget granted per wallet (one free card). The
 *  single bingo-side knob; see SPONSORSHIP_PLAN.md "Knobs". 10 USDe (18 dec). */
export const SPONSORED_CARD_PRICE_WEI = 10n * 10n ** 18n;

/**
 * The eligibility rule:
 *   eligible = bankroll covers a card
 *             AND (a full card's budget is already available OR never granted)
 * - `allocated === 0` (never granted) → the submit step grants a full card's
 *   budget, so they're eligible. This stateless arm — not `remaining > 0` —
 *   keeps "first card free" from re-granting a wallet that already spent it
 *   (ledger E5).
 * - `remaining >= cardPrice` covers an already-granted-but-unplayed wallet
 *   while EXCLUDING a partial leftover (e.g. a cross-product 1-USDe /app
 *   budget, ledger E11) that couldn't actually fund a 10-USDe card.
 * The bankroll gate stops the UI promising a card the contract can't fund (E9).
 */
export function sponsorEligibility(s: {
  allocated: bigint;
  remaining: bigint;
  bankroll: bigint;
  cardPrice: bigint;
}): boolean {
  const bankrollOk = s.bankroll >= s.cardPrice;
  return bankrollOk && (s.remaining >= s.cardPrice || s.allocated === 0n);
}
