# Admin-Managed Sponsorship — Plan

> Supersedes the auto-grant ("first card free") design in
> [`SPONSORSHIP_PLAN.md`](./SPONSORSHIP_PLAN.md). That doc describes the system
> this plan **replaces**: automatic, uniform, server-signed onboarding grants.
> Read this for the new admin-curated model.

## Goal

Move sponsorship out of the automatic play flow and into the `/admin` panel.
An admin signs in, grants a specific **player smart account** a specific
**amount**, and that account plays bingo for free until that budget is spent.
The panel also shows the sponsor contract's bankroll and a history of grants +
whether each address has used its funds.

## What changes vs today

|                       | Current (auto-grant)                    | This plan (admin-managed)                    |
| --------------------- | --------------------------------------- | -------------------------------------------- |
| Who triggers a grant  | Any new player, automatically on submit | Admin only, per address                      |
| Amount                | Hardcoded 10 USDe, one card             | Admin-chosen, whole 10-USDe increments       |
| Who signs `setBudget` | Server (`BUDGET_MANAGER_PRIVATE_KEY`)   | Admin's connected wallet                     |
| Visibility            | None                                    | Bankroll + grant history + usage in `/admin` |
| Admin sign-in         | Treasury wallet only                    | Treasury + sponsor roles + optional env list |

## On-chain facts this relies on (`OnboardingSponsor.sol`)

- **Shared instance** — bingo reuses the same `OnboardingSponsor` as `/app`
  (one address per chain in the SDK registry). We stay on it; `/app`'s
  onboarding sponsorship is effectively unused, so there's no live grant flow to
  protect and no need to deploy a dedicated instance.
- `setBudget(beneficiary, allocated)` — **absolute** (overwrites `allocated`,
  never touches `used`). Callable by `budgetManager` **or** `owner`. Emits
  `BudgetSet(beneficiary, allocated)`.
- Funds actually spent emit `Sponsored(predictor, collateral, escrow)`; a live
  `budgets[addr]` read gives `{allocated, used}`.
- `matchLimit` = **1 USDe per mint**. One bingo line = one mint, 10 lines/card,
  so a card's per-line stake ≤ 1 USDe → **a 10-USDe card is the ceiling**. We do
  **not** raise `matchLimit` (it's a shared risk control). Bigger "amounts" are
  therefore expressed as _more standard cards_, never one bigger card.

## Resolved decisions

| #   | Decision                     | Choice                                                                                                                                                                                                                                                |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Auto vs manual               | Manual only; remove auto-grant                                                                                                                                                                                                                        |
| Q2  | What "amount" buys           | A balance → N standard 10-USDe cards; no shared-contract changes                                                                                                                                                                                      |
| Q3  | Who signs grants             | Admin's connected wallet (`budgetManager` or sponsor `owner`)                                                                                                                                                                                         |
| Q4  | Shared vs dedicated contract | Shared instance (`/app` usage is dead)                                                                                                                                                                                                                |
| Q5  | Amount semantics             | Raw absolute `setBudget`; preview `{allocated, used, remaining}` before sign                                                                                                                                                                          |
| Q6  | History source               | `getLogs(BudgetSet)` from a start block, via server endpoint                                                                                                                                                                                          |
| Q7  | Out-of-pocket while funded   | No — budget first; house-funds standard cards until dry                                                                                                                                                                                               |
| Q8  | Bankroll                     | Display balance + copyable address + "send wUSDe" hint                                                                                                                                                                                                |
| —   | Grant granularity            | Whole 10-USDe increments (keeps each card all-or-nothing sponsored)                                                                                                                                                                                   |
| —   | Multiple panel admins        | _Viewing_ is multi-wallet (SIWE allowlist: receipt `owner()` + sponsor `budgetManager()` + sponsor `owner()` + optional view-only `ADMIN_ADDRESSES`). _Granting_ is single-wallet (one `grantWallet` EOA as `budgetManager`); multisig granting is v2 |
| —   | Grant target address         | Budgets keyed by **smart account**; admin enters EOA → derive SA via `computeSmartAccountAddress`; show both; optional "use as smart account" override                                                                                                |
| —   | Re-grant UX                  | Before/after preview of `{allocated, used, remaining}` (absolute overwrite semantics)                                                                                                                                                                 |
| —   | Legacy odd allocations       | No server guard; admin form enforces multiples of 10 going forward                                                                                                                                                                                    |
| —   | Player copy                  | "Sponsored — no deposit needed" (+ show remaining balance where useful)                                                                                                                                                                               |
| —   | History scope                | All addresses ever granted (`BudgetSet` log); include "played?" (`used > 0`); no pagination                                                                                                                                                           |
| —   | Grant button                 | Preflight: disabled unless connected wallet is `budgetManager` or sponsor `owner`                                                                                                                                                                     |
| —   | Log scan floor               | Per-network `sponsorLogFromBlock`; defaults to `logFromBlock` (not sponsor `blockCreated`)                                                                                                                                                            |

## Admin auth model

Two separate capabilities:

1. **Panel access** (SIWE / static token) — view entitlements, sponsorship
   history, bankroll. Allowed wallets:

   - Receipt contract `owner()` (treasury — pays bonuses today)
   - `OnboardingSponsor.budgetManager()` (read from chain at login)
   - `OnboardingSponsor.owner()` (if different)
   - Optional comma-separated `ADMIN_ADDRESSES` env — **view-only extras**
     (a teammate who holds no on-chain role and shouldn't sign grants; adds
     viewers without a redeploy). Grants no signing power.
   - Static `ADMIN_TOKEN` unchanged (scripts/curl)

2. **Grant signing** (on-chain) — `setBudget` via connected wallet. Only
   `budgetManager` or sponsor `owner` can sign. The grant button is disabled
   with an explanation when the connected wallet lacks either role.

   **Granting is effectively single-wallet.** The contract has exactly one
   `budgetManager` slot and one `owner`, and the UI signs via wagmi
   `useWriteContract` from a single connected EOA. So pick **one `grantWallet`
   EOA** as `budgetManager`; many admins can _view_ (allowlist above), but grants
   come from that one wallet (`owner` as backup). A **multisig `budgetManager`
   does not work with this UI** — a Safe needs a multi-sig transaction, not a
   single `useWriteContract` call, and can't produce a personal SIWE signature
   for login. Multi-human grant _approval_ is a Safe-transaction flow — explicit
   v2, out of scope here.

## Grant address flow

On-chain budgets are keyed by the player's **ZeroDev smart account** (the
`player` field on submit), not their EOA. The SA is deterministically derived
from the EOA via `computeSmartAccountAddress(eoa)` from `@sapience/sdk/session`
— same as `SetupWizard`.

