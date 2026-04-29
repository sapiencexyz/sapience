# Protocol Stats — Accounting & Indexer Reference

This document is the load-bearing reference for how the per-vault protocol-stats
pipeline works after PR #1642 (`feat/vault-stats-claim-close-union`). Read this
before touching `packages/api/src/helpers/protocolStats.ts`,
`packages/api/src/workers/indexers/predictionMarketEscrowIndexer.ts`, or any of
the related migrations / scripts.

The system's job is to turn on-chain wUSDe flows + protocol events into a
per-vault, per-snapshot row in `protocol_stats_snapshot` that satisfies a
closed-form accounting identity. If the identity holds (Δ = 0), the vault's
wUSDe lifecycle is fully captured. If Δ ≠ 0, real wUSDe entered or left via a
path no leg models — that's a forensic signal, surfaced in the cron log line.

---

## 1. The accounting identity

```
balance + deployed
  = (deposits − withdrawals)              ← user-driven cash in/out
  + settlement PnL                        ← realized profit/loss
  + (secondarySold − secondaryBought)     ← net secondary-market trading
  + airdrops                              ← residual: unaccounted wUSDe arrivals
```

**LHS** is the vault's current state from on-chain sources.
**RHS** is a sum of indexed flows, each from a different DB table.

For each `(chainId, vaultAddress, timestamp)` snapshot, the cron / backfill
prints the LHS, RHS, and Δ. Non-zero Δ logs a separate `[ProtocolStats]
reconciliation Δ ≠ 0 …` line at info-level (deliberately not `error` —
cumulative-balance drift persists across snapshots, so making it loud causes
alert fatigue rather than action).

`PROTOCOL_STATS_GAP_DEBUG=1` enables a 22-line per-snapshot decomposition for
forensic backfills. Don't enable in normal cron — it's high-volume.

---

## 2. The legs, in detail

### `balance` — vault's wUSDe holdings

|                  |                                                                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source           | on-chain `wUSDe.balanceOf(vault)`                                                                                                                                                                                                                                     |
| Helper           | `fetchVaultTVLAtBlock`                                                                                                                                                                                                                                                |
| Block resolution | Phase 1 of `backfillProtocolStats` resolves every snapshot timestamp to a single block via `resolveBlocksForTimestamps` (binary search over a chunked blockspace skeleton, parallelized at `BACKFILL_BLOCK_RESOLUTION_CONCURRENCY`). Cron uses `getBlockByTimestamp`. |

### `deployed` — active counterparty stake in escrow

|        |                                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source | sum of `Prediction.counterpartyCollateral` for predictions where vault is `counterparty` AND the pickConfig is unresolved (or resolved AFTER the snapshot timestamp). |
| Helper | `fetchVaultDeployed`                                                                                                                                                  |

The protocol vault is structurally always on the counterparty side. If a vault
ever holds a predictor-side position, only its counterparty exposure shows up
here; the predictor stake is captured separately at PnL/redemption time via
`primary` (see below).

### `deposits`, `withdrawals` — user flows in/out of the vault contract

|                   |                                                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source            | `VaultFlowEvent` rows. Indexer captures `PendingRequestProcessed` (deposit) and `EmergencyWithdrawal` (withdrawal).                                                                                                                      |
| Helper            | `calculateVaultFlows`                                                                                                                                                                                                                    |
| Per-vault scoping | The migration `20260422_add_vault_address_to_vault_flow_event` added `vaultAddress` + a composite index. **The migration TRUNCATEs the table** — vault flows are re-derived from chain via `scripts/backfillVaultFlows.ts` after deploy. |

### `settlement PnL` — realized gain/loss from resolved positions

```
PnL = (union gross payouts) − (primary collateral committed)
```

#### Gross payouts (Claim ∪ Close) — the core fix

The protocol has **two disjoint** on-chain mechanisms that transfer wUSDe to a
holder via `safeTransfer`. Either can land in the vault. **Both must be summed.**

