# GraphQL `/v2/graphql` — Design & Build Plan

This document scopes a brand-new, Relay-compatible GraphQL endpoint mounted at
`/v2/graphql` alongside the existing `/graphql`. Goals:

1. **Industry-standard Relay shape** end-to-end — `Node` everywhere, opaque
   global ids, forward cursor connections, `PageInfo`, `edges { node, cursor }`.
2. **No deprecated cruft.** v2 is a greenfield surface; the bare-array /
   `*Page` / `skip+take` / `where: PrismaFooInput` legacy shapes from v1 do
   not get carried forward.
3. **Single canonical name per concept.** Singular by-id + plural connection
   for every entity. No `*Connection` suffix on the field name (Relay calls
   it `accounts`, not `accountsConnection`). The v1 plan to rename
   `xConnection → x` lands automatically here.
4. **Independent from v1.** v2 ships with its own SDL, resolvers, build,
   Apollo instance, and Node registry. v1 stays bit-for-bit unchanged — no
   contract-test churn, no integrator breakage. v2 can iterate freely.

The endpoint exists in this PR as a buildable stub. Each entity in the
section list below lands in a follow-up PR per the phasing in **Phase
plan**.

---

## Scope — entities & root fields

### Core entities (each gets a singular + a plural connection)

Every type below `implements Node` with `id: ID!` carrying its opaque global
id. The current domain identifier (`predictionId`, `tradeHash`, `pickConfigId`,
condition `id`, EAS `uid`, wallet `address`, …) lives on as a separately
named field on the type — global id is the second identity layer for cache
normalization and polymorphic refetch.

| Entity             | Singular query                                    | Plural query (connection)                                                           | Source                       |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| Account            | `account(address: Address!): Account`             | `accounts(first, after, filter, orderBy): AccountConnection!`                       | `User` table + synthesis     |
| Category           | `category(id: ID!): Category`                     | `categories(first, after, filter): CategoryConnection!`                             | `Category` table             |
| CollateralTransfer | `collateralTransfer(id: ID!): CollateralTransfer` | `collateralTransfers(first, after, filter, orderBy): CollateralTransferConnection!` | `CollateralTransfer` table   |
| Condition          | `condition(id: ID!): Condition`                   | `conditions(first, after, filter, orderBy): ConditionConnection!`                   | `Condition` table            |
| ConditionGroup     | `conditionGroup(id: ID!): ConditionGroup`         | `conditionGroups(first, after, filter, orderBy): ConditionGroupConnection!`         | `ConditionGroup` table       |
| Position           | `position(id: ID!): Position`                     | `positions(first, after, filter, orderBy): PositionConnection!`                     | `Position` table + WAC synth |
| Prediction         | `prediction(id: ID!): Prediction`                 | `predictions(first, after, filter, orderBy): PredictionConnection!`                 | `Prediction` table           |
| Trade              | `trade(id: ID!): Trade`                           | `trades(first, after, filter, orderBy): TradeConnection!`                           | `SecondaryTrade` table       |
| Forecast           | `forecast(id: ID!): Forecast`                     | `forecasts(first, after, filter, orderBy): ForecastConnection!`                     | `Attestation` table (EAS)    |
| PickConfiguration  | `pickConfiguration(id: ID!): PickConfiguration`   | `pickConfigurations(first, after, filter, orderBy): PickConfigurationConnection!`   | `Picks` table                |
| Claim              | `claim(id: ID!): Claim`                           | `claims(first, after, filter, orderBy): ClaimConnection!`                           | `Claim` table                |
| Close              | `close(id: ID!): Close`                           | `closes(first, after, filter, orderBy): CloseConnection!`                           | `Close` table                |

### Aggregate / singleton root fields