**Default admin flow:**

1. Admin enters player **EOA**
2. UI derives and displays **smart account** (the actual grant target)
3. `setBudget(smartAccount, amountWei)` is signed from the connected wallet

**Override:** checkbox "Use address as-is (smart account)" when the admin
already has the SA address.

History table shows the smart account (grant target). If the grant was entered
via EOA, show both when known (EOA is client-side metadata only — on-chain
events key by SA).

## Re-grant preview (absolute semantics)

`setBudget` sets **total allocated**, not "add this much", and never resets
`used`. Example trap:

| Step                               | allocated | used | remaining |
| ---------------------------------- | --------- | ---- | --------- |
| Granted 30, played 2 cards         | 30        | 20   | 10        |
| Re-grant 20 (meant "give 20 more") | **20**    | 20   | **0**     |

The grant form must show **before** and **after** preview:

- Current: `{allocated, used, remaining}`
- After grant: `{newAllocated, used, newRemaining}` where
  `newRemaining = max(0, newAllocated - used)`

No hard block on re-grants — the preview is the guard.

## Work breakdown

### Phase 0 — One-time on-chain setup (ops, before or alongside deploy)

1. Call `setBudgetManager(grantWallet)` on `OnboardingSponsor` (staging + main).
   Owner role can also sign `setBudget` until this is done.
2. Fund sponsor contract with wUSDe as needed.
3. Set `sponsorLogFromBlock` when admin grants go live if receipt deployed
   earlier — **defaults to `logFromBlock`** (same tight window as other scans;
   never the sponsor's `blockCreated`, which spans ~1M blocks on main and trips
   RPC getLogs range caps). The `allocated >= 10` filter drops /app noise.

### Phase 1 — Server policy + tests

**`server/sponsorshipPolicy.ts`**

- `sponsorEligibility` → `bankroll >= price && remaining >= price` (drop
  `allocated === 0` auto-grant arm)
- `isSponsoredCard` → `allocated >= SPONSORED_CARD_PRICE_WEI` (was `===`)
- `sponsoredBudgetAction` → verify-only: `ok` if `remaining >= price`, else
  `reject` (remove `grant` arm)

**`server/sponsorship.ts`**

- Remove `setBudgetConfirmed`, `budgetManagerClient`, `BUDGET_MANAGER_PRIVATE_KEY`
- `ensureSponsoredBudget` → verify-only (throws if `remaining < price`)
- `isSponsorshipEnabled` → `sponsorAddress(network) !== null`
- Drop `setBudget` from `SponsorshipDeps`
- Add `listSponsorships(network)` helper for admin endpoint (log scan + live reads)

**`server/adminAuth.ts`**

- `resolveAdminAddresses(network)` → allowlist (treasury + sponsor roles + env)
- `siweLogin` accepts any allowlisted wallet

