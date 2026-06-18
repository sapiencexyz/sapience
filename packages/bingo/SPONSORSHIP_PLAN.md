# Bingo Sponsorship — Plan & Edge-Case Ledger

> **Superseded for the grant flow.** This doc describes the _automatic_ "first
> card free" model. The grant flow is being replaced by admin-managed grants —
> see [`SPONSORSHIP_ADMIN_PLAN.md`](./SPONSORSHIP_ADMIN_PLAN.md). The on-chain
> rail and edge-case ledger below remain useful reference.

Goal: a new bingo user can play **without depositing** — the house sponsors their
first card's stake. Reuses the existing `/app` sponsorship rail end-to-end.

## How it works (one paragraph)

Bingo already mints each card line as a 4-leg parlay against the **same relayer +
same vault** that `/app` uses. The escrow's `MintRequest` has a `predictorSponsor`
hook: if set, the escrow calls `IMintSponsor(sponsor).fundMint()` to fund the
predictor's stake instead of pulling it from the user. The deployed
`OnboardingSponsor` contract enforces `counterparty == vault` (anti self-deal),
a 70% entry-price cap, a per-mint `matchLimit`, and a per-user budget. Because
bingo settles predictor-vs-vault, all guards are satisfied for free. So bingo
just threads the sponsor field through its existing SDK calls, grants a budget to
new wallets, and reads budget state to drive the UI. **No new contract, no
Solidity, no relayer/MM changes.**

## Resolved decisions

1. **Reuse the live `OnboardingSponsor`** — `0x52Ec…` (main) / `0xa0b2…` (test).
   Same escrow/collateral/vault-counterparty/70%-cap bingo already uses.
2. **Eligibility = stateless auto-grant.** Any wallet with `budgets[sa].allocated == 0`
   gets a budget; one free card per wallet, bounded by bankroll. No DB.
3. **MM/vault already sponsor-aware** (proven by `/app` live). No bot changes.
4. **Grant at `POST /api/card/submit`**, parallel to the receipt mint, awaited
   before the 10 line-mints fire. Guard on `allocated == 0`.
5. **`GET /api/sponsor/status`** — new stateless on-chain read drives the UI.
   `eligible = bankrollOk && (remaining > 0 || allocated == 0)`.
6. **UX**: eligible new user skips Fund (Connect → Sign → Play); submit button
   reads "Mint with sponsorship balance"; pre-submit balance check bypassed.
7. **Sponsored card = fixed 10 USDe** (= granted budget). Price input hidden.

## Knobs

| Knob                                   | Value                            | Where          | Update cost                    |
| -------------------------------------- | -------------------------------- | -------------- | ------------------------------ |
| Per-user budget / sponsored card price | 10 USDe                          | bingo constant | config edit                    |
| `matchLimit` (per-mint cap)            | 1 USDe (→ bump to 2)             | contract       | owner `setMatchLimit`, 1 tx    |
| `maxEntryPriceBps`                     | 7000, immutable                  | contract       | redeploy (never binds parlays) |
| Bankroll                               | fund with wUSDe                  | contract       | transfer                       |
| `budgetManager`                        | `0xfB3A…Cb34` (shared w/ `/app`) | contract       | owner rotate                   |

## Edge-case ledger (DEFERRED — stateless v1, revisit later)

- **E1–E3** Shared contract commingles budget/accounting with `/app`; a wallet
  that spent its `/app` budget gets no bingo budget; no top-ups.
- **E4** Sybil: N wallets → N free 10-USDe budgets; bankroll is the only ceiling.
- **E5** Grant guard MUST be `allocated == 0` (not `remaining`), else a spent
  wallet is re-granted forever. _(enforced in `sponsorEligibility`/`grantBudgetIfNew`)_
- **E6** Single `budgetManager` → bingo shares `/app`'s budget-manager key.
- **E7/E11** `setBudget` overwrites `allocated`; cross-product clobber; an
  `/app`-granted wallet stays at 1 USDe, won't get bingo's 10.
- **E8** If the bingo-quoting bot's `SPONSOR_ALLOWLIST` excluded our sponsor it
  silently self-funds → mint reverts. Staging smoke-test item.
- **E9** "Eligible" must also check the sponsor contract's wUSDe bankroll, else
  sponsored mints revert `SponsorUnderfunded` mid-card. _(enforced)_
- **E10** 10 USDe = 10× bankroll burn & Sybil exposure vs the 1-USDe default.
- **E12** Sponsored winners still accrue bonus/referral entitlements (extra
  house cost) — confirm intended.

## PR-review hardening (2026-06-16)

Tightened from the first working version after review — sponsorship is now
**fail-closed and card-level**, not inferred from leftover budget:

- **Card-level, not per-line.** A line is sponsored only if the CARD is sponsored
  — `cardPrice == SPONSORED_CARD_PRICE_WEI` AND `allocated == SPONSORED_CARD_PRICE_WEI`
  (full bingo grant shape) AND remaining covers the stake. A partial `/app`
  budget (E11) or a paid card can never accidentally consume sponsorship.
  Derived from on-chain state, so it survives a reload.
- **Submit fails closed.** `ensureSponsoredBudget` confirms the budget (already
  held, or granted + tx-confirmed) BEFORE the receipt is minted; throws on dry
  bankroll / ineligible wallet / grant failure → no unfundable sponsored card.
- **Complete line context or no auction.** `getSponsoredLineContext` resolves
  `{sponsor, requiredCounterparty}` up front and throws if the counterparty
  can't be read; `submitLine` only executes, it no longer discovers sponsorship.
- **Service boundary + tests.** Pure decisions in `sponsorshipPolicy.ts`
  (`isSponsoredCard`, `isLineSponsored`, `sponsoredBudgetAction`), IO in
  `sponsorship.ts` with injectable `SponsorshipDeps`; orchestration tests cover
  grant-failure, partial-`/app`, counterparty-fail-closed, no-re-grant, resume.

## Implementation map

- `server/network.ts` — add `onboardingSponsor` per network.
- `server/config.ts` — add optional `BUDGET_MANAGER_PRIVATE_KEY`.
- `server/sponsorship.ts` (new) — `sponsorEligibility` (pure), `getSponsorStatus`,
  `grantBudgetIfNew`, `sponsorAddressFor`, `requiredCounterparty`.
- `server/submitLine.ts` — thread `predictorSponsor`; sponsored bids must match
  the vault counterparty; skip `prepareCollateral` when sponsored.
- `server/handler.ts` — `GET /api/sponsor/status`; `sponsored` flag on
  `/api/card/submit` (+ grant) and `/api/card/line`.
- `src/` — `useSponsorStatus` hook, skip-Fund in `MintScreen`, sponsored button +
  locked price + bypassed balance check in `CardDetailScreen`.