| Mechanism                            | Contract function                        | Event                                                                   | DB row  | Semantics                                                                                                                           |
| ------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Per-holder redeem (post-resolution)  | `redeem(positionToken, amount, refCode)` | `TokensRedeemed(pickConfigId, holder, …)`                               | `Claim` | One event per `redeem()` call. `holder = msg.sender`. Every holder calls their own redeem; payout is proportional to tokens burned. |
| Bilateral burn (pre/post-resolution) | `burn(BurnRequest)`                      | `PositionsBurned(pickConfigId, predictorHolder, counterpartyHolder, …)` | `Close` | One event per pickConfig, both sides burned in the same tx. Pays out to predictor-holder AND counterparty-holder simultaneously.    |

The two events never overlap: a given burn fires exactly one of them. PR #1634
used Close-only — that under-counted the protocol vault by 5208 USDe (20 Close
events / 431 USDe payouts vs the actual 100 redemptions / 5640 USDe via Claim),
flipping realized PnL from +1020 USDe to −4619 USDe and inflating the airdrop
column by 5640. The fix sums both:

```ts
grossPayouts = Σ(Claim.collateralPaid where holder = vault)
             + Σ(Close.predictorPayout where predictorHolder = vault)
             + Σ(Close.counterpartyPayout where counterpartyHolder = vault)
```

This applies to:

- `calculateVaultPnL` (async helper, used by cron path and `Query.protocolStats`).
- `calculateVaultAirdrops` (settlement-inflow leg of the residual).
- `pnlAt` and `airdropsAt` on `VaultAggregator` (in-memory, used by backfill).

#### Primary collateral committed

The cost basis is the vault's **creator-side** commitment on resolved
predictions:

```ts
primary = Σ(predictorCollateral on resolved preds where predictor = vault)
        + Σ(counterpartyCollateral on resolved preds where counterparty = vault)
```

- Filter: `pickConfiguration.resolved = true` AND `pickConfiguration.resolvedAt
≤ snapshot timestamp` AND `pickConfiguration.result ≠ UNRESOLVED`.
- **Always source `result` from `pickConfiguration` (Picks), never from
  `Prediction.result`.** A losing-side prediction often never has `settle()`
  called on it (no payout incentive), so `Prediction.result` stays UNRESOLVED
  forever; `Picks.result` is set the moment the pickConfig itself resolves.
  Filtering on `Prediction.result` would silently drop losing predictions and
  inflate apparent profit.

#### Interaction with secondary trades

If the vault sells a position on the secondary market before resolution:

- Cost stays in `primary` (vault paid at mint time).
- The eventual gross payout never lands in the vault's Claim/Close (the buyer
  redeemed).
- The sale proceeds are tracked separately in `secondarySold`.

Identity stays intact:

- LHS sees: `−primary` at mint, `+saleProceeds` at sell.
- RHS sees: `pnl = 0 − primary = −primary` AND `(sold − bought) =
+saleProceeds`.

### `secondaryBought`, `secondarySold` — net secondary trading

|           |                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source    | `SecondaryTrade` rows (written by `secondaryMarketIndexer` from `TradeExecuted` events on `SecondaryMarketEscrow`).                                                                                                                                                                                                                                                      |
| Helper    | `calculateVaultSecondaryFlows`                                                                                                                                                                                                                                                                                                                                           |
| Mechanism | `SecondaryMarketEscrow.executeTrade()` does `safeTransferFrom(buyer, seller, price)` — wUSDe goes **directly between counterparties**, not through the escrow contract. The same flow appears in `CollateralTransfer` (raw ERC-20 indexer) and `SecondaryTrade` (semantic indexer); the accounting subtracts the secondary leg from `airdrops` to avoid double-counting. |

### `airdrops` — closed-form residual

```ts
airdrop = max(0, transfersIn − explained)

transfersIn = Σ(CollateralTransfer.value where to = vault)
explained   = deposits + (gross payouts) + secondarySold
```

Clamped at 0 — a negative residual would mean indexer drift (a missing
CollateralTransfer row, etc.) and is surfaced via the `reconciliation Δ` log
line rather than as a negative chart value.

In a fully reconciled state, `transfersIn = explained` and `airdrop = 0`.

### `vaultUnredeemedClaim` — the un-redeemed-but-resolved diagnostic