**`server/config.ts`**

- Remove `BUDGET_MANAGER_PRIVATE_KEY`
- Add optional `ADMIN_ADDRESSES` (comma-separated)

**`server/network.ts`**

- Add `sponsorLogFromBlock` per network — **defaults to `logFromBlock`** (tight
  scan window; never sponsor `blockCreated` — ~940k+ blocks on main trips RPC
  range caps). Ops may tighten further at go-live if receipt predates grants.

**Tests — `server/__tests__/sponsorship.test.ts`**

- Update eligibility / recognition / budget-action cases
- Verify-only submit rejects un-granted wallet
- Multi-card burn-down: grant 30 → three sponsored cards → fourth rejected
- Multi-card `isSponsoredCard` with `allocated=30`, mid-burn

### Phase 2 — Admin API

**`server/handler.ts`**

- `GET /api/admin/sponsorships` (gated by `isAdmin()`):
  - `getLogs(BudgetSet)` from `sponsorLogFromBlock`
  - Dedupe to latest event per beneficiary address
  - Live-read `budgets[addr]` for each
  - **Filter to `allocated >= SPONSORED_CARD_PRICE_WEI`** — `/app`'s legacy grants
    are all 1 USDe while bingo grants are ≥10-USDe multiples, so this drops
    onboarding noise _regardless of the floor block_. This is why the
    `sponsorLogFromBlock` placeholder is safe even before ops sets the real value.
  - Return bankroll + rows: `{ smartAccount, allocatedWei, usedWei, remainingWei, played }`
  - Pure RPC, no DB

### Phase 3 — Admin UI (`src/screens/AdminScreen.tsx`)

New **Sponsorships** section (below entitlements):

- **Bankroll block**: wUSDe balance, full sponsor address + copy button, hint
  _"Send wUSDe to this address to add funds."_
- **Grant form**:
  - `Player wallet (EOA)` input → derived `Grant target (smart account)` display
    (both visible). Copy note: _paste an EOA — if you have the smart account,
    tick the override below_ (pasting an SA without the override derives
    SA-of-SA and grants the wrong address; the before/after preview, showing an
    unexpectedly empty target, is the backstop).
  - "Use address as-is (smart account)" override checkbox
  - `Amount — USDe, multiples of 10` (validate: > 0, multiple of 10 USDe)
  - Live read of current `{allocated, used, remaining}` for grant target
  - Before/after preview on amount change (labeled `Current` / `After grant`)
  - Preflight: read `budgetManager()` + `owner()` from sponsor; disable grant
    button + show reason if connected wallet lacks role
  - Sign `setBudget(smartAccount, amountWei)` via wagmi `useWriteContract`
- **History table**: columns `Grant target` · `Allocated` · `Used` · `Remaining`
  · `Status`. Status shows `used / allocated` (e.g. `20 / 30 USDe`) with a
  `✓ played` / `— unused` tag — richer than a bare boolean.

Reuse existing SIWE sign-in; sponsorship history fetch uses same bearer token.

### Phase 4 — Player UI copy

- `SetupWizard` / `CardSubmitControls`: replace "first card on us" with
  **"Sponsored — no deposit needed"**; show remaining balance where useful
  (from existing `useSponsorStatus` / `remainingWei`)

### Phase 5 — Config cleanup

- Update `.env.server.example` (remove budget-manager key, document
  `ADMIN_ADDRESSES`)
- Remove `BUDGET_MANAGER_PRIVATE_KEY` from deploy env

## Deployment sequence

1. **On-chain:** `setBudgetManager(grantWallet)` + fund sponsor (can lag code
   briefly — sponsor `owner` can grant in the interim)
2. **Deploy code:** auto-grant removed; server no longer needs budget-manager key
3. **Set `sponsorLogFromBlock`** when ready (history fills in retroactively)
4. **Admin grants** players via `/admin`

## Key implementation risk

The stateless **recognition** of "is this card house-funded?" must stay stable
across a card's 10 lines and survive reloads. Today's stable signal is
`allocated === 10`. The replacement is `allocated >= 10` **plus** the
whole-10-USDe grant rule — without that rule, a non-multiple grant (e.g. 15)
could leave a card half-sponsored / half-paid. Enforce the multiple-of-10
validation on the admin grant form. Legacy odd on-chain allocations are accepted
as-is (no server guard).

Submit gate (`remaining >= 10`) and line gate (`remaining >= stakePerLineWei`)
together prevent starting a new sponsored card without enough budget, even when
`allocated >= 10`.

## Out of scope

- Pagination / filtering on grant history
- Server-side validation of grant amounts (grants are wallet-signed, not server-initiated)
- Dedicated bingo sponsor contract deployment
- Raising `matchLimit`
