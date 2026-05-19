# Sapience GraphQL API Redesign Proposal

## Purpose

This document proposes a target GraphQL API surface for Sapience based on the current active resolver surface and the clarified product/domain model.

The goal is to move from a flat resolver list toward a more durable, industry-standard GraphQL schema that is:

- Relay-compatible, with a clear path to becoming more Relay-dogmatic later.
- Graph-shaped rather than endpoint-shaped.
- Explicit about durable entities versus derived aggregate views.
- Publicly aligned with product language rather than implementation jargon.
- Friendly to both Sapience frontend clients and external developers.

---

## Core Domain Decisions

### Durable entities

These are canonical graph entities and should generally implement `Node`:

- `Account`
- `Condition`
- `ConditionGroup`
- `PickConfiguration`
- `Prediction`
- `Trade`
- `Forecast`
- `Position`
- `Vault`

### Derived aggregate views

These are product views, not canonical database-backed entities:

- `Question`
- `Activity`

### Question model

`Question` is not a durable entity.

It is a synthesized aggregate view used to interleave:

- grouped markets, represented by `ConditionGroup`
- ungrouped markets, represented by `Condition`

There should not be a canonical `question(id:)` lookup. Direct links should resolve through either:

```graphql
condition(id: ID!)
conditionGroup(id: ID!)
```

A synthetic `Question.id` is deferred (see D1). Clients that need a stable list key today should use the underlying `Condition` / `ConditionGroup` Node ID reachable through `Question.source`. If a future UI need forces a synthetic ID, the format is unfixed — committing to a wire shape prematurely locks it forever.

### Activity model

`Activity` is a derived aggregate feed item over:

- `Prediction`
- `Trade`

`Forecast` is intentionally **not** in the union — today's product feed only shows predictions and trades. Adding `Forecast` later is a separate product decision (feed UX + backend SQL union over `Attestation`), and it's an additive non-breaking change at the schema level when the time comes.

It should not implement `Node` unless activity feed rows become durable persisted records.

### Forecast rename

Public API language should use `Forecast`, not `Attestation`.

Mapping:

- `Attestation` → `Forecast`
- `attestationsPage` → `forecasts`
- `attester` → `forecaster`
- `attestationScore` → `forecastScore`

The `uid` should remain exposed because it is the EAS UID and serves as the on-chain / EAS anchor.

### Prediction versus Forecast

A `Prediction` is a committed, collateralized, on-chain bet with skin in the game.

A `Forecast` is a unilateral belief statement with no escrow, scored for accuracy.

Both are user-authored, but they differ materially:

| Concept          | Prediction         | Forecast                |
| ---------------- | ------------------ | ----------------------- |
| Storage          | `Prediction` model | `Attestation` model     |
| Counterparty     | Yes                | No                      |
| Collateral       | Yes, wUSDe         | No                      |
| Settles          | Yes                | No, scored for accuracy |
| Identity         | `predictionId`     | `uid`                   |
| Skin in the game | Yes                | No                      |

### Trades and positions

Trades and positions are tied directly to `PickConfiguration`, not directly to `Condition`.

The natural relationships are:

```text
Trade -> PickConfiguration -> Pick[] -> Condition[]
Position -> PickConfiguration -> Pick[] -> Condition[]
```

The public API should expose:

```graphql
trade.pickConfiguration
trade.conditions

position.pickConfiguration
position.conditions
```

where `conditions` is a derived convenience field.

### Vault model

A vault is a strategy-level construct that wraps an on-chain holder address. The address takes positions, makes trades, and holds collateral exactly like a user `Account` does — what makes it a vault is the share accounting on top (deposits/withdrawals mint/burn shares, NAV per share, strategy class).

The public API splits this cleanly:

- `Vault implements Node` carries the strategy-level identity: `address`, `chainId`, `kind` (`PROTOCOL` / `PYTH` / `SINGLE_LEG` / `STRATEGY_B`), `collateral`, plus a `stats` time series.
- `Vault.account: Account!` is the on-chain holder. All market activity — `trades`, `positions`, `predictions`, `collateralBalance` — is reached through `vault.account`, not duplicated on `Vault`. The address is the canonical identity: `vault.account.address == vault.address`.

This mirrors how `Prediction.predictor: Account!` works — a durable entity _has_ an account; it doesn't _become_ one. Clients querying "the vault's recent trades" traverse `vault.account.trades(...)`; vault-specific share / flow / PnL state lives on `VaultStat` snapshots.

The legacy `ProtocolStat` carried ~15 `vault*`-prefixed fields (`vaultBalance`, `vaultDeployed`, `vaultDeposits`, `vaultWithdrawals`, `vaultCumulativePnL`, `vaultAirdropGains`, `vaultUnredeemedClaim`, `vaultAvailableAssets`, `vaultPositionsWon/Lost`, `vaultSecondaryBought/Sold`, plus `totalAssets` / `totalShares`). Those migrate to per-snapshot fields on `VaultStat`, keyed by vault — see the SDL and migration map below.

### Collateral

Collateral is currently always wUSDe.

However, because the model is technically multi-collateral aware, public types should expose a `collateral: CollateralToken!` field for forward compatibility.

Recommended documentation language:

> Currently always wUSDe; exposed as a field for forward compatibility.

---

## API Design Principles

### 1. Relay-compatible now, Relay-dogmatic later

The target schema should be Relay-compatible from the beginning:

- `Node` interface
- global opaque `id: ID!`
- `node(id:)`
- `nodes(ids:)`
- connection-shaped pagination
- `edges`
- `cursor`
- `pageInfo`

But it does not need to be Relay-purist immediately. Developer-friendly additions are fine:

- `nodes` convenience arrays on connections
- `totalCount` where useful
- domain-specific lookups like `tradeByHash`
- public blockchain identifiers as fields

### 2. Durable entities get direct lookup

Examples:

```graphql
condition(id: ID!)
conditionGroup(id: ID!)
prediction(id: ID!)
trade(id: ID!)
forecast(id: ID!)
position(id: ID!)
pickConfiguration(id: ID!)
```

### 3. Derived views get list/query access only

Examples:

```graphql
questions(...)
activity(...)
```

No canonical:

```graphql
question(id:)
activity(id:)
```

unless those views become durable records later.

### 4. Public identity and domain identity are different

Every durable object should have a GraphQL `id: ID!`.

Domain-specific identifiers should remain as fields and lookup helpers.

Examples:

```graphql
type Prediction implements Node {
  id: ID!
  predictionId: BigInt!
}

type Trade implements Node {
  id: ID!
  hash: Bytes32!
}

type Forecast implements Node {
  id: ID!
  uid: Bytes32!
}
```

And root lookups:

```graphql
predictionByOnchainId(predictionId: BigInt!): Prediction
tradeByHash(hash: Bytes32!): Trade
forecastByUid(uid: Bytes32!): Forecast
```

### 5. Use product language publicly

Prefer:

```graphql
Forecast
forecaster
forecastScore
```

Avoid exposing:

```graphql
Attestation
attester
attestationScore
```

except in internal code or low-level docs explaining the EAS backing model.

### 6. One filter convention, one sort convention

The current schema mixes flat `<field>Min` / `<field>Max` args, operator-pattern `<field>Filter` input objects, top-level filter args on the root field (`positionsPage(address, owner, settled, ...)`), and consolidated `filters:` input objects. New types should pick one convention and hold it.

#### Filters

Every list / connection field accepts a single `filter: <Entity>Filter` input.

Scalar fields on `<Entity>Filter` use operator-pattern inputs:

