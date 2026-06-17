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

/**
 * Is THIS card a sponsored bingo card? Card-level, on-chain-derivable, so it
 * survives a page reload without any client-held flag. Both must hold:
 *   - price is exactly the sponsored amount, AND
 *   - the wallet holds a FULL bingo grant (`allocated === SPONSORED_CARD_PRICE_WEI`).
 * The `allocated` check is what stops a partial cross-product budget (e.g. an
 * /app 1-USDe grant) from ever being read as a bingo-sponsored card (E11), and
 * a price ≠ the sponsored amount means it's a paid card — never sponsor it.
 */
export function isSponsoredCard(s: {
  cardPriceWei: bigint;
  allocated: bigint;
}): boolean {
  return (
    s.cardPriceWei === SPONSORED_CARD_PRICE_WEI &&
    s.allocated === SPONSORED_CARD_PRICE_WEI
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
 *  sponsored card, decided purely from on-chain shapes:
 *   - `reject` (with reason) — caller throws, no receipt is minted;
 *   - `grant`  — never granted (allocated 0) → grant a full budget, confirm;
 *   - `ok`     — already holds a usable full budget → submit, no new tx. */
export type BudgetAction =
  | { kind: 'ok' }
  | { kind: 'grant' }
  | { kind: 'reject'; reason: string };

export function sponsoredBudgetAction(s: {
  bankroll: bigint;
  allocated: bigint;
  remaining: bigint;
}): BudgetAction {
  if (s.bankroll < SPONSORED_CARD_PRICE_WEI) {
    return { kind: 'reject', reason: 'Sponsor bankroll underfunded' };
  }
  if (s.allocated === 0n) return { kind: 'grant' };
  if (
    s.allocated === SPONSORED_CARD_PRICE_WEI &&
    s.remaining >= SPONSORED_CARD_PRICE_WEI
  ) {
    return { kind: 'ok' };
  }
  // Partial (/app) or already-spent bingo budget → not eligible for a new one.
  return { kind: 'reject', reason: 'Wallet not eligible for a sponsored card' };
}