|        |                                                                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source | `Σ(predictorColl + counterpartyColl)` for resolved Predictions where vault is on the winning side, minus `Σ(Claim.collateralPaid where holder = vault)`, clamped at 0. |
| Helper | `calculateVaultUnredeemedClaim`                                                                                                                                        |
| Status | **Computed and stored, NOT used in the identity.**                                                                                                                     |

This is "wUSDe sitting in escrow earmarked for the vault's wins, not yet
redeemed". It tracks the magnitude of the **transient ditch** that the chart's
`vaultRealizedPnL` exhibits between resolve-time and redeem-time:

```
T₁ (resolved, not yet redeemed):
  pnl = 0 − cpColl = −cpColl     ← looks like a loss
T₂ (redeem):
  pnl = (predColl + cpColl) − cpColl = +predColl   ← flips to gain
```

The identity reconciles to Δ = 0 at both T₁ and T₂ — but if you want the
displayed `vaultCumulativePnL` chart to **anticipate** the eventual gain (i.e.,
report on accrual basis instead of cash basis), roll
`vaultUnredeemedClaim` into the resolver's `cumulativePnL` calculation. Today
it's surfaced as a separate field in `ProtocolStat` for callers that want it.

---

## 3. Multi-vault dispatch

`getConfiguredVaults(chainId)` returns the configured vault families:

```ts
[
  {
    kind: 'protocol',
    address: contracts.predictionMarketVault[chainId]?.address,
  },
  {
    kind: 'pyth',
    address: contracts.pythPredictionMarketVault[chainId]?.address,
  },
  { kind: 'single-leg', address: contracts.singleLegVault[chainId]?.address },
  {
    kind: 'strategy-b',
    address: contracts.predictionMarketVaultStrategyB[chainId]?.address,
  },
];
```

Both `computeAndStoreProtocolStats` (cron) and `backfillProtocolStats` iterate
this list, computing one snapshot per `(vault, timestamp)`. All snapshots are
keyed by `(chainId, vaultAddress, timestamp)`.

Every per-vault helper takes `(chainId, beforeTimestamp?, vaultAddressArg?)`
and falls back to the protocol primary via `resolveVaultAddress()`.

The `Query.protocolStats` resolver takes an optional `vaultAddress` arg. When
omitted, it expands to the current primary plus every demoted-to-legacy
address, so the time series stays continuous across vault redeployments. Rows
are de-duplicated by timestamp (current-primary preferred when both exist).

---

## 4. Backfill performance: `buildVaultAggregator`

The naive loop would do `(3+ findMany × N timestamps × V vaults)` round-trips
per backfill. The aggregator amortizes this:

- One pre-fetch over every prediction touching any configured vault
  (`predictor ∈ vaults OR counterparty ∈ vaults`).
- One pre-fetch over `vaultFlowEvent`, `claim`, `close`, `secondaryTrade`,
  `collateralTransfer`, all chain-scoped.
- The aggregator returns sync closures: `deployedAt(t, vault)`, `pnlAt(t,
vault)`, `flowsAt(t, vault)`, `secondaryAt(t, vault)`, `airdropsAt(t,
vault)`, `unredeemedClaimAt(t, vault)`, `gapDecompositionAt(t, vault)` — that
  filter the prefetched arrays in JS for any `(t, vault)` tuple.
- Phase 1 resolves blocks for every timestamp in parallel
  (`BACKFILL_BLOCK_RESOLUTION_CONCURRENCY`); Phase 2 runs the per-`(t, vault)`
  snapshot work in parallel (`BACKFILL_SNAPSHOT_CONCURRENCY`). Each snapshot's
  RPC reads (vault balance, escrow balance, etc.) parallelize internally.

A 200-day × 4-hour backfill across 4 vaults completes in ~10–11 minutes against
prod RPC + DB.

---

## 5. Indexer crash-resilience (the dispatcher reorder)

`predictionMarketEscrowIndexer.ts:processLog` had two ordering models. The
**new** model is:

```
1. event.findUnique → if exists, skip (already-processed replay)
2. Run handler
   ↓ if handler crashes, no Event row gets written
3. ✓ next reconciler pass: no Event row → re-run handler
```

The old model wrote the Event row first, so a handler crash (RPC error, FK
violation on a not-yet-indexed Condition, etc.) left an orphan Event that
permanently short-circuited future reconciler passes via `event.findUnique`.

This relies on every handler being **idempotent**. The 6 PME handlers are:

| Event                 | Handler                      | Idempotency mechanism                                                                         |
| --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| `PredictionCreated`   | `processPredictionCreated`   | `findUnique` early-return + `Prediction.predictionId @unique` race safety                     |
| `PredictionSettled`   | `processPredictionSettled`   | Transition gate `updateMany({ where: { settled: false } })` — second pass returns `count = 0` |
| `TokensRedeemed`      | `processTokensRedeemed`      | `claim.upsert` keyed on `(chainId, txHash, logIndex)` unique constraint                       |
| `CollateralDeposited` | `processCollateralDeposited` | `updateMany` writes deterministic data; same-value writes are a no-op                         |
| `DustSwept`           | `processDustSwept`           | No DB writes                                                                                  |
| `PositionsBurned`     | `processPositionsBurned`     | `Close.create` with `(chainId, txHash, pickConfigId)` unique constraint + try/catch P2002     |

---

## 6. Migration order

| #   | Migration                                              | What it does                                                                                                                                                                        | Touches                   |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | `20260422000000_add_vault_address_to_vault_flow_event` | Adds `vaultAddress` + composite index. **TRUNCATEs the table.**                                                                                                                     | `vault_flow_event`        |
| 2   | `20260428000000_add_vault_secondary_flow_columns`      | Adds `vaultSecondaryBought` / `vaultSecondarySold` (default `'0'`).                                                                                                                 | `protocol_stats_snapshot` |
| 3   | `20260428000000_add_vault_unredeemed_claim_to_stats`   | Adds `vaultUnredeemedClaim` (default `'0'`).                                                                                                                                        | `protocol_stats_snapshot` |
| 4   | `20260428100000_add_log_index_to_claim_dedupe`         | Adds `Claim.logIndex`, dedupes existing duplicates by natural key, assigns negative-sentinel placeholders to legacy rows, enforces NOT NULL + unique `(chainId, txHash, logIndex)`. | `Claim`                   |

Migrations 2 and 3 share a timestamp prefix but different folder names — Prisma
orders them alphabetically (`secondary` < `unredeemed`).

---

## 7. Diagnostic and recovery scripts

All under `packages/api/scripts/`. Read-only unless flagged otherwise.

| Script                         | Purpose                                                                                                                                                                                                                                                                                                                                        | Mutates DB? |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `checkVaultTransfers.ts`       | Enumerate `wUSDe.Transfer` events FROM/TO a vault over a block range; label counterparties (escrow primary/legacy, configured vaults); print net flow.                                                                                                                                                                                         | No          |
| `checkVaultFlowConsistency.ts` | Cross-check `CollateralTransfer` against `Claim` and `VaultFlowEvent` for a window.                                                                                                                                                                                                                                                            | No          |
| `checkVaultSponsorship.ts`     | Categorize vault → escrow outflows into `primary` / `sponsorship` / `no_prediction`; useful when the reconciliation Δ has no obvious off-protocol leak.                                                                                                                                                                                        | No          |
| `recoverMissingPredictions.ts` | For orphan `Event` rows (handler crashed before writing `Picks`/`Prediction`): delete the Event, re-fetch logs from chain, dispatch through `processLog`. The new dispatcher writes Event-on-success so the recovery is permanent once the handler succeeds.                                                                                   | Yes         |
| `backfillClaimLogIndex.ts`     | Cleanup for the `Claim.logIndex` migration's negative-sentinel placeholders. Replays on-chain `TokensRedeemed` events to swap placeholders for real `logIndex` values; inserts rows that crashed mid-handler before the dispatcher reorder shipped. Idempotent. Verify with `SELECT COUNT(*) FROM "Claim" WHERE "logIndex" < 0` → should be 0. | Yes         |
| `backfillVaultFlows.ts`        | Re-derives `VaultFlowEvent` from chain after the migration TRUNCATE. Iterates every configured vault's deployment block range.                                                                                                                                                                                                                 | Yes         |

