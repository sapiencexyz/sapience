# Vault-bot → Sapience API: data-layer asks

Context: vault-bot is going to production and several hot paths currently **over-fetch and filter
client-side** because the server-side filter/pagination isn't available (or we aren't using it).
These are the API changes that would let us stop brute-forcing. Shapes below are proposals — map
them to the actual schema as you see fit. Each ask cites the vault-bot code that forces the
workaround today (paths are in `sapiencexyz/vault-bot`).

---

## Live asks (we're acting on these now)

### 1. `positions` — server-side filtering + cursor pagination + total count

**Today:** vault-bot pages **every position a vault has ever held** (settled + open, predictor +
counterparty) and filters in JS. It uses a holder-only query with `take/skip`, capped at
**5000 rows** (`PAGE_SIZE 100 × MAX_PAGES 50`, `src/shared/effects/http/paginated-positions.ts:4-5`),
then drops predictor tokens client-side (`position-cache.ts:47`) and resolved positions in each
consumer. Open exposure is a tiny fraction of lifetime positions, so this is mostly wasted transfer
— and past 5000 lifetime rows, open positions can fall off the tail and we **silently under-count
live vault exposure** (no error on truncation).

Today the only way to ask for open positions is `positions(holder, result: null)` — overloading
`null` to mean "unsettled." That's ambiguous (null reads as "no filter" / "unknown" / "open") and
error-prone. We want an **explicit** open-state filter and the path to be the complete, efficient one:

- **Add an explicit open/settled filter** instead of `result: null` — e.g. `status: OPEN | SETTLED`
  (enum) or `settled: Boolean`. Keep `result` (`COUNTERPARTY_WINS` / `PREDICTOR_WINS`) for the
  *settled sub-state*; "open" should not be expressed as the absence of a result. Our hottest read
  is "all open counterparty positions for this vault," and it should say exactly that.
- **Guarantee the open/settled and `result` filters are index-backed** (open-only / claimable
  without a full-history scan).
- **Add a token-type filter**, e.g. `isPredictorToken: Boolean`, so we can request counterparty-only
  (or both) instead of fetching both and filtering client-side.
- **Add a condition / group filter**, e.g. `conditionId_in: [String!]` (and/or `conditionGroupId_in`),
  so we can read exposure for just the markets a quote touches instead of the whole book.
- **Cursor pagination + total count** — `{ items, pageInfo { endCursor, hasNextPage }, totalCount }`
  — so results are deterministically bounded (no magic 5000 cap) and pageable in parallel.

### 2. `conditions` — server-side `similarMarkets` filter + batch-by-id

**Today (filter):** vault-bot fetches **all** active public unsettled conditions, then filters
`similarMarkets` for `"polymarket.com"` **in JS** (`src/shared/effects/http/sapience-queries.ts:144-146`).
Every non-Polymarket active condition is downloaded and discarded.
→ **Add a server-side predicate**: `similarMarkets: { contains: "polymarket.com" }` or a
`hasPolymarketMarket: Boolean` flag on the `conditions` `where`.

**Today (batch):** `getConditionById` is called **once per leg per quote**
(`fair-price.ts`, `fixed-edge.ts:45`) and **N positions × M legs** on the MTM path
(`inventory-pricing.ts`). A cold N-leg parlay is N separate round-trips.
→ **Support batch lookup** returning the same fields as `condition(id:)` for
`conditions(where: { id: { in: [...] } })` (the same field set we use today: `conditionGroupId`,
`conditionGroup.negRisk`, `similarMarkets`, `endTime`, `public`, `question`).

---

## Heads-up / likely-later (not building yet — flagging so it informs design)

- **`vaultExposure` aggregate** — a server-side aggregate of *open* counterparty collateral keyed by
  the quote's touched conditions/groups (`{ byCondition { conditionId, counterpartyCollateral,
  positionCount }, byConditionGroup { ... } }`), so we don't transfer + rescan unrelated open rows
  for concentration/utilization. Ask #1's `conditionId_in` filter is the minimum-viable version of
  this; the aggregate is the fuller form. Lower priority for now.
- **Indexed latest-prediction by address** — our auction cooldown calls
  `predictions(address, take:1, orderBy: CREATED_AT desc)` per inbound auction. If it stays in prod
  it must be an O(log n) indexed lookup (index on `(address, createdAt desc)`), or a small
  `latestPrediction(address)` field. We may remove this caller entirely, so don't prioritize.
- **Per-operation cost/freshness metadata** — a response extension carrying `indexedAt` /
  source-data timestamp (and optionally resolver cost / row count) so clients can detect stale reads
  and fail-closed. (We saw the cooldown silently trust hours-stale index data; freshness metadata is
  what makes that visible.) Persisted/allowlisted operations would be a nice prod-hardening too.

---

## Priority

| Ask | Priority | Notes |
|-----|----------|-------|
| 1. positions: explicit open filter + token/condition filters + cursor + count | **P0** | unblocks open-only reads; removes the 5000-cap truncation risk and the `result:null` overload |
| 2a. conditions: server-side similarMarkets filter | P1 | kills a client-side fetch-then-filter |
| 2b. conditions: batch by `id_in` | P1 | collapses per-leg/per-position N+1 |
| vaultExposure aggregate | later | `conditionId_in` (ask 1) is the MVP |
| indexed latest-prediction | later | may remove the caller |
| operation cost/freshness metadata + persisted queries | later | observability / fail-closed |
