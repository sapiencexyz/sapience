# Sapience GraphQL API — migration guide

A running log of API changes that downstream services should adopt. Entries are reverse-chronological; the section header is the canonical name a downstream LLM/engineer should grep for.

---

## `PositionFilters.balance` / `PositionFilters.collateral` — operator-pattern numeric filters on positions queries

### TL;DR

Two new optional fields on `PositionFilters`:

- **`balance: BigIntFilter`** — strict numeric filter on `Position.balance` (wei). Supported operators: `equals`, `gt`, `gte`, `lt`, `lte`. New.
- **`collateral: BigIntFilter`** — same shape, on the holder's collateral on the pickConfig. Replaces the flat `collateralMin: String` / `collateralMax: String` pair.

The flat `collateralMin` / `collateralMax` args are now `@deprecated`. They keep working for one release; migrate at your convenience.

`BigIntFilter` is the existing Prisma-style filter input (`{ equals, gt, gte, lt, lte, in, notIn, not }`); we wire up the common comparators and reject `in` / `notIn` / `not` at the resolver with a clear error message. They are accepted by the input type only because the surface is shared with Prisma CRUD inputs; treat them as "not yet supported" until a use case lands.

### Why the operator pattern, not flat `<field>Min` / `<field>Max`

- Composable. `{ balance: { gte: "1", lte: "1000000000000000000" } }` is one filter object; the flat form would need `balanceMin: "1", balanceMax: "1000…"` plus per-operator naming bikeshed.
- Extensible. Adding `gt` / `lt` / `equals` doesn't grow the arg surface combinatorially.
- Matches the Prisma / Hasura / Linear convention. Most modern GraphQL APIs surface comparator-style filter inputs this way.

`endsAtMin` / `endsAtMax` (on `PredictionFilters`) and other flat `<field>Min/Max` pairs across the schema follow the same migration path in a separate PR.

### Strict semantics — no implicit OR

A row is kept iff its balance satisfies **every** operator on the filter. There is no permissive "OR resolved" magic — `{ balance: { gte: "1" } }` excludes claimed winners (resolved, zero-balance) because their raw balance fails the predicate. This is a deliberate departure from the implicit-OR semantic that the unshipped `balanceMin` arg carried during PR review.

To get "open positions + recently-claimed winners" in one result set, either:

- **Omit the balance filter entirely** and let the FE display the full set, or
- **Issue two queries** — one with `balance: { gte: "1" }` for open positions, one with `settled: true` for resolved winners — and merge client-side.

Synthesized per-sell CLOSED rows (the `balance: "0"` event rows recording realized PnL from secondary-market sells) follow the same strict rule: they're emitted iff `0` satisfies the filter (so `{ equals: "0" }` keeps them, `{ gte: "1" }` suppresses them).

`PositionsPage.totalCount` honors the same filter via the lazy `_countWhere` plumbing, so pagination stays consistent.

### Why `BigIntFilter` (and not `StringFilter`)

`Position.balance` is wei. 1 ETH = `10**18` wei = exceeds JS `Number.MAX_SAFE_INTEGER` (`2**53`) by 5 orders of magnitude. The `BigInt` scalar (graphql-scalars `BigIntResolver`) accepts string / number / bigint on the wire and parses to a JS `bigint` at the resolver. The values round-trip safely at every layer.

### Usage — preferred

```graphql
query OpenPositions($holder: String!) {
  positionsPage(filters: { holder: $holder, balance: { gte: "1" } }, take: 50) {
    hasMore
    totalCount
    items {
      id
      balance
      pickConfig {
        resolved
      }
    }
  }
}
```

Combine operators on the same filter for a range:

```graphql
query DustyPositions($holder: String!) {
  positionsPage(
    filters: {
      holder: $holder
      balance: { gte: "1", lte: "1000000000000000000" } # 1 wei to 1 ETH
    }
    take: 50
  ) {
    items {
      id
      balance
    }
  }
}
```

### Migration: `collateralMin` / `collateralMax` → `collateral: { ... }`

**Before** (still works for one release with `@deprecated` notices):

```graphql
positionsPage(
  filters: { holder: $holder, collateralMin: "100", collateralMax: "1000" }
  take: 50
) { items { id } }
```

**After**:

```graphql
positionsPage(
  filters: { holder: $holder, collateral: { gte: "100", lte: "1000" } }
  take: 50
) { items { id } }
```

When both shapes are set on the same input, the new `collateral` filter wins; the deprecated flat args are ignored.

### `positionCount` — no balance filter

`positionCount` no longer accepts a balance bound. Use `positionsPage(filters: { balance: ... }, take: 1).totalCount` instead — same count, lazy, and consistent with the list query.

---

## `predictionsPage` — paginated escrow predictions, replaces `predictions`

### TL;DR

Three additive changes:

1. **`predictionsPage`** is the canonical query for escrow predictions. The bare `predictions` query is now `@deprecated`. Migrate at your convenience; `predictions` continues to work and returns identical data.
2. **`PredictionsPage.totalCount: Int`** is new and lazy. Selecting it issues a single `COUNT(*)` server-side; not selecting it costs nothing. Use this instead of `predictionCount` (also deprecated).
3. **`pickConfigurationsPage`** mirrors the same shape for pick configurations. The bare `pickConfigurations` query is now `@deprecated`.

Nothing breaks today. All deprecated queries continue to return the same payload; introspection emits deprecation notices.

### Migration: `predictions` → `predictionsPage`

**Before**

```graphql
query MyForecasts($address: String!) {
  predictions(address: $address, take: 50, skip: 0) {
    id
    predictionId
    settled
  }
}
```

**After**

```graphql
query MyForecasts($address: String!) {
  predictionsPage(address: $address, take: 50, skip: 0) {
    hasMore
    items {
      id
      predictionId
      settled
    }
  }
}
```

Pagination rule: prefer `hasMore` over `items.length === 0` as the stop signal.

### Migration: `predictionCount` → `predictionsPage(...).totalCount`

**Before**

```graphql
query MyForecastsCount($address: String!) {
  predictionCount(address: $address)
}
```

**After**

```graphql
query MyForecastsCount($address: String!) {
  predictionsPage(address: $address, take: 1) {
    totalCount
  }
}
```

`totalCount` is **lazy** — `prisma.prediction.count(...)` only fires when the field is selected, so other page requests pay nothing for it.

### Migration: `pickConfigurations` → `pickConfigurationsPage`

**Before**

```graphql
query Combos($tokens: [String!]) {
  pickConfigurations(tokens: $tokens, take: 100) {
    id
    picks {
      conditionId
    }
  }
}
```

**After**

```graphql
query Combos($tokens: [String!]) {
  pickConfigurationsPage(tokens: $tokens, take: 100) {
    hasMore
    items {
      id
      picks {
        conditionId
      }
    }
  }
}
```

### Reference

- Resolver source: [`packages/api/src/graphql/sdl/resolvers/queries/escrow.ts`](src/graphql/sdl/resolvers/queries/escrow.ts) (`runPredictions`, `runPickConfigurations`)
- Field resolver: [`packages/api/src/graphql/sdl/resolvers/PredictionsPage.ts`](src/graphql/sdl/resolvers/PredictionsPage.ts) — lazy `totalCount`
- Deprecated wrappers: [`packages/api/src/graphql/sdl/resolvers/queries/deprecated/escrow.ts`](src/graphql/sdl/resolvers/queries/deprecated/escrow.ts)
- SDL: [`packages/api/src/graphql/sdl/schema/schema.graphql`](src/graphql/sdl/schema/schema.graphql) (search `PredictionsPage`, `PickConfigurationsPage`)

---

## `positionsPage` — paginated V2 holdings, replaces `positions`

### TL;DR

Three additive changes:

1. **`positionsPage`** is the canonical query for V2 position holdings. The bare `positions` query is now `@deprecated`. Migrate at your convenience; `positions` continues to work and returns identical data.
2. **`PositionsPage.totalCount: Int`** is new and lazy. Selecting it issues a single `COUNT(*)` server-side; not selecting it costs nothing. Use this instead of `positionCount`.
3. V1 (NFT-based) **`LegacyPosition.predictions`, `LegacyPrediction.position`, `LegacyPrediction.limitOrder`, `LimitOrder.predictions`** are now `@deprecated`. Use `positionsPage` for holdings.

One server-side behavior change:

- **`positionsPage(skip: $skip)` is now clamped at 10_000** (was unbounded). Larger values are silently truncated. At default `take: 50` that's 200 pages deep — well past any realistic FE use case.

Nothing breaks today. The bare `positions`, `positionCount`, and V1 fields all continue to work; introspection emits deprecation notices.

---

### Migration: `positions` → `positionsPage`

**Before**

```graphql
query MyHoldings($holder: String!) {
  positions(holder: $holder, take: 50, skip: 0) {
    id
    balance
    userCollateral
    pickConfig {
      id
      resolved
    }
  }
}
```

**After**

```graphql
query MyHoldings($holder: String!) {
  positionsPage(holder: $holder, take: 50, skip: 0) {
    hasMore
    items {
      id
      balance
      userCollateral
      pickConfig {
        id
        resolved
      }
    }
  }
}
```

Two changes:

- The result is wrapped: `items: [Position!]!` plus `hasMore: Boolean!`.
- **Use `hasMore` as the pagination stop signal, not `items.length === 0`.** The resolver synthesizes one synthetic "Closed" row per secondary sell (in addition to the open balance row), and a zero-balance unresolved position with no sells emits zero rows. So a page can legitimately come back empty while there are still rows beyond. The `hasMore` flag is server-truth — it's `true` iff the next page exists.

