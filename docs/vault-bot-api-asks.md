# Vault-bot → Sapience API: data-layer

**TL;DR:** Almost everything vault-bot needs already exists on `positions` / `conditions`. We're
over-fetching because we aren't *using* the existing filters, not because they're missing. The only
genuine API gap is an **`isPredictorToken` filter on `positions`**. The rest is vault-bot-side
migration — recorded here so the API team can confirm the relevant fields are index-backed.

---

## Already supported — vault-bot will migrate to these (no API work)

`positions(...)` already accepts (`packages/api/src/graphql/sdl/schema/schema.graphql:1583`):
`conditionId`, `settled: Boolean`, `result: SettlementResult`, `pickConfigId`, `holderWon`,
`endsAtMin/Max`, `collateralMin/Max`, `orderBy`/`orderDirection`, `holder`, `take`/`skip`.

- **Open positions** → use `settled: false`. Replaces vault-bot's fetch-all-then-filter
  (`paginated-positions.ts` 5000-cap + client-side `!resolved`) and retires the `result: null`
  overload for "open."
- **Per-market exposure** → use `conditionId`. Replaces fetching all positions and matching
  `pickConfig.picks` client-side.
- **Claimable** → `result: COUNTERPARTY_WINS` (already used by vault-claimer).

`conditions(... where: ConditionWhereInput)` already supports `id: { in: [...] }` (`StringFilter.in`),
`endTime`, `public`, `settled`, `conditionGroupId`, `AND`/`OR`, plus a `cursor`:

- **Batch condition lookup** → `conditions(where: { id: { in: [...] } })`. Replaces the per-leg /
  per-position `getConditionById` N+1.
- We are **not** asking for a `similarMarkets` filter — in practice every linked condition has a
  single `polymarket.com` URL, so it would be a no-op.

---

## The one real ask

**Add `isPredictorToken: Boolean` as a filter arg on `positions(...)`.** Today it's a returned field
(`schema.graphql:1345`) but not a filter. The vault holds **both** sides: counterparty/maker tokens
(its market-making exposure) *and* predictor-side tokens bought via the secondary-bidder. The hot
exposure path wants maker-side only (`isPredictorToken: false`); we filter client-side today. A
server filter lets the open-exposure read be fully server-scoped:
`positions(holder, settled: false, isPredictorToken: false)`.

---

## Please confirm (indexing)

We're about to query `positions(holder, settled: false, conditionId: ...)` on the hot path. Please
confirm these are **index-backed** — ideally composite indexes on `(holder, settled)` and
`(holder, conditionId)` — so the filters don't degrade to scans at scale. If `isPredictorToken`
becomes a filter, include it in the composite.

---

## Minor / optional

`positions` paginates with `skip`/`take` (no cursor / `totalCount`); `conditions` already has a
cursor. Cursor + `totalCount` on `positions` would let us page deterministically and drop our
5000-row client cap entirely — but with `settled: false` + `conditionId` the result sets are small,
so this is low priority.