```graphql
input PositionFilter {
  account: AddressFilter
  conditionId: IDFilter
  size: DecimalFilter
  collateralAmount: DecimalFilter
  createdAt: DateTimeFilter
}
```

The operator inputs themselves are the Prisma-style set:

```graphql
input BigIntFilter {
  equals: BigInt
  gt: BigInt
  gte: BigInt
  lt: BigInt
  lte: BigInt
  in: [BigInt!]
  notIn: [BigInt!]
  not: BigInt
}
```

A parallel input exists for each filterable scalar (`IntFilter`, `DecimalFilter`, `StringFilter`, `DateTimeFilter`, `AddressFilter`, plus parameterized `EnumFilter<T>` per enum where filtering is useful). There is no `BooleanFilter` — see the next rule.

Rules:

- **Strict semantics, no implicit OR.** `{ size: { gte: "1" } }` means `size >= 1`, full stop. Clients that want richer composition issue separate queries or rely on the server to add an explicit `OR` shape later if real demand surfaces.
- **Unsupported operators on a specific field reject** with a clear error, not silently no-op. If a field can only be filtered by `equals` (e.g., a hashed identifier), the resolver rejects `gt`/`lt` rather than returning empty or full results.
- **Forbid flat `<field>Min` / `<field>Max` on new types.** Existing flat args get `@deprecated` with a one-release migration cycle. PR 1730 was the legacy-surface bridge attempt; the target shape is the operator-pattern filter in this doc.
- **Booleans stay flat.** Use `<field>: Boolean` rather than a `BooleanFilter` wrapper — there is no `gt true` and the operator pattern adds noise without benefit. For tri-state fields that need an "unset" third value, prefer a nullable enum and filter via `<field>: { isNull }` rather than a Boolean — that's the pattern `Condition.outcome` / `Prediction.result` use in place of the older `settled: Boolean!`.
- **Null filtering goes through `isNull`.** `{ outcome: { isNull: true } }` matches unsettled conditions; `{ isNull: false }` matches settled. Available on every operator input including the enum filters. Rejected on non-nullable columns per the unsupported-operator rule.

The SDL draft below has been normalized to operator-pattern. Multi-value membership filters (`categoryIds: [ID!]`, `tags: [String!]`, `activityTypes: [ActivityType!]`) intentionally stay flat — the operator pattern is for single-value scalar comparisons; "is any of" is a different beast. Full-text `search: String` also stays flat — it isn't a field filter.

#### Sort

Replace the today-pattern of `orderBy: <FieldEnum>, orderDirection: ASC|DESC` with a single `orderBy: <Entity>Order` input bundling both:

```graphql
predictions(
  first: Int
  after: String
  filter: PredictionFilter
  orderBy: PredictionOrder
): PredictionConnection!

input PredictionOrder {
  field: PredictionOrderField!
  direction: OrderDirection!
}

enum PredictionOrderField {
  CREATED_AT
  SETTLED_AT
  COLLATERAL_AMOUNT
  PAYOUT
}
```

This matches GitHub's `IssueOrder` / `RepositoryOrder` precedent — the same precedent we followed on `ConditionOrConditionGroup`. Singular orderBy is the dominant convention for hand-designed public GraphQL APIs (GitHub, Linear, Shopify); the array shape is mostly an ORM-generation artifact (Hasura, Prisma).

Rules:

- **Each entity declares its own `<Entity>OrderField` enum** listing the fields the entity's indexes actually support. This answers open question P1 (which sort fields are supported per entity) structurally — if a field isn't in the enum, you can't sort by it.
- **Adding a sort field is non-breaking; removing one is.** Treat the order-field enum like every other public enum — addition-only after first ship.
- **Default order belongs in the resolver, not the schema.** Both `field` and `direction` on `<Entity>Order` are non-null with no schema-level defaults — clients either supply both or omit `orderBy` entirely. When omitted, the resolver picks; the field description documents the choice ("orders by `CREATED_AT DESC` when `orderBy` is omitted"). Matches GitHub / Shopify / Linear convention.
- **Multi-key sort path is open.** If real demand surfaces, add a `then: <Entity>Order` field to the order input for tie-breakers — purely additive, non-breaking. Until then, the single-key shape is simpler for clients and resolvers alike.

---

## Target Query Surface

Prose orientation to the top-level `Query` shape. The full SDL below is the canonical source — argument lists, filters, and order inputs live there.

**Polymorphic Relay refetch.** `node(id:)` and `nodes(ids:)` return any durable entity by opaque global ID.

**Direct lookup by Node ID** for every durable type except `Account`: `condition`, `conditionGroup`, `prediction`, `trade`, `forecast`, `position`, `pickConfiguration`, `vault`. `Account` is fetched by address (`account(address: Address!)`), or polymorphically via `node(id:)`.

**Domain-identifier lookup** where the public identifier is the on-chain or external anchor:

- `predictionByOnchainId(predictionId: BigInt!)`
- `tradeByHash(hash: Bytes32!)`
- `forecastByUid(uid: Bytes32!)`
- `vaultByAddress(address: Address!)`
- `account(address: Address!)` — Account's domain identifier _is_ its address, so there's no separate `accountByAddress`.

**Relay-shaped connections** for each durable entity: `accounts`, `conditions`, `conditionGroups`, `predictions`, `trades`, `forecasts`, `positions`, `pickConfigurations`, `vaults`. Each takes `first` / `after` / `filter: <Entity>Filter` / `orderBy: <Entity>Order`.

**Derived-view feeds** — list access only, no canonical `(id:)` lookup (see "Derived aggregate views"):

- `questions` — interleaved `Condition` / `ConditionGroup` feed.
- `activity` — interleaved `Prediction` / `Trade` feed. (`Forecast` is intentionally not in the union today — see "Activity model".)

**Cross-cutting and namespace fields:**

- `leaderboard(metric: LeaderboardMetric!, filter:)` — ranked `Account` feed.
- `collateralBalance` / `collateralBalanceHistory` / `collateralTransfers`.
- `protocol` — namespace for protocol-wide stats and aggregates.
- `categories` / `popularTags` — taxonomy.

---

## Target GraphQL SDL Draft