All write-side scripts are idempotent and safe to re-run.

---

## 8. Observability

### Default cron snapshot line (per `(vault, timestamp)`)

```
[ProtocolStats] protocol@0x1f5f…: balance=7638.05, available=7638.05,
  deployed=1163.39, unredeemed=137.25, pnl=1013.50 (won 118/lost 44),
  flows=+7923.47/-0, secondary=+0/-135.53, airdrop=0, reconciliation Δ=0
```

### Δ ≠ 0 line (separate, only on non-zero)

```
[ProtocolStats] reconciliation Δ ≠ 0 for protocol@0x1f5f… ts=…:
  Δ=−241.318839 USDe (LHS balance+deployed=8567.08 vs RHS=8808.40)
```

`console.log`, not `console.error` — cumulative-balance drift persists across
every subsequent snapshot, so making it loud causes alert fatigue rather than
action.

### `PROTOCOL_STATS_GAP_DEBUG=1` (verbose forensic mode)

22-line per-snapshot decomposition: every leg of the identity, plus legacy
Prediction-side stats (active stake by side, wins/losses split, claim totals,
owed pots from the prediction-view, CollateralTransfer breakdown). Written to
stdout with `[GapDebug]` prefix. Don't enable in production cron.

---

## 9. End-to-end: one mint → resolve → redeem cycle

Walk through a single counterparty win, vault holds the position from mint to
redemption:

```
T₀ (mint):
  on-chain:
    wUSDe.transferFrom(vault, escrow, cpColl)
    PME emits PredictionCreated, PickConfigCreated, CollateralDeposited
  indexer:
    CollateralTransferIndexer  → CollateralTransfer row (vault → escrow)
    PME.processPredictionCreated → Picks + Prediction rows
  identity:
    LHS: balance −cpColl  +  deployed +cpColl  →  net 0 change
    RHS: unchanged
    Δ = 0  ✓

T₁ (pickConfig resolves, vault on winning side, vault hasn't redeemed):
  on-chain: Picks.resolved = true (no wUSDe movement)
  indexer:  ConditionSettledIndexer / processPredictionSettled
            → Picks.resolved=true, Picks.resolvedAt=T₁, Picks.result=…
  identity:
    LHS: balance unchanged, deployed −cpColl. Net −cpColl from mint.
    RHS: gross_payouts still 0 (no Claim/Close yet);
         primary += cpColl  → pnl = 0 − cpColl = −cpColl
    Δ = 0  ✓ (but pnl displays a temporary "loss" — the unredeemed-claim ditch)

T₂ (vault calls redeem):
  on-chain:
    PME emits TokensRedeemed(holder=vault, collateralPaid=fullPot)
    safeTransfer(vault, fullPot)  → wUSDe lands in vault.balance
  indexer:
    PME.processTokensRedeemed → Claim.upsert
    CollateralTransferIndexer → CollateralTransfer (escrow → vault)
  identity:
    LHS: balance += fullPot. Net +predColl from initial.
    RHS: gross_payouts += fullPot (via Claim sum);
         pnl = fullPot − cpColl = +predColl  ← flips to gain
    Δ = 0  ✓
```

Throughout the lifecycle the identity holds. If at any step the indexer drops
a row, Δ surfaces it immediately on the next snapshot.

---

## 10. Production deployment runbook

Order matters. All steps are idempotent.

1. **Apply migrations.**

   ```
   pnpm --filter @sapience/api exec prisma migrate deploy
   ```

   Verify: `SELECT name FROM _prisma_migrations WHERE finished_at IS NULL` is empty.

2. **Restore `Claim.logIndex` placeholders to real values.**

   ```
   pnpm --filter @sapience/api exec tsx scripts/backfillClaimLogIndex.ts --chainId 5064014
   ```

   Verify: `SELECT COUNT(*) FROM "Claim" WHERE "logIndex" < 0` → 0.