---

### Migration: `positionCount` → `positionsPage(...).totalCount`

**Before**

```graphql
query MyHoldingsCount($holder: String!) {
  positionCount(holder: $holder)
}
```

**After**

```graphql
query MyHoldingsCount($holder: String!) {
  positionsPage(holder: $holder, take: 1) {
    totalCount
  }
}
```

Notes:

- `totalCount` is **lazy** — the server only runs `COUNT(*)` when the field is selected. Pages that don't ask for it pay zero count cost.
- You still pass `take` (use `take: 1` if you want only the count); the page query needs a take/skip pair.
- `totalCount` is the count of **underlying Position rows** matching the filters, **not** the count of rendered event-stream rows. The two differ because each secondary sell becomes its own synthetic row. If your UI shows a count of "rows visible to the user", `items.length` after pagination is what you want; if it shows "positions held", `totalCount` is correct.

---

### V1 (LegacyPosition) deprecations

The V1 NFT-based holdings surface is being phased out. The following fields are now `@deprecated`:

| Field                         | Reason               | Replacement               |
| ----------------------------- | -------------------- | ------------------------- |
| `LegacyPosition.predictions`  | V1 holdings model    | `positionsPage`           |
| `LegacyPrediction.position`   | V1 holdings model    | `positionsPage`           |
| `LegacyPrediction.limitOrder` | LimitOrder phase-out | none — feature deprecated |
| `LimitOrder.predictions`      | LimitOrder phase-out | none — feature deprecated |

If your operations select any of these, the GraphQL introspection result includes a deprecation notice.

---

### `Page` interface

All `*Page` wrappers in the API implement a shared interface:

```graphql
interface Page {
  hasMore: Boolean!
  totalCount: Int
}
```

You can fragment on `Page` to read `hasMore` / `totalCount` generically (useful when you have a generic pagination wrapper component), and on the concrete type (`PositionsPage`, etc.) for the typed `items` list. `items` is intentionally not on the interface because each concrete page exposes a different row type.

---

### Filter-arg convention

The `*Page` queries take filter args in one of two shapes:

- **Flat top-level args** — for surfaces whose filter primitives are
  semantically distinct query knobs (e.g. `predictionsPage(address:, chainId:, conditionId:, settled:, …)`). Most pages use this.
- **`filters: <X>Filters`** — for surfaces with an open-ended typed filter struct that's expected to evolve (e.g. `conditionsPage(filters: ConditionFilters, …)`, `conditionGroupsPage(filters: ConditionGroupFilters, …)`, `accountStatsLeaderboardPage(filters: AccountStatsFilters, …)`). The wrapper lets us add filter fields without churning the resolver signature.

Don't mix the two on a single query. When in doubt, prefer the flat form for ≤3 filter scalars; introduce a `<X>Filters` input when the filter surface is likely to grow past that.

---

### Behavior change: `skip` cap

`positionsPage(skip: $skip)` now applies a server-side ceiling of `skip ≤ 10_000`. Values above the cap are silently truncated to 10_000.

Why: previously unbounded, so a client passing `skip: 5_000_000` would force Postgres to scan and discard 5M rows on every call. The 10_000 cap is a defensive safety net — at `take: 50` that's 200 pages of holdings, well past any realistic FE pagination depth.

If your service genuinely needs deeper pagination, file a ticket so we can add cursor-based pagination on a stable `(createdAt, id)` key instead — offset pagination beyond a few thousand rows is expensive regardless of cap.

---

### Staleness note

`positionsPage` results may include cost-basis fields (`userCollateral`, `realizedPnL`) that are up to **30 seconds stale**. This only happens when a `secondaryTrade` lands between requests without bumping the underlying `Position.updatedAt`. Balance / settlement / resolved flags are always live.

If you need strictly real-time trade data, prefer the trade- or activity-specific endpoints (e.g. `accountActivity`, `trades`). The synthesis-derived cost-basis view is the only thing affected.

---

### Reference

- Resolver source: [`packages/api/src/graphql/sdl/resolvers/queries/escrow.ts`](src/graphql/sdl/resolvers/queries/escrow.ts) (`runPositions`)
- SDL: [`packages/api/src/graphql/sdl/schema/schema.graphql`](src/graphql/sdl/schema/schema.graphql) (search for `positionsPage`, `PositionsPage`, `Page`)
- Generated schema: [`packages/api/schema.graphql`](schema.graphql)
- Tests: [`packages/api/src/graphql/sdl/resolvers/queries/escrow.test.ts`](src/graphql/sdl/resolvers/queries/escrow.test.ts), [`packages/api/src/graphql/sdl/resolvers/PositionsPage.test.ts`](src/graphql/sdl/resolvers/PositionsPage.test.ts)