```graphql
scalar Address
scalar BigInt
scalar Bytes32
scalar DateTime
scalar Decimal

# Unix seconds (uint256 in contract storage). Used for timestamps that
# come directly from chain state, where round-tripping to DateTime would
# require server-side conversion and lose precision. Indexed / derived
# timestamps use `DateTime`.
scalar UnixSeconds

interface Node {
  id: ID!
}

# Operator-pattern filter inputs. Used on per-field filter members in
# `<Entity>Filter` types. Operators an entity doesn't support reject
# at the resolver with a clear error rather than silently no-op. See
# "One filter convention, one sort convention" in the principles.
#
# `isNull: Boolean` is supported on every operator input: `{ isNull:
# true }` matches rows where the underlying column is null, `false`
# matches non-null. Rejected on non-nullable columns (e.g.,
# `Account.address`) per the unsupported-operator rule. This is how
# clients filter "settled vs unsettled" now that the redesign uses
# nullable outcome/result enums in place of `settled: Boolean` —
# `{ outcome: { isNull: true } }` for unsettled, `false` for settled.

input AddressFilter {
  equals: Address
  in: [Address!]
  notIn: [Address!]
  not: Address
  isNull: Boolean
}

input IDFilter {
  equals: ID
  in: [ID!]
  notIn: [ID!]
  not: ID
  isNull: Boolean
}

input BigIntFilter {
  equals: BigInt
  gt: BigInt
  gte: BigInt
  lt: BigInt
  lte: BigInt
  in: [BigInt!]
  notIn: [BigInt!]
  not: BigInt
  isNull: Boolean
}

input IntFilter {
  equals: Int
  gt: Int
  gte: Int
  lt: Int
  lte: Int
  in: [Int!]
  notIn: [Int!]
  not: Int
  isNull: Boolean
}

input DateTimeFilter {
  equals: DateTime
  gt: DateTime
  gte: DateTime
  lt: DateTime
  lte: DateTime
  in: [DateTime!]
  notIn: [DateTime!]
  isNull: Boolean
}

input StringFilter {
  equals: String
  contains: String
  startsWith: String
  endsWith: String
  in: [String!]
  notIn: [String!]
  not: String
  isNull: Boolean
}

input DecimalFilter {
  equals: Decimal
  gt: Decimal
  gte: Decimal
  lt: Decimal
  lte: Decimal
  in: [Decimal!]
  notIn: [Decimal!]
  not: Decimal
  isNull: Boolean
}

# Enum filters use the same operator shape — one input per enum type
# (GraphQL has no input-type generics). Only enums where filtering is
# a real client need get one; today that's `ConditionOutcome` (forecast
# / question filtering by resolution status) and `PredictionResult`
# (settled-vs-unsettled via `isNull`, plus "predictor won" /
# "counterparty won" feeds). Add more as demand surfaces — it's
# purely additive.

input ConditionOutcomeFilter {
  equals: ConditionOutcome
  in: [ConditionOutcome!]
  notIn: [ConditionOutcome!]
  not: ConditionOutcome
  isNull: Boolean
}

input PredictionResultFilter {
  equals: PredictionResult
  in: [PredictionResult!]
  notIn: [PredictionResult!]
  not: PredictionResult
  isNull: Boolean
}

# Relay-spec `PageInfo`. `hasPreviousPage` is mandatory to keep the
# type spec-compatible, but reverse pagination via `last` / `before`
# is deferred (see D4) — under forward-only pagination
# (`first` / `after`), `hasPreviousPage` is always `false`. The field
# becomes meaningful once `last` / `before` ships; until then clients
# should not infer reverse-traversal capability from its presence.
type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

enum OrderDirection {
  ASC
  DESC
}

type Query {
  node(id: ID!): Node
  nodes(ids: [ID!]!): [Node]!

  account(address: Address!): Account
  accounts(
    first: Int
    after: String
    filter: AccountFilter
    orderBy: AccountOrder
  ): AccountConnection!

  condition(id: ID!): Condition
  conditionGroup(id: ID!): ConditionGroup

  questions(
    first: Int
    after: String
    filter: QuestionFilter
    orderBy: QuestionOrder
  ): QuestionConnection!
  conditions(
    first: Int
    after: String
    filter: ConditionFilter
    orderBy: ConditionOrder
  ): ConditionConnection!
  conditionGroups(
    first: Int
    after: String
    filter: ConditionGroupFilter
    orderBy: ConditionGroupOrder
  ): ConditionGroupConnection!

  prediction(id: ID!): Prediction
  predictionByOnchainId(predictionId: BigInt!): Prediction
  predictions(
    first: Int
    after: String
    filter: PredictionFilter
    orderBy: PredictionOrder
  ): PredictionConnection!

  trade(id: ID!): Trade
  tradeByHash(hash: Bytes32!): Trade
  trades(
    first: Int
    after: String
    filter: TradeFilter
    orderBy: TradeOrder
  ): TradeConnection!

  forecast(id: ID!): Forecast
  forecastByUid(uid: Bytes32!): Forecast
  forecasts(
    first: Int
    after: String
    filter: ForecastFilter
    orderBy: ForecastOrder
  ): ForecastConnection!

  activity(
    first: Int
    after: String
    filter: ActivityFilter
    orderBy: ActivityOrder
  ): ActivityConnection!

  position(id: ID!): Position
  positions(
    first: Int
    after: String
    filter: PositionFilter
    orderBy: PositionOrder
  ): PositionConnection!

  pickConfiguration(id: ID!): PickConfiguration
  pickConfigurations(
    first: Int
    after: String
    filter: PickConfigurationFilter
    orderBy: PickConfigurationOrder
  ): PickConfigurationConnection!

  vault(id: ID!): Vault
  vaultByAddress(address: Address!): Vault
  vaults(first: Int, after: String, filter: VaultFilter): VaultConnection!

  leaderboard(
    metric: LeaderboardMetric!
    first: Int
    after: String
    filter: LeaderboardFilter
  ): AccountRankingConnection!

  collateralBalance(
    account: Address!
    chainId: Int!
    atBlock: BigInt
  ): CollateralBalance!
  collateralBalanceHistory(
    account: Address!
    chainId: Int!
    first: Int
    after: String
    intervalSeconds: Int!
  ): CollateralBalanceSnapshotConnection!
  collateralTransfers(
    first: Int
    after: String
    filter: CollateralTransferFilter
    orderBy: CollateralTransferOrder
  ): CollateralTransferConnection!

  protocol: Protocol!

  categories(first: Int, after: String): CategoryConnection!
  popularTags(first: Int = 50): [String!]!
}

type Account implements Node {
  id: ID!
  address: Address!
  createdAt: DateTime!

  stats(
    first: Int
    after: String
    filter: AccountStatsFilter
    orderBy: AccountStatsOrder
  ): AccountStatsConnection!
  rank(metric: LeaderboardMetric!, filter: LeaderboardFilter): AccountRanking

  # Predictions where this account is either the predictor OR the
  # counterparty. The two roles are symmetric; clients that need to
  # disambiguate read `predictor` / `counterparty` on each row. This
  # field is the OR-across-roles feed. The root `predictions(filter:)`
  # exposes `predictor` and `counterparty` as separate `AddressFilter`s
  # with strict AND semantics — use that to ask "rows where X is
  # predictor and Y is counterparty," use this to ask "all of X's
  # predictions."
  predictions(
    first: Int
    after: String
    filter: PredictionFilter
    orderBy: PredictionOrder
  ): PredictionConnection!
  trades(
    first: Int
    after: String
    filter: TradeFilter
    orderBy: TradeOrder
  ): TradeConnection!
  forecasts(
    first: Int
    after: String
    filter: ForecastFilter
    orderBy: ForecastOrder
  ): ForecastConnection!
  positions(
    first: Int
    after: String
    filter: PositionFilter
    orderBy: PositionOrder
  ): PositionConnection!

  collateralBalance(chainId: Int!, atBlock: BigInt): CollateralBalance!
}

type Question {
  # No synthetic `id` field yet — Question is a derived view, not a
  # durable entity. Clients key on the underlying `Condition` /
  # `ConditionGroup` Node IDs reachable through `source`. See
  # open question D1.

  # Exactly one of Condition | ConditionGroup. Modeled as a union so
  # the schema enforces mutual exclusion and clients can't silently
  # observe a both-null or both-set state. `__typename` on the union
  # member subsumes the old `questionType` enum.
  source: ConditionOrConditionGroup!

  title: String!
  description: String
  category: Category
  tags: [String!]!

  conditions(first: Int, after: String): ConditionConnection!

  predictions(
    first: Int
    after: String
    filter: PredictionFilter
    orderBy: PredictionOrder
  ): PredictionConnection!
  trades(
    first: Int
    after: String
    filter: TradeFilter
    orderBy: TradeOrder
  ): TradeConnection!
  forecasts(
    first: Int
    after: String
    filter: ForecastFilter
    orderBy: ForecastOrder
  ): ForecastConnection!
  activity(
    first: Int
    after: String
    filter: ActivityFilter
    orderBy: ActivityOrder
  ): ActivityConnection!

  openInterest: Decimal
  volume: Decimal
  createdAt: DateTime!
  updatedAt: DateTime
  resolvesAt: DateTime
}

union ConditionOrConditionGroup = Condition | ConditionGroup

type ConditionGroup implements Node {
  id: ID!
  databaseId: Int!
  title: String!
  description: String

  question: Question!
  conditions(
    first: Int
    after: String
    filter: ConditionFilter
    orderBy: ConditionOrder
  ): ConditionConnection!

  predictions(
    first: Int
    after: String
    filter: PredictionFilter
    orderBy: PredictionOrder
  ): PredictionConnection!
  trades(
    first: Int
    after: String
    filter: TradeFilter
    orderBy: TradeOrder
  ): TradeConnection!
  forecasts(
    first: Int
    after: String
    filter: ForecastFilter
    orderBy: ForecastOrder
  ): ForecastConnection!

  createdAt: DateTime!
  updatedAt: DateTime
}

type Condition implements Node {
  id: ID!
  databaseId: Int!
  title: String!
  description: String

  # Resolution state. `outcome` is null until the on-chain resolver
  # returns, then carries the resolved value: `YES` / `NO` for decisive
  # resolutions, `NON_DECISIVE` for ties/voids (which the protocol
  # collapses to `COUNTERPARTY_WINS` at the Prediction layer).
  # `settledAt` is null in lockstep with `outcome`. No separate
  # `settled: Boolean` field — `outcome != null` is the boundary, and
  # clients filter "settled / unsettled" via `outcome: { isNull }`.
  # No separate `ConditionStatus` enum either: today's data model has
  # no other lifecycle states (no `CANCELLED`, no `ARCHIVED`), so the
  # outcome enum carries the entire public state.
  outcome: ConditionOutcome
  settledAt: UnixSeconds

  conditionGroup: ConditionGroup
  question: Question!

  pickConfigurations(
    first: Int
    after: String
    filter: PickConfigurationFilter
    orderBy: PickConfigurationOrder
  ): PickConfigurationConnection!

  predictions(
    first: Int
    after: String
    filter: PredictionFilter
    orderBy: PredictionOrder
  ): PredictionConnection!
  trades(
    first: Int
    after: String
    filter: TradeFilter
    orderBy: TradeOrder
  ): TradeConnection!
  forecasts(
    first: Int
    after: String
    filter: ForecastFilter
    orderBy: ForecastOrder
  ): ForecastConnection!

  createdAt: DateTime!
  updatedAt: DateTime
  # Off-chain metadata sourced from Polymarket's market API (not chain
  # storage), so `DateTime` rather than `UnixSeconds` is the right
  # scalar here.
  resolvesAt: DateTime
}

enum ConditionOutcome {
  YES
  NO
  NON_DECISIVE
}

type PickConfiguration implements Node {
  id: ID!
  databaseId: Int!

  picks: [Pick!]!
  conditions: [Condition!]!

  predictions(
    first: Int
    after: String
    filter: PredictionFilter
    orderBy: PredictionOrder
  ): PredictionConnection!
  trades(
    first: Int
    after: String
    filter: TradeFilter
    orderBy: TradeOrder
  ): TradeConnection!
  positions(
    first: Int
    after: String
    filter: PositionFilter
    orderBy: PositionOrder
  ): PositionConnection!

  createdAt: DateTime!
}

type Pick {
  condition: Condition!
  side: PickSide!
}

enum PickSide {
  YES
  NO
}

type Prediction implements Node {
  id: ID!
  predictionId: BigInt!

  predictor: Account!
  counterparty: Account!
  pickConfiguration: PickConfiguration!
  conditions: [Condition!]!

  collateral: CollateralToken!
  collateralAmount: Decimal!

  # Settlement state. `result` is null until the on-chain prediction is
  # resolved, then carries the outcome. `payout` and `settledAt` are
  # null in lockstep with `result`. No separate `settled: Boolean` —
  # `result != null` is the boundary; clients filter "settled /
  # unsettled" via `result: { isNull }`. No separate `PredictionStatus`
  # enum: today's data model has no `CANCELLED` state, so a lifecycle
  # enum would just duplicate the result-null boundary. `payout` is
  # derived from the prize pool (`predictorCollateral +
  # counterpartyCollateral`) and the resolved `result`.
  result: PredictionResult
  payout: Decimal

  createdAt: DateTime!
  # `UnixSeconds` rather than `DateTime` — this comes from chain
  # storage (uint256 seconds) like `Condition.settledAt`, not from the
  # indexer's row-write clock.
  settledAt: UnixSeconds
}

# Result is binary at the payout layer — every settled prediction
# resolves to one of these two values. Non-decisive `Condition`
# outcomes (`Condition.outcome = NON_DECISIVE`) resolve their owning
# predictions to `COUNTERPARTY_WINS` per protocol rules; to distinguish
# "counterparty won decisively" from "counterparty won because the
# condition voided," inspect `prediction.conditions[].outcome` directly.
# Server-side rollups like `AccountStat.predictionsNonDecisive` already
# do this join. There is intentionally no `NON_DECISIVE` value here —
# adding one would imply a third payout path that the protocol doesn't
# implement.
enum PredictionResult {
  PREDICTOR_WINS
  COUNTERPARTY_WINS
}

type Forecast implements Node {
  id: ID!
  uid: Bytes32!

  forecaster: Account!
  schemaId: Bytes32!

  # Forecasts attach to a single Condition (the EAS subject). Group /
  # pickConfiguration membership is reachable via `condition.conditionGroup`
  # and `condition.pickConfigurations`. Non-null on the public surface:
  # forecasts without a condition link aren't a supported product
  # surface, and any back-end nullability in the Prisma column should
  # be normalized away at the resolver (filtered out or rejected at
  # write time) rather than surfaced through the wire format.
  condition: Condition!

  forecastScore: Decimal

  createdAt: DateTime!
}

type Trade implements Node {
  id: ID!
  hash: Bytes32!

  account: Account!
  pickConfiguration: PickConfiguration!
  conditions: [Condition!]!

  # All trade economics columns (`collateral`, `tokenAmount`, `price`)
  # are non-null in the `SecondaryTrade` indexer model — every row
  # carries them.
  collateral: CollateralToken!
  collateralAmount: Decimal!

  price: Decimal!
  quantity: Decimal!

  createdAt: DateTime!
}

type Position implements Node {
  id: ID!

  account: Account!
  pickConfiguration: PickConfiguration!
  conditions: [Condition!]!

  # `size` is the raw token balance (renamed from the underlying
  # `Position.balance` column). `collateral` is the token reference;
  # `collateralAmount` is the derived collateral amount this position
  # represents — both are non-null because `balance` is non-null in
  # the data model.
  size: Decimal!
  collateral: CollateralToken!
  collateralAmount: Decimal!

  averagePrice: Decimal
  realizedPnl: Decimal
  unrealizedPnl: Decimal

  createdAt: DateTime!
  updatedAt: DateTime
}

type Activity {
  # No synthetic `id` field yet — Activity is a derived feed row, not a
  # durable entity. The wrapped `source` already carries a Node ID;
  # in-page identity is handled by the connection cursor. See open
  # question D2.

  # The underlying entity this activity row wraps. Concrete type is
  # available via `__typename` — no separate `activityType` enum field
  # because it would duplicate what the union already encodes.
  source: ActivitySource!
  # The actor on the wrapped row: `predictor` for a Prediction,
  # `account` for a Trade. Always present — every union member has a
  # non-null actor account.
  account: Account!
  createdAt: DateTime!
}

union ActivitySource = Prediction | Trade

# Retained for use in ActivityFilter (filtering an interleaved feed by
# member type is a real use case — clients ask "only my trades" or
# "only my predictions"). On the wire of an Activity row itself, prefer
# `__typename` on `source`. `FORECAST` is intentionally absent — Forecast
# is not part of the activity union today (see "Activity model" above);
# add it back here together with the union when forecasts join the feed.
enum ActivityType {
  PREDICTION
  TRADE
}

type CollateralToken {
  symbol: String!
  address: Address!
  decimals: Int!
  chainId: Int!
}

type CollateralBalance {
  account: Account!
  chainId: Int!
  collateral: CollateralToken!
  amount: Decimal!
  atBlock: BigInt
}

# Not a Node — stat rows are time-bucketed values, not addressable
# entities. Cursors over `collateralBalanceHistory` encode
# (block, timestamp) position. Unlike other stat types, this one is
# bucketed at read time via `intervalSeconds:` on the root field — the
# only exception in the schema; see the field description for why.
type CollateralBalanceSnapshot {
  account: Account!
  chainId: Int!
  collateral: CollateralToken!
  amount: Decimal!
  blockNumber: BigInt!
  timestamp: DateTime!
}

type CollateralTransfer implements Node {
  id: ID!
  account: Account!
  chainId: Int!
  collateral: CollateralToken!
  amount: Decimal!
  transactionHash: Bytes32!
  createdAt: DateTime!
}

type Protocol {
  stats(
    first: Int
    after: String
    filter: ProtocolStatsFilter
    orderBy: ProtocolStatsOrder
  ): ProtocolStatsConnection!
  openInterestByCategory: [CategoryOpenInterest!]!
  openInterestByTimeToResolution: [TimeToResolutionBucket!]!

  # Vault is a top-level Node, not a child of Protocol — access via root
  # `vault(id:)`, `vaultByAddress(address:)`, or `vaults(...)`. The
  # vault-prefixed fields the legacy `ProtocolStat` carried
  # (`vaultBalance`, `vaultDeployed`, etc.) live on `VaultStat`; this
  # `ProtocolStat` covers protocol-level totals only.
}

type Vault implements Node {
  id: ID!
  address: Address!
  chainId: Int!
  kind: VaultKind!
  collateral: CollateralToken!

  # The on-chain holder. All market activity — trades, positions,
  # predictions, collateralBalance — is reached through this Account, not
  # duplicated on Vault. By construction `vault.account.address ==
  # vault.address`; the field exists so clients can traverse without a
  # second round-trip. See "Vault model" in Core Domain Decisions.
  account: Account!

  stats(
    first: Int
    after: String
    filter: VaultStatsFilter
    orderBy: VaultStatsOrder
  ): VaultStatsConnection!
}

# Strategy class for a deployed vault. Mirrors `ConfiguredVault.kind` in
# the indexer's `vaultConfig`. Addition-only after first ship — adding a
# member is non-breaking, removing one isn't.
enum VaultKind {
  PROTOCOL
  PYTH
  SINGLE_LEG
  STRATEGY_B
}

type Category implements Node {
  id: ID!
  name: String!
  slug: String
}

type CategoryOpenInterest {
  category: Category!
  openInterest: Decimal!
}

type TimeToResolutionBucket {
  label: String!
  openInterest: Decimal!
}

# One row of an ordered leaderboard for a given `LeaderboardMetric`.
# Used both as the leaf type of `leaderboard(...)` and as the return of
# `Account.rank(metric:)` — a rank IS a position within an ordered list,
# there's no second concept.
#
# `value` is unit-polymorphic: signed wUSDe for `PNL`, positive wUSDe for
# `VOLUME`, a ratio for `ROI`, and a raw time-weighted Brier-derived
# score for `ACCURACY` (no natural unit; magnitude scales with forecast
# lead time — see `scoringService.computeAccuracyScore`). Clients must
# carry the metric from the query context to format `value` correctly.
# The connection envelope (`AccountRankingConnection.metric`) echoes it
# for self-describing payloads; for the single-value `Account.rank`
# return, the caller passed `metric` as the field arg.
type AccountRanking {
  account: Account!
  rank: Int!
  value: Decimal!
}

enum LeaderboardMetric {
  ACCURACY
  PNL
  VOLUME
  ROI
}

# Connections

type AccountConnection {
  edges: [AccountEdge!]!
  nodes: [Account!]!
  pageInfo: PageInfo!
}

type AccountEdge {
  node: Account!
  cursor: String!
}

type QuestionConnection {
  edges: [QuestionEdge!]!
  nodes: [Question!]!
  pageInfo: PageInfo!
}

type QuestionEdge {
  node: Question!
  cursor: String!
}

type ConditionConnection {
  edges: [ConditionEdge!]!
  nodes: [Condition!]!
  pageInfo: PageInfo!
}

type ConditionEdge {
  node: Condition!
  cursor: String!
}

type ConditionGroupConnection {
  edges: [ConditionGroupEdge!]!
  nodes: [ConditionGroup!]!
  pageInfo: PageInfo!
}

type ConditionGroupEdge {
  node: ConditionGroup!
  cursor: String!
}

type PredictionConnection {
  edges: [PredictionEdge!]!
  nodes: [Prediction!]!
  pageInfo: PageInfo!
}

type PredictionEdge {
  node: Prediction!
  cursor: String!
}

type ForecastConnection {
  edges: [ForecastEdge!]!
  nodes: [Forecast!]!
  pageInfo: PageInfo!
}

type ForecastEdge {
  node: Forecast!
  cursor: String!
}

type TradeConnection {
  edges: [TradeEdge!]!
  nodes: [Trade!]!
  pageInfo: PageInfo!
}

type TradeEdge {
  node: Trade!
  cursor: String!
}

type ActivityConnection {
  edges: [ActivityEdge!]!
  nodes: [Activity!]!
  pageInfo: PageInfo!
}

type ActivityEdge {
  node: Activity!
  cursor: String!
}

type PositionConnection {
  edges: [PositionEdge!]!
  nodes: [Position!]!
  pageInfo: PageInfo!
}

type PositionEdge {
  node: Position!
  cursor: String!
}

type PickConfigurationConnection {
  edges: [PickConfigurationEdge!]!
  nodes: [PickConfiguration!]!
  pageInfo: PageInfo!
}

type PickConfigurationEdge {
  node: PickConfiguration!
  cursor: String!
}

type CollateralBalanceSnapshotConnection {
  edges: [CollateralBalanceSnapshotEdge!]!
  nodes: [CollateralBalanceSnapshot!]!
  pageInfo: PageInfo!
}

type CollateralBalanceSnapshotEdge {
  node: CollateralBalanceSnapshot!
  cursor: String!
}

type CollateralTransferConnection {
  edges: [CollateralTransferEdge!]!
  nodes: [CollateralTransfer!]!
  pageInfo: PageInfo!
}

type CollateralTransferEdge {
  node: CollateralTransfer!
  cursor: String!
}

type ProtocolStatsConnection {
  edges: [ProtocolStatsEdge!]!
  nodes: [ProtocolStat!]!
  pageInfo: PageInfo!
}

type ProtocolStatsEdge {
  node: ProtocolStat!
  cursor: String!
}

type VaultStatsConnection {
  edges: [VaultStatsEdge!]!
  nodes: [VaultStat!]!
  pageInfo: PageInfo!
}

type VaultStatsEdge {
  node: VaultStat!
  cursor: String!
}

type VaultConnection {
  edges: [VaultEdge!]!
  nodes: [Vault!]!
  pageInfo: PageInfo!
}

type VaultEdge {
  node: Vault!
  cursor: String!
}

type AccountStatsConnection {
  edges: [AccountStatsEdge!]!
  nodes: [AccountStat!]!
  pageInfo: PageInfo!
}

type AccountStatsEdge {
  node: AccountStat!
  cursor: String!
}

# `metric` lives on the envelope rather than on every leaf row: the
# connection is scoped by the queried metric (constant for the whole
# page), and rows carry an opaque `value: Decimal` whose unit depends
# on that metric. Echoing it once at the envelope makes the payload
# self-describing without per-row repetition. This is the one
# exception in the schema where a connection carries domain metadata
# alongside `pageInfo`.
type AccountRankingConnection {
  edges: [AccountRankingEdge!]!
  nodes: [AccountRanking!]!
  pageInfo: PageInfo!
  metric: LeaderboardMetric!
}

type AccountRankingEdge {
  node: AccountRanking!
  cursor: String!
}

type CategoryConnection {
  edges: [CategoryEdge!]!
  nodes: [Category!]!
  pageInfo: PageInfo!
}

type CategoryEdge {
  node: Category!
  cursor: String!
}

# Stats Types
#
# Stat rows are time-bucketed values, not addressable entities — they
# do not implement Node and cannot be refetched via `node(id:)`.
# Connection cursors over these types encode timestamp position;
# clients re-query with a `timestamp: DateTimeFilter` to traverse.

type ProtocolStat {
  timestamp: DateTime!
  volume: Decimal
  openInterest: Decimal
  trades: Int
  predictions: Int
  forecasts: Int
}

type VaultStat {
  timestamp: DateTime!
  vault: Vault!

  # Share accounting — ERC4626-shaped. `totalAssets` is the vault's NAV
  # in `vault.collateral`; `totalShares` is the outstanding LP-share
  # supply at this snapshot. NAV per share is `totalAssets / totalShares`
  # when both are present.
  totalAssets: Decimal
  totalShares: Decimal

  # Capital state split. `balance` is the vault's holder-account
  # `collateralBalance` at the snapshot; `deployed` is the slice tied up
  # in open positions; `availableAssets` is idle wUSDe usable for new
  # positions or withdrawals. These three reconcile against NAV per
  # vault-specific accounting rules.
  balance: Decimal
  deployed: Decimal
  availableAssets: Decimal

  # LP flows (cumulative through this snapshot). Distinct from
  # `collateralTransfers`: deposits/withdrawals mint or burn vault
  # shares, while a raw collateral transfer in/out of `vault.account`
  # doesn't.
  deposits: Decimal
  withdrawals: Decimal

  # PnL accruals. `cumulativePnL` is net realized + unrealized from
  # market activity through this snapshot; `airdropGains` is external
  # accruals (e.g. point-program payouts) that didn't come from market
  # PnL and are reported separately so APY math doesn't double-count.
  cumulativePnL: Decimal
  airdropGains: Decimal

  # Secondary-market flows (cumulative through this snapshot).
  # `secondaryBought` is wUSDe paid by the vault to buy positions on the
  # secondary market; `secondarySold` is wUSDe received from selling.
  secondaryBought: Decimal
  secondarySold: Decimal

  # `unredeemedClaim` is wUSDe earmarked for the vault from resolved
  # predictions whose winnings haven't been pulled back on-chain yet —
  # included in NAV, excluded from `availableAssets` and `balance`.
  unredeemedClaim: Decimal

  # Settlement outcome counts (cumulative through this snapshot).
  positionsWon: Int
  positionsLost: Int
}

type AccountStat {
  timestamp: DateTime!
  account: Account!
  pnl: Decimal
  volume: Decimal
  accuracy: Decimal
}

# Filter and Order Inputs

input AccountFilter {
  search: String
}

input AccountOrder {
  field: AccountOrderField!
  direction: OrderDirection!
}

enum AccountOrderField {
  CREATED_AT
}

input QuestionFilter {
  search: String
  categoryIds: [ID!]
  tags: [String!]
}

input QuestionOrder {
  field: QuestionOrderField!
  direction: OrderDirection!
}

# All values map to existing partial indexes on the underlying
# `condition` / `condition_group` tables. `UPDATED_AT` is intentionally
# absent — neither table has an `updatedAt` column. `VOLUME` is split
# into windowed values (24h / 7d) because the underlying indexes are
# windowed (`IDX_condition_public_volume24h`, `IDX_cg_total_volume_24h`,
# and 7d siblings) — a generic `VOLUME` would be ambiguous and could
# silently fall back to an in-memory sort.
enum QuestionOrderField {
  CREATED_AT
  RESOLVES_AT
  OPEN_INTEREST
  PREDICTION_COUNT
  SIMILAR_MARKET_VOLUME_24H
  SIMILAR_MARKET_VOLUME_7D
}

input ConditionFilter {
  search: String
  conditionGroupId: IDFilter
  categoryIds: [ID!]
  tags: [String!]
  outcome: ConditionOutcomeFilter
}

input ConditionOrder {
  field: ConditionOrderField!
  direction: OrderDirection!
}

enum ConditionOrderField {
  CREATED_AT
  RESOLVES_AT
  OPEN_INTEREST
  PREDICTION_COUNT
  SIMILAR_MARKET_VOLUME_24H
  SIMILAR_MARKET_VOLUME_7D
}

input ConditionGroupFilter {
  search: String
  categoryIds: [ID!]
  tags: [String!]
}

input ConditionGroupOrder {
  field: ConditionGroupOrderField!
  direction: OrderDirection!
}

enum ConditionGroupOrderField {
  CREATED_AT
  RESOLVES_AT
  OPEN_INTEREST
  PREDICTION_COUNT
  SIMILAR_MARKET_VOLUME_24H
  SIMILAR_MARKET_VOLUME_7D
}

# `predictor` and `counterparty` filter the two sides of a Prediction
# independently. Strict AND semantics — passing both matches rows
# where the named addresses occupy *those specific* roles (a rare
# query, but legal). To match Predictions where an address appears in
# *either* role, traverse `account(address: ...).predictions` — that
# feed carries OR-across-roles semantics by virtue of the account
# being implicit. Splitting here keeps the root field aligned with
# "no implicit OR" while leaving the symmetric feed reachable on the
# Account type.
input PredictionFilter {
  predictor: AddressFilter
  counterparty: AddressFilter
  conditionId: IDFilter
  conditionGroupId: IDFilter
  pickConfigurationId: IDFilter
  result: PredictionResultFilter
  createdAt: DateTimeFilter
}

input PredictionOrder {
  field: PredictionOrderField!
  direction: OrderDirection!
}

enum PredictionOrderField {
  CREATED_AT
  SETTLED_AT
  COLLATERAL_AMOUNT
  PAYOUT
}

input ForecastFilter {
  forecaster: AddressFilter
  conditionId: IDFilter
  createdAt: DateTimeFilter
}

input ForecastOrder {
  field: ForecastOrderField!
  direction: OrderDirection!
}

enum ForecastOrderField {
  CREATED_AT
  FORECAST_SCORE
}

input TradeFilter {
  account: AddressFilter
  conditionId: IDFilter
  conditionGroupId: IDFilter
  pickConfigurationId: IDFilter
  createdAt: DateTimeFilter
}

input TradeOrder {
  field: TradeOrderField!
  direction: OrderDirection!
}

enum TradeOrderField {
  CREATED_AT
  PRICE
  QUANTITY
  COLLATERAL_AMOUNT
}

input ActivityFilter {
  account: AddressFilter
  activityTypes: [ActivityType!]
  conditionId: IDFilter
  conditionGroupId: IDFilter
  pickConfigurationId: IDFilter
  createdAt: DateTimeFilter
}

input ActivityOrder {
  field: ActivityOrderField!
  direction: OrderDirection!
}

enum ActivityOrderField {
  CREATED_AT
}

input PositionFilter {
  account: AddressFilter
  conditionId: IDFilter
  conditionGroupId: IDFilter
  pickConfigurationId: IDFilter
  size: DecimalFilter
  collateralAmount: DecimalFilter
  createdAt: DateTimeFilter
}

input PositionOrder {
  field: PositionOrderField!
  direction: OrderDirection!
}

enum PositionOrderField {
  CREATED_AT
  UPDATED_AT
  SIZE
  REALIZED_PNL
  UNREALIZED_PNL
}

input PickConfigurationFilter {
  conditionId: IDFilter
  conditionGroupId: IDFilter
}

input PickConfigurationOrder {
  field: PickConfigurationOrderField!
  direction: OrderDirection!
}

enum PickConfigurationOrderField {
  CREATED_AT
}

input CollateralTransferFilter {
  account: AddressFilter
  chainId: IntFilter
  excludeProtocol: Boolean
  createdAt: DateTimeFilter
}

input CollateralTransferOrder {
  field: CollateralTransferOrderField!
  direction: OrderDirection!
}

enum CollateralTransferOrderField {
  CREATED_AT
  AMOUNT
}

input ProtocolStatsFilter {
  timestamp: DateTimeFilter
}

input ProtocolStatsOrder {
  field: ProtocolStatsOrderField!
  direction: OrderDirection!
}

enum ProtocolStatsOrderField {
  TIMESTAMP
}

input VaultStatsFilter {
  timestamp: DateTimeFilter
}

input VaultStatsOrder {
  field: VaultStatsOrderField!
  direction: OrderDirection!
}

enum VaultStatsOrderField {
  TIMESTAMP
}

input VaultFilter {
  address: AddressFilter
  chainId: IntFilter
  kind: VaultKindFilter
}

input VaultKindFilter {
  equals: VaultKind
  in: [VaultKind!]
  notIn: [VaultKind!]
  not: VaultKind
}

input AccountStatsFilter {
  timestamp: DateTimeFilter
}

input AccountStatsOrder {
  field: AccountStatsOrderField!
  direction: OrderDirection!
}

enum AccountStatsOrderField {
  TIMESTAMP
}

input LeaderboardFilter {
  timestamp: DateTimeFilter
}
```

---

## Migration Map

| Current Resolver                                                                                  | Target API                                                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `account(address)`                                                                                | `account(address)`                                                                          |
| `accountStats(address, from, to)`                                                                 | `account(address).stats(filter: { timestamp: { gte, lte } })`                               |
| `accountStatsRank(address, filters)`                                                              | `account(address).rank(metric: ..., filter: ...)`                                           |
| `accountStatsLeaderboardPage(filters, take, skip)`                                                | `leaderboard(metric: ..., ...)`                                                             |
| `accountAccuracyRank(address)`                                                                    | `account(address).rank(metric: ACCURACY)`                                                   |
| `accuracyLeaderboardPage(take, skip)`                                                             | `leaderboard(metric: ACCURACY, ...)`                                                        |
| `activityPage(filters, take, skip)`                                                               | `activity(...)`                                                                             |
| `prediction(predictionId)`                                                                        | `predictionByOnchainId(predictionId)`                                                       |
| `predictionsPage(filters, orderBy, orderDirection, take, skip)`                                   | `predictions(...)`                                                                          |
| `questionsPage(filters, orderBy, orderDirection, take, skip)`                                     | `questions(...)`                                                                            |
| `conditionsPage(filters, orderBy, orderDirection, take, skip)`                                    | `conditions(...)`                                                                           |
| `conditionGroupsPage(filters, orderBy, orderDirection, take, skip)`                               | `conditionGroups(...)`                                                                      |
| `positionsPage(filters, orderBy, orderDirection, take, skip)`                                     | `positions(...)`                                                                            |
| `pickConfigurationsPage(filters, orderBy, orderDirection, take, skip)`                            | `pickConfigurations(...)`                                                                   |
| `trade(tradeHash)`                                                                                | `tradeByHash(hash)`                                                                         |
| `tradesPage(filters, orderBy, orderDirection, take, skip)`                                        | `trades(...)`                                                                               |
| `attestationsPage(filters, orderBy, orderDirection, take, skip)`                                  | `forecasts(...)`                                                                            |
| `collateralBalance(address, chainId, atBlock)`                                                    | `collateralBalance(account, chainId, atBlock)` or `account(address).collateralBalance(...)` |
| `collateralBalanceHistory(address, chainId, count, intervalSeconds)`                              | `collateralBalanceHistory(account, chainId, first, after, intervalSeconds)`                 |
| `collateralTransfersPage(address, chainId, excludeProtocol, orderBy, orderDirection, take, skip)` | `collateralTransfers(...)`                                                                  |
| `protocolStats(from, to)`                                                                         | `protocol.stats(filter: { timestamp: { gte, lte } })` (protocol-level fields only)          |
| `openInterestByCategory`                                                                          | `protocol.openInterestByCategory`                                                           |
| `openInterestByTimeToResolution`                                                                  | `protocol.openInterestByTimeToResolution`                                                   |
| `protocolStats(vaultAddress).vault*` fields                                                       | `vaultByAddress(address).stats(filter: { timestamp: { gte, lte } })` (per-vault snapshots)  |
| `vaultStats(vaultAddress, from, to)`                                                              | `vaultByAddress(address).stats(filter: { timestamp: { gte, lte } })`                        |
| `categoriesPage(take, skip)`                                                                      | `categories(...)`                                                                           |
| `popularTags`                                                                                     | `popularTags(...)`                                                                          |

---

## Rollout Plan

The redesign ships as a sequence of incremental PRs grouped into two independent streams that fan out from a shared foundation and re-converge at the end. Stream A handles market mechanics; Stream B handles user activity and treasury. Within a stream, PRs are sequential because later types reference earlier ones; **across streams, PRs can land in parallel** because the streams intentionally avoid cross-stream child connections until the convergence PR.

### PR 1 — Foundation

`Node`, `PageInfo`, scalars (`Address`, `BigInt`, `Bytes32`, `DateTime`, `Decimal`), `OrderDirection`, `node(id:)`, `nodes(ids:)`, opaque global ID helpers. Everything below depends on this.

### Stream A — market mechanics

#### PR 2 — Conditions + ConditionGroups + Questions

New types, top-level queries, deprecate old siblings. **No cross-stream child connections** (no `.predictions`, `.forecasts` on these yet — those land in PR 6).

#### PR 3 — PickConfigurations + Trades + Positions

`Pick → Condition` is in-stream, fine. Top-level queries, `tradeByHash`, deprecations.

### Stream B — user activity & treasury

#### PR 4 — Predictions + Forecasts (Attestation rename)

Both user-authored, both have on-chain-id sibling lookups (`predictionByOnchainId`, `forecastByUid`). The `Attestation → Forecast` rename surface lives here. **No cross-stream child connections.**

#### PR 5 — Collateral + Protocol + Vault + Categories + popularTags

Self-contained: `CollateralBalance`, `CollateralTransfer`, `protocol.stats`, `protocol.vault().stats`, `categories`, `popularTags`.

### Convergence

#### PR 6 — Account + Activity + Leaderboard + cross-entity wire-up

`Account` with all its child connections (`.predictions`, `.trades`, etc.). `ActivityItem` union over `Prediction | Trade | Forecast`. Top-level `leaderboard` query. Adds convenience connections on earlier entities:

- `Condition.predictions` / `.trades` / `.forecasts`
- `Question.predictions` / `.trades` / `.forecasts` / `.activity`
- `PickConfiguration.predictions` / `.trades` / `.positions`

This is the only PR that touches cross-stream wiring. The deferral is deliberate: by forbidding cross-stream child connections in PRs 2–5, the streams stay mergeable in any order, and the connective tissue ships in a single coherent pass once all the upstream types are stable.

### Parallelization summary

| Concurrent pair | Status                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| PR 2 ‖ PR 4     | ✅ Different streams.                                                     |
| PR 3 ‖ PR 5     | ✅ Different streams (after their in-stream predecessors land).           |
| PR 2 ‖ PR 3     | ❌ Same stream — PR 3's `Pick → Condition` references PR 2's `Condition`. |
| PR 4 ‖ PR 5     | ❌ Same stream — sequential.                                              |
| Anything ‖ PR 6 | ❌ PR 6 is the convergence; requires both streams complete.               |

---

## Implementation Notes

### Global IDs

Use opaque global IDs for all `Node` types.

Examples before encoding:

```text
Account:0xabc...
Condition:123
ConditionGroup:456
Prediction:789
Trade:0xhash...
Forecast:0xeasuid...
Position:999
PickConfiguration:321
```

Clients should not parse these IDs. Domain IDs should be exposed separately as fields.

### Cursor strategy

Cursors should be opaque.

For stable ordering, encode the order key and tie-breaker:

```text
createdAt:2026-05-14T12:00:00Z:id:Prediction:789
```

Then base64 encode or otherwise make opaque.

### Offset compatibility

Existing `take` / `skip` APIs may remain temporarily during migration, but new public fields should use:

```graphql
first
after
```

Optionally add:

```graphql
last
before
```

later if backwards pagination is needed.

### Nullability

Prefer non-null for fields that are guaranteed by domain model.

Be cautious with fields that are derived, cross-chain, asynchronously indexed, or backfilled.

### Derived field complexity

Derived convenience fields (e.g. `Trade.conditions`, `Position.conditions`) must be costed equivalently to their underlying chain in the complexity estimator. A naive field-count cost lets clients smuggle expensive joins through the shortcut path. If a derived field traverses an unbounded list, do not expose it — keep clients on the explicit chain so the estimator sees the work.

### Connection envelope complexity

The `listMultiplierEstimator` already multiplies `childComplexity` by the list-size arg (`take` / `first`) on the envelope field and _also_ multiplies the inner list field (`items` on `*Page`, `nodes` / `edges` on `*Connection`) by `defaultListSize`. The result is a 10x over-count on every envelope query — a `*Page(take: 15) { items { ... } }` selection scores `1 + (1 + leaf * defaultListSize) * 15` instead of `1 + leaf * 15`, large enough to push reasonable FE queries past the default 15k budget.

#1722 carried a fix for the `*Page` case (detect envelope by name suffix, pass child through unmultiplied for the inner `items` field). That PR was closed alongside #1730 because the flat `balanceMin` filter it introduced is forbidden under the operator-pattern convention, but the estimator fix needs to be re-applied for `*Connection` envelopes when they land in the per-entity migration — same mechanism, different name suffix, plus the dual `nodes` / `edges` shape (both inner list fields, both need the pass-through).

### Position filter — operator pattern supersedes #1722 / #1730

Two in-flight PRs targeting the legacy `positionsPage` filter shape were closed in favor of the operator-pattern surface on `PositionFilter` above:

- **#1722** added `balanceMin: String` (flat `<field>Min` arg) with a permissive `OR pickConfig.resolved = true` keepalive.
- **#1730** redesigned #1722's surface into operator-pattern `balance: BigIntFilter` and `collateral: BigIntFilter` on the legacy field names, deprecating the flat `collateralMin` / `collateralMax` args.

`PositionFilter.size: DecimalFilter` and `PositionFilter.collateralAmount: DecimalFilter` cover the same query needs under the redesign's naming and convention: strict semantics, no implicit OR (the keepalive from #1722 doesn't carry forward), and renamed to match `size` / `collateralAmount` rather than `balance` / `collateral` to avoid two FE migrations in quick succession (`balance` → operator filter now, then `balance` → `size` later). Lands as part of the per-entity Position migration; until then, FE that needs balance filtering composes on the existing `*Page` surface or accepts the complexity budget hit.

### Versioning

Every existing surface that doesn't conform to this plan **must** go through the deprecation cycle below before it can be removed or changed in a breaking way. This applies to renames, type changes, dropped filter options, and removed queries — not just deletions. The redesign is large and incremental; every client (Sapience frontend, external developers, indexers) must always have a one-release window to migrate off any surface this doc supersedes.

Required migration path:

1. Add the new shape alongside the existing field / type / query — additive only, no behavior change to the existing surface.
2. Mark the existing surface `@deprecated` with a reason pointing at the new shape.
3. Update Sapience frontend clients to the new shape.
4. Publish the migration in `packages/api/MIGRATION.md` so external integrators can act.
5. Remove the deprecated surface only after step 4 has been live for at least one release, and only in a release explicitly designated as breaking.

A breaking change that skips steps 1–4 is a bug, not an oversight — flag it in code review even when the deprecated surface "looks dead." Servers don't see clients that haven't migrated yet.

Example:

```graphql
type Query {
  attestationsPage(...): AttestationsPage! @deprecated(reason: "Use forecasts instead.")
}
```

---

## Open Questions

Questions that lock public wire format must be resolved before the per-entity PR that ships the affected type. Additive-only questions can be deferred — adding a field, query, or arg later is non-breaking; removing or reshaping one is.

Numbering is section-prefixed: **D**eferred (`D#`), **P**er-entity (`P#`). Stable across edits — cross-references in the body of this document use these prefixes. Resolved items have been folded into the SDL and principles above and removed from this list; consult `git log` on this file for prior decisions.

### Deferred — safe to ship later

- **D1. `Question.id` synthetic ID** — Underlying `Condition` / `ConditionGroup` already carry Node IDs; clients can key on those. Add a synthetic `Question.id` later if a concrete UI need surfaces. Adding a field is non-breaking; committing to a format prematurely locks it forever.
- **D2. `Activity.id` synthetic ID** — Same logic. Each `Activity` row embeds a Prediction / Trade / Forecast that already has a Node ID; cursor handles in-page identity. Skip until a use case appears.
- **D3. `totalCount` per-connection** — Default is **omit** — the SDL connection types ship without `totalCount` and per-entity PRs add it on a case-by-case basis where the count is cheap (covered index, materialized aggregate). A `totalCount: Int!` field on a row-scanning query is a footgun; addition is non-breaking, so default-off is safer than default-on.
- **D4. `last` / `before` reverse pagination** — Forward is a strict subset; reverse is purely additive. Ship forward-only; revisit if clients need reverse traversal.

### Per-entity — resolve at each PR

- **P1. Sort fields by entity** — Each entity declares its own `<Entity>OrderField` enum listing the fields its indexes support (see "One filter convention, one sort convention" above). Per-entity PRs decide their enum members based on actual index coverage; the SDL enforces the answer.