| Field                      | Shape                       | Notes                                                                                                                                   |
| -------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `activity(...)`            | `ActivityConnection!`       | Interleaved Prediction/Trade feed. `ActivityItem` is a union (`Prediction \| Trade`).                                                   |
| `leaderboard(metric: ...)` | `AccountRankingConnection!` | Ranked accounts by `PNL` / `VOLUME` / `ROI` / `ACCURACY`. Edges expose rank + the ranked stat.                                          |
| `protocol`                 | `Protocol!`                 | Singleton with nested `stats(filter:)`, `openInterestByCategory`, `openInterestByTimeToResolution`, …                                   |
| `popularTags`              | `[String!]!`                | Top-20 tag list. Not entity-shaped; left as a plain list (matches every Relay schema's `[String!]!` convention for non-entity scalars). |

### Consolidations (resolving the open questions)

The user's prompt raised two consolidation ideas. The plan:

**1. Vaults treated like accounts.** Vaults already have an address and a
stats time series — exactly Account's shape. v2 introduces an interface:

```graphql
interface AddressEntity implements Node {
  id: ID!
  address: Address!
  stats(...): StatConnection!
  collateralBalance(chainId: Int!, atBlock: BigInt): CollateralBalance!
  rank(metric: ...): Ranking
}

type Account implements Node & AddressEntity { ... }
type Vault   implements Node & AddressEntity { ... }
```

A vault is a contract-controlled "account" with extra fields (`name`,
`legacyAddresses`, `vaultKind`, …). Both can be fetched by `address`:

- `account(address:)` — User-table row or synthesized.
- `vault(address:)` — looked up against the configured vault set.
- `accounts(...)` / `vaults(...)` — independent connections.

Polymorphic refetch via `node(id:)` works for both. Top-level callers who
"just want the entity for this address" can use either query depending on
the kind — they're disjoint sets (vaults are a small statically configured
set; accounts are EOAs). A single unified `accountOrVault(address:)` union
helper can be added later if needed; we don't ship it on day one because
it would force the union type into the cache normalization layer for every
client.

**2. `collateralBalance` / `collateralBalanceHistory` collapsed into
Account.** Both move off the root `Query`. They become fields on
`AddressEntity`:

- `Account.collateralBalance(chainId: Int!, atBlock: BigInt): CollateralBalance!`
- `Account.collateralBalanceHistory(chainId: Int!, first, after, intervalSeconds): CollateralBalanceSnapshotConnection!`

…and (because they share the interface) the same fields on `Vault` for
free. Root-level `collateralBalance` / `collateralBalanceHistory` queries
do not exist in v2 — the only entry is through the entity.

The shape `CollateralBalance` is kept as a value type (not Node) — it's
a snapshot, not a persistent entity. The historical snapshots become a
Relay connection paginated over time buckets.

---

## Identity model

### Global ids

The encoding `base64url(TypeName + ':' + domainId)` is reused from v1's
`relay/globalId.ts` mechanics, but v2 maintains an **independent registry**
in `graphql/v2/relay/nodeRegistry.ts`. Rationale:

- v1 and v2 schemas both define a type literally named `Account`. The
  module-global registry in `graphql/relay/globalId.ts` can only point one
  loader at a given type name; mounting both endpoints in the same process
  needs two registries.
- v2 globalIds are public from day one — once an id ships from `/v2/graphql`,
  its `(TypeName, domainId)` is frozen for the same reasons v1's is.
  `FROZEN_NODE_TYPES_V2` is the v2 equivalent (initially empty; appended to
  in each per-entity PR alongside `implements Node` in the SDL).
- v2 ids and v1 ids are **not interchangeable**. Clients that mix endpoints
  must use the id they got from the endpoint they're querying. This is
  acceptable because they're separate endpoints with separate caches.

