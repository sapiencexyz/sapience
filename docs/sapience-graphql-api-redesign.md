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

A `Question` may still expose a synthetic `id` for UI rendering, caching, and list keys, but that ID should be treated as a view ID rather than a canonical graph entity ID.

Example synthetic IDs:

```text
question:condition:123
question:group:456
```

### Activity model

`Activity` is a derived aggregate feed item over:

- `Prediction`
- `Trade`
- `Forecast`

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
- **Forbid flat `<field>Min` / `<field>Max` on new types.** Existing flat args get `@deprecated` with a one-release migration cycle. See PR 1730 (positions `balance` / `collateral`) for the reference migration shape.
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

```graphql
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
  ): AccountLeaderboardConnection!

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
```

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
  ): AccountLeaderboardConnection!

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
  rank(metric: LeaderboardMetric!, filter: LeaderboardFilter): AccountRank

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
  # `account` for a Trade, `forecaster` for a Forecast. Always present
  # — every union member has a non-null actor account.
  account: Account!
  createdAt: DateTime!
}

union ActivitySource = Prediction | Trade | Forecast

# Retained for use in ActivityFilter (filtering an interleaved feed by
# member type is a real use case — clients ask "only my forecasts" or
# "only trades"). On the wire of an Activity row itself, prefer
# `__typename` on `source`.
enum ActivityType {
  PREDICTION
  TRADE
  FORECAST
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

  # Vault is a top-level Node; access via root `vault(id:)`,
  # `vaultByAddress(address:)`, or `vaults(...)`.
}

type Vault implements Node {
  id: ID!
  address: Address!
  collateral: CollateralToken!
  stats(
    first: Int
    after: String
    filter: VaultStatsFilter
    orderBy: VaultStatsOrder
  ): VaultStatsConnection!
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

type AccountRank {
  account: Account!
  metric: LeaderboardMetric!
  rank: Int!
  value: Decimal!
}

enum LeaderboardMetric {
  ACCURACY
  PNL
  VOLUME
  ROI
}

type AccountLeaderboardEntry {
  account: Account!
  rank: Int!
  value: Decimal!
}

# Connections

type AccountConnection {
  edges: [AccountEdge!]!
  nodes: [Account!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type AccountEdge {
  node: Account!
  cursor: String!
}

type QuestionConnection {
  edges: [QuestionEdge!]!
  nodes: [Question!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type QuestionEdge {
  node: Question!
  cursor: String!
}

type ConditionConnection {
  edges: [ConditionEdge!]!
  nodes: [Condition!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type ConditionEdge {
  node: Condition!
  cursor: String!
}

type ConditionGroupConnection {
  edges: [ConditionGroupEdge!]!
  nodes: [ConditionGroup!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type ConditionGroupEdge {
  node: ConditionGroup!
  cursor: String!
}

type PredictionConnection {
  edges: [PredictionEdge!]!
  nodes: [Prediction!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type PredictionEdge {
  node: Prediction!
  cursor: String!
}

type ForecastConnection {
  edges: [ForecastEdge!]!
  nodes: [Forecast!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type ForecastEdge {
  node: Forecast!
  cursor: String!
}

type TradeConnection {
  edges: [TradeEdge!]!
  nodes: [Trade!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type TradeEdge {
  node: Trade!
  cursor: String!
}

type ActivityConnection {
  edges: [ActivityEdge!]!
  nodes: [Activity!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type ActivityEdge {
  node: Activity!
  cursor: String!
}

type PositionConnection {
  edges: [PositionEdge!]!
  nodes: [Position!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type PositionEdge {
  node: Position!
  cursor: String!
}

type PickConfigurationConnection {
  edges: [PickConfigurationEdge!]!
  nodes: [PickConfiguration!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type PickConfigurationEdge {
  node: PickConfiguration!
  cursor: String!
}

type CollateralBalanceSnapshotConnection {
  edges: [CollateralBalanceSnapshotEdge!]!
  nodes: [CollateralBalanceSnapshot!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type CollateralBalanceSnapshotEdge {
  node: CollateralBalanceSnapshot!
  cursor: String!
}

type CollateralTransferConnection {
  edges: [CollateralTransferEdge!]!
  nodes: [CollateralTransfer!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type CollateralTransferEdge {
  node: CollateralTransfer!
  cursor: String!
}

type ProtocolStatsConnection {
  edges: [ProtocolStatsEdge!]!
  nodes: [ProtocolStat!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type ProtocolStatsEdge {
  node: ProtocolStat!
  cursor: String!
}

type VaultStatsConnection {
  edges: [VaultStatsEdge!]!
  nodes: [VaultStat!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type VaultStatsEdge {
  node: VaultStat!
  cursor: String!
}

type VaultConnection {
  edges: [VaultEdge!]!
  nodes: [Vault!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type VaultEdge {
  node: Vault!
  cursor: String!
}

type AccountStatsConnection {
  edges: [AccountStatsEdge!]!
  nodes: [AccountStat!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type AccountStatsEdge {
  node: AccountStat!
  cursor: String!
}

type AccountLeaderboardConnection {
  edges: [AccountLeaderboardEdge!]!
  nodes: [AccountLeaderboardEntry!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type AccountLeaderboardEdge {
  node: AccountLeaderboardEntry!
  cursor: String!
}

type CategoryConnection {
  edges: [CategoryEdge!]!
  nodes: [Category!]!
  pageInfo: PageInfo!
  totalCount: Int
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
  totalAssets: Decimal
  totalShares: Decimal
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

enum QuestionOrderField {
  CREATED_AT
  UPDATED_AT
  OPEN_INTEREST
  VOLUME
  RESOLVES_AT
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
  UPDATED_AT
  RESOLVES_AT
  OPEN_INTEREST
  VOLUME
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
  UPDATED_AT
  OPEN_INTEREST
  VOLUME
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
| `protocolStats(from, to)`                                                                         | `protocol.stats(filter: { timestamp: { gte, lte } })`                                       |
| `openInterestByCategory`                                                                          | `protocol.openInterestByCategory`                                                           |
| `openInterestByTimeToResolution`                                                                  | `protocol.openInterestByTimeToResolution`                                                   |
| `vaultStats(vaultAddress, from, to)`                                                              | `vaultByAddress(address).stats(filter: { timestamp: { gte, lte } })`                        |
| `categoriesPage(take, skip)`                                                                      | `categories(...)`                                                                           |
| `popularTags`                                                                                     | `popularTags(...)`                                                                          |

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

### Versioning

Recommended migration path:

1. Add new fields alongside existing fields.
2. Mark old fields deprecated with `@deprecated`.
3. Update frontend clients.
4. Publish external migration guide.
5. Remove deprecated fields only in a major API version.

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
- **D3. `totalCount` per-connection** — Per-connection call. Add where the count is cheap (covered index, materialized aggregate); omit where it's a table scan. Adding later is non-breaking.
- **D4. `last` / `before` reverse pagination** — Forward is a strict subset; reverse is purely additive. Ship forward-only; revisit if clients need reverse traversal.

### Per-entity — resolve at each PR

- **P1. Sort fields by entity** — Each entity declares its own `<Entity>OrderField` enum listing the fields its indexes support (see "One filter convention, one sort convention" above). Per-entity PRs decide their enum members based on actual index coverage; the SDL enforces the answer.