3. **Re-derive `VaultFlowEvent`.**

   ```
   pnpm --filter @sapience/api exec tsx scripts/backfillVaultFlows.ts --chainId 5064014
   ```

   The migration TRUNCATEd this table; this re-fetches deposits/withdrawals
   from chain.

4. **Recover any orphan Event rows.**

   ```
   pnpm --filter @sapience/api exec tsx scripts/recoverMissingPredictions.ts --chainId 5064014
   ```

   Idempotent — exits cleanly if there's nothing to repair. Will FK-fail if any
   `Pick.conditionId` references a `Condition` that hasn't been ingested by the
   Polymarket sync yet; let the sync catch up and re-run.

5. **Repopulate the snapshot table under the new accounting.**

   ```
   pnpm --filter @sapience/api exec tsx src/workers/worker.ts \
     backfillProtocolStats 200 5064014 14400
   ```

   Spot-check the latest current-vault row: `vaultAirdropGains` should be `'0'`
   and `vaultRealizedPnL` should be positive.

6. **Repeat for any other configured chain** (`--chainId <other>`).

7. **Smoke test `/vaults` UI.** Chart should render; PnL line should reflect
   Claim ∪ Close + secondary trade flow; no airdrop spikes hiding settlement
   income.

8. **Optional: re-arm forensic debug** with `PROTOCOL_STATS_GAP_DEBUG=1` if you
   want to inspect the per-snapshot decomposition.

---

## 11. Known follow-up work

- **Legacy decommissioned vaults** (`0x5704…`, `0x0f24…`) have a persistent Δ
  ≈ +10k / +8k USDe each. Genesis funding via direct transfer happened BEFORE
  the `CollateralTransfer` indexer's `blockCreated`, so `transfersIn = 0` for
  those periods even though `balance > 0`. Fix is either to backfill
  `CollateralTransfer` from earlier blocks or hardcode a per-vault
  `genesisBalance`. Not urgent — these vaults are decommissioned.

- **Polymarket Condition sync gaps.** The `recoverMissingPredictions.ts`
  recovery requires the referenced `Condition` rows to exist. The 4 missing
  Predictions identified during the merge (2026-04-28) referenced 10 Condition
  IDs that the Polymarket sync hadn't ingested. Worth tracking down the filter
  / window bug in whatever job creates Condition rows so this class of "minted
  on a not-yet-indexed condition" stops happening.

- **`vaultCumulativePnL` accrual basis.** Today the chart shows cash-basis
  (gain at `redeem()`). Adding `vaultUnredeemedClaim` to the resolver's
  `cumulativePnL` would smooth out the "ditch and recover" pattern between
  resolve-time and redeem-time. Pure UX choice — the underlying math is
  identical.

- **Δ ≠ 0 alerting.** Today this is a `console.log` to avoid alert fatigue
  from cumulative drift. A "delta-of-delta" implementation (alert only on
  _change_ in Δ, not on persistent imbalance) would surface new leaks
  promptly without spamming on known steady-state ones.

---

## 12. Glossary

- **Pick** — a single prediction `(conditionResolver, conditionId,
predictedOutcome)`.
- **Pick configuration** (`Picks` model, also called "pickConfig") — set of
  picks that share fungible position tokens, identified by `pickConfigId =
keccak256(picks)`. One `Picks` row may have many `Prediction` rows.
- **Prediction** — individual prediction with unique `predictionId =
keccak256(pickConfigId, predictor, counterparty, nonce)`. Stores who paid
  what at mint time and the parameters of the deal.
- **Position token** — ERC-20 representing a share in a `Picks` collateral
  pool. Two per pickConfig: predictor-token + counterparty-token. Holders can
  call `redeem()` after resolution.
- **Resolver** — contract implementing `IConditionResolver` that resolves a
  condition to an outcome vector.
- **Settlement** — calling `settle(predictionId)` flips
  `Prediction.settled = true` and emits the realized result. Required to
  redeem; only winning predictions get settled in practice.
- **Resolution** — `Picks.resolved = true` happens the moment any `settle()`
  call succeeds within the pickConfig (or via the resolver chain). Distinct
  from per-prediction settlement.