The base64url encoding is intentionally identical so the same client-side
decode helper works for either endpoint when inspecting (the **content**
isn't intended to be the same, just the format).

### Domain identifiers

Each entity exposes its on-wire-stable domain identifier next to `id`:

| Entity             | Domain id field       | Type                                                                                                                                    |
| ------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Account / Vault    | `address`             | `Address!` (canonical lowercase 0x address)                                                                                             |
| Category           | `categoryId`          | `Int!`                                                                                                                                  |
| Condition          | `conditionId`         | `String!` (CTF condition id, lowercase 0x hash)                                                                                         |
| ConditionGroup     | `groupId`             | `Int!`                                                                                                                                  |
| Prediction         | `predictionId`        | `String!` (on-chain, lowercase 0x hash)                                                                                                 |
| Trade              | `tradeHash`           | `String!` (lowercase 0x hash)                                                                                                           |
| Forecast           | `uid`                 | `String!` (EAS attestation uid)                                                                                                         |
| PickConfiguration  | `pickConfigId`        | `String!` (deterministic 0x hash)                                                                                                       |
| Claim / Close      | `txHash` + `logIndex` | `(String!, Int!)` — composite, no separate id                                                                                           |
| CollateralTransfer | `txHash` + `logIndex` | `(String!, Int!)` — composite                                                                                                           |
| Position           | (synthetic `id`)      | `ID!` — there is no on-chain domain id; the row's deterministic synthesis key (`holder:pickConfigId:eventIdx`) doubles as the domain id |

### Internal row ids

v1 leaks Prisma row ids (`Int!`) on most entities. v2 **does not**. The
opaque global `id: ID!` is the only id callers ever need. If a client needs
to compare two payloads "is this the same entity," they compare global ids
(equal iff TypeName + domain id match). The Prisma row id is an internal
detail and stays internal.

---

## Connection shape

Every plural query returns a `*Connection` matching the Relay v2 spec:

```graphql
type FooConnection {
  edges: [FooEdge!]!
  nodes: [Foo!]! # convenience — same content as edges.node
  pageInfo: PageInfo!
  totalCount: Int! # always populated; see below
}

type FooEdge {
  cursor: String!
  node: Foo!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

### Differences from v1's connections

- **`totalCount` is always present and always populated.** v1 omits it on
  some surfaces (Question's SQL UNION couldn't count cheaply, etc.). v2
  budgets for the count: every entity in scope has a Postgres index that
  makes the per-page `count` cheap; the `Question` interleaved feed is
  not in v2's initial scope, so the awkward case doesn't arise.
- **No `nodes` shortcut compromise** — v1 returns both `edges` and `nodes`
  for ergonomic clients. v2 keeps both — the Relay reference schema also
  does, and it's the convention that's settled in the ecosystem (GitHub
  GraphQL API, Shopify, etc.). The duplication is purely client ergonomics.
- **Cursors are opaque base64url** of `(orderKey, id)` — same encoding as
  v1 (`graphql/relay/cursor.ts`). Tie-break by stable id; direction baked
  into the order tuple.
- **`first` is required to default-cap at 50** with a hard max of 100.
  No `last` / `before` arg in v1 either — v2 is forward-only, same as v1.
  Adding bidirectional pagination later is non-breaking.

### Filter & order conventions

- Each connection has a `filter: FooFilter` input (struct of `String?`,
  `Address?`, `UnixSecondsRange?`, `BoolFilter?`, etc.) and an `orderBy:
FooOrder` input (`{ field: FooOrderField, direction: OrderDirection }`).
- No Prisma `where` / `cursor` / `distinct` shapes leak through. The v2
  filter inputs are hand-written, narrowly typed, and only expose fields
  the public API needs.
- `OrderDirection` is `ASC` / `DESC`. Default per-entity (`createdAt DESC`,
  `timestamp DESC`, etc.) is documented on the field.

---

## Cross-cutting

### Hardening reused as-is

The v2 endpoint composes the same Apollo plugins, validation rules,
concurrency limits, and middleware as v1. Specifically:

- `depthLimit(7)` from `graphql-depth-limit` (same depth budget; Activity
  → Prediction → PickConfig → Picks → Condition → Category is still depth
  6, well under).
- `validateQuery` (`graphql/queryValidation.ts`) — list-size and alias caps.
- `getComplexity` (`graphql/queryComplexity.ts`) — query-complexity gate at
  the same threshold.
- `operationTimingPlugin`, `httpCacheHeadersPlugin`, `responseCachePlugin`.
- The two-level concurrency limiter and request timeout from
  `runtime/concurrencyLimiter.ts`.

The Express mount mirrors the `/graphql` block in `core/server.ts` with one
swap: a separate `ApolloServer` instance built from the v2 schema.

### Loaders

The v2 endpoint shares `createLoaders` from
`graphql/sdl/resolvers/loaders.ts`. DataLoader caches are per-request, so
there's no contamination across endpoints; reusing the loader factory
avoids re-implementing N+1 fixes that already exist for `userByAddress`,
`conditionById`, `pickConfigById`, etc. Each v2 resolver consumes the same
loaders as its v1 counterpart.

### Errors

v2 reuses `formatError` from v1 — internal-vs-client distinction via the
`originalError === undefined` check on `GraphQLError`. No change there.

### Telemetry

v2 emits its own `gql_request` operation log lines, tagged `endpoint:
"v2"` to distinguish them from v1 in dashboards. The `prismaQueryCount` /
`requestId` HTTP-layer logging in `core/server.ts` already keys by request
and works unchanged.

### Schema regeneration

v2's SDL lives at `packages/api/src/graphql/v2/schema/schema.graphql`. The
generated wire-format mirror at the package root is
`packages/api/schema.v2.graphql` (next to the existing
`packages/api/schema.graphql`). Codegen runs both schemas through
`graphql-codegen` into separate output files:

- `packages/sdk/types/graphql.ts` — v1 client types (unchanged)
- `packages/sdk/types/graphql.v2.ts` — v2 client types (new)

`pnpm --filter @sapience/api run generate-types` is extended to emit both.
The `emit-schema` step writes both root-level schema files.

### Tests

- **Unit tests** — per-resolver vitest suites colocated under
  `graphql/v2/resolvers/`.
- **Schema snapshot** — `graphql/v2/schema/schema.test.ts` asserts the
  emitted v2 SDL byte-equals the committed copy. Catches accidental SDL
  drift the same way `sdl/schema/schema.test.ts` does for v1.
- **Contract suite** — a new `test/contract/v2/` tree mirrors the existing
  contract suite once a meaningful number of entities have shipped.
- **Frozen Node types** — `globalId.v2.test.ts` cross-checks the v2
  registry against `FROZEN_NODE_TYPES_V2`, same idea as v1.

---

## Phase plan

Each phase is a separate PR off `staging`. Phases land in order; each is
shippable on its own (v2 endpoint stays buildable + healthy throughout).

| Phase | PR title (suggested)                                         | Scope                                                                                                          |
| ----- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **0** | `feat(api): stub /v2/graphql endpoint + plan`                | **This PR.** Endpoint mounted, returns a `_v2Health` ping, `node(id:)` against empty registry, plan committed. |
| 1     | `feat(api/v2): Account + accounts + Node base`               | `Account` type, `account` + `accounts`, `AddressEntity` interface, synthesis path, frozen list entry.          |
| 2     | `feat(api/v2): Vault + vaults`                               | `Vault` implements `AddressEntity`, `vault` + `vaults` queries.                                                |
| 3     | `feat(api/v2): Category + categories`                        | `category` + `categories` (small, easy warm-up after Account).                                                 |
| 4     | `feat(api/v2): Forecast + forecasts`                         | EAS attestations, simplest connection (no internal joins).                                                     |
| 5     | `feat(api/v2): Trade + trades`                               | Secondary-market trades, the second-simplest entity.                                                           |
| 6     | `feat(api/v2): Condition + conditions`                       | `condition` + `conditions` + `ConditionFilter`.                                                                |
| 7     | `feat(api/v2): ConditionGroup + conditionGroups`             | Pairs with Condition; the two have cross-refs.                                                                 |
| 8     | `feat(api/v2): PickConfiguration + pickConfigurations`       | The 'picks config' graph node — referenced by Position, Prediction.                                            |
| 9     | `feat(api/v2): Prediction + predictions`                     | Heavier — depends on PickConfiguration.                                                                        |
| 10    | `feat(api/v2): Position + positions`                         | Heaviest — WAC walk over (mints, trades) per row.                                                              |
| 11    | `feat(api/v2): Claim + claims, Close + closes`               | Settlement-side entities; small, ship together.                                                                |
| 12    | `feat(api/v2): CollateralTransfer + collateralTransfers`     | Same shape as the v1 connection.                                                                               |
| 13    | `feat(api/v2): activity feed`                                | Union connection over Prediction + Trade.                                                                      |
| 14    | `feat(api/v2): leaderboard + ranking on AddressEntity`       | Ranked-by-metric connection + the matching field on Account/Vault.                                             |
| 15    | `feat(api/v2): protocol + stats`                             | `Protocol` singleton with nested stats connection, OI-by-category, OI-by-time-to-resolution.                   |
| 16    | `feat(api/v2): collateralBalance + history on AddressEntity` | Snapshot field + paginated history; no root-level field.                                                       |
| 17    | `feat(api/v2): popularTags`                                  | Plain scalar list; the smallest entry — last because it's least interesting.                                   |

Once Phase 17 is in, v2's surface fully covers the entity list from the
brief. From that point the deprecation cycle on v1's pre-Relay shapes can
start (per-field `@deprecated(reason: "Use /v2/graphql Foo.bar")` tags),
and v1 → v2 cutover can be scheduled.

---

## Open questions to revisit per-entity

These are intentionally not pre-decided here — each per-entity PR makes
its own call against the consolidated data:

- **Cursor key per entity.** Stats-heavy connections (Trade by `blockNumber`,
  Position by `endsAt`) may want a different default order than `createdAt
DESC`. Decide alongside the resolver.
- **Filter struct shape.** Some v1 connections have ~20 filter fields
  (`Position`). v2 takes the opportunity to trim — only ship filters with
  evidence of public-API use; the rest can be added later.
- **Field-level deprecations on the v1 schema.** Once a v2 field is live,
  the matching v1 field gets `@deprecated(reason: "Use /v2/graphql foo.bar")`.
  Done per phase, not retro-actively in one big push.
- **DataLoader extensions.** New v2-only relations (`Vault.stats`,
  `Account.collateralBalanceHistory`) may need new loaders; add them
  alongside the resolver in the phase that introduces them.
