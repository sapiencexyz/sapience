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
  settled: Boolean
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

- **Strict semantics, no implicit OR.** `{ balance: { gte: "1" } }` means `balance >= 1`, full stop. Clients that want richer composition issue separate queries or rely on the server to add an explicit `OR` shape later if real demand surfaces.
- **Unsupported operators on a specific field reject** with a clear error, not silently no-op. If a field can only be filtered by `equals` (e.g., a hashed identifier), the resolver rejects `gt`/`lt` rather than returning empty or full results.
- **Forbid flat `<field>Min` / `<field>Max` on new types.** Existing flat args get `@deprecated` with a one-release migration cycle. See PR 1730 (positions `balance` / `collateral`) for the reference migration shape.
- **Booleans stay flat.** `settled: Boolean` rather than `settled: BooleanFilter` — there is no `gt true` and the operator pattern adds noise without benefit.

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

input AddressFilter {
  equals: Address
  in: [Address!]
  notIn: [Address!]
  not: Address
}

input IDFilter {
  equals: ID
  in: [ID!]
  notIn: [ID!]
  not: ID
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
}

input DateTimeFilter {
  equals: DateTime
  gt: DateTime
  gte: DateTime
  lt: DateTime
  lte: DateTime
}

input StringFilter {
  equals: String
  contains: String
  startsWith: String
  endsWith: String
  in: [String!]
  notIn: [String!]
  not: String
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

  stats(
    first: Int
    after: String
    filter: AccountStatsFilter
    orderBy: AccountStatsOrder
  ): AccountStatsConnection!
  rank(metric: LeaderboardMetric!, filter: LeaderboardFilter): AccountRank

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

  # Resolution state. Three Booleans match the underlying on-chain
  # state machine: `settled` flips true when the resolver returns,
  # `resolvedToYes` is only meaningful when `settled` is true, and
  # `nonDecisive` marks tie/void outcomes (which the protocol collapses
  # to COUNTERPARTY_WINS at the Prediction layer). Question-level views
  # derive their state from these Booleans on the underlying Condition;
  # there's no separate `ConditionStatus` enum because today's data
  # model has no other states (no `CANCELLED`, no `ARCHIVED`).
  settled: Boolean!
  resolvedToYes: Boolean!
  nonDecisive: Boolean!
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
  resolvesAt: DateTime
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

  # Settlement state. `settled` flips true when the on-chain prediction
  # is resolved; `result` carries the outcome. No separate
  # `PredictionStatus` enum — today's data model has no `CANCELLED`
  # state, so a derived status enum would just be sugar on the Boolean.
  settled: Boolean!
  result: PredictionResult!
  payout: Decimal

  createdAt: DateTime!
  settledAt: DateTime
}

enum PredictionResult {
  UNRESOLVED
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
  # and `condition.pickConfigurations`. Nullable because the Prisma column
  # is nullable today — schemas that aren't condition-keyed produce
  # forecasts without a Condition link.
  condition: Condition

  forecastScore: Decimal

  createdAt: DateTime!
}

type Trade implements Node {
  id: ID!
  hash: Bytes32!

  account: Account!
  pickConfiguration: PickConfiguration!
  conditions: [Condition!]!

  collateral: CollateralToken!
  collateralAmount: Decimal

  price: Decimal
  quantity: Decimal

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
  account: Account
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

# Not a Node — see R9. Cursors over `collateralBalanceHistory` encode
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
# See open question R9.

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
  settled: Boolean
  resolvedToYes: Boolean
  nonDecisive: Boolean
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

input PredictionFilter {
  account: AddressFilter
  conditionId: IDFilter
  conditionGroupId: IDFilter
  pickConfigurationId: IDFilter
  settled: Boolean
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
  settled: Boolean
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

Numbering is section-prefixed: **D**eferred (`D#`), **P**er-entity (`P#`), **R**esolved (`R#`). Stable across edits — cross-references in the body of this document use these prefixes.

### Deferred — safe to ship later

- **D1. `Question.id` synthetic ID** — Underlying `Condition` / `ConditionGroup` already carry Node IDs; clients can key on those. Add a synthetic `Question.id` later if a concrete UI need surfaces. Adding a field is non-breaking; committing to a format prematurely locks it forever.
- **D2. `Activity.id` synthetic ID** — Same logic. Each `Activity` row embeds a Prediction / Trade / Forecast that already has a Node ID; cursor handles in-page identity. Skip until a use case appears.
- **D3. `totalCount` per-connection** — Per-connection call. Add where the count is cheap (covered index, materialized aggregate); omit where it's a table scan. Adding later is non-breaking.
- **D4. `last` / `before` reverse pagination** — Forward is a strict subset; reverse is purely additive. Ship forward-only; revisit if clients need reverse traversal.

### Per-entity — resolve at each PR

- **P1. Sort fields by entity** — Each entity declares its own `<Entity>OrderField` enum listing the fields its indexes support (see "One filter convention, one sort convention" above). Per-entity PRs decide their enum members based on actual index coverage; the SDL enforces the answer.

### Resolved — locked direction, doc updated

- **R1. `Forecast` shape — single Condition link only.** The EAS "subject" (recipient) on a forecast attestation is the conditionId it targets; that link is already typed as `condition: Condition` on `Forecast`. The redundant `subject: Address` field is dropped from the SDL. The Prisma `Attestation` model carries exactly one graph link (`conditionId → Condition`); there is no `conditionGroupId` or `pickConfigurationId` column, and the resolver doesn't synthesize them. Accordingly: the aspirational `conditionGroup: ConditionGroup` and `pickConfiguration: PickConfiguration` fields are dropped from `Forecast`, and `ForecastFilter.conditionGroupId` / `pickConfigurationId` are dropped from the filter. Group / pickConfig membership is reachable via `condition.conditionGroup` and `condition.pickConfigurations`. `Forecast.condition` stays nullable because the Prisma column is nullable; tightening to non-null requires a data audit (parallel to R2 for counterparty).
- **R2. `Prediction.counterparty` nullability** — Ship non-null (`counterparty: Account!`). Prisma schema declares the column non-null (`counterparty String @db.VarChar` in `prisma/schema.prisma`); every indexer write path (`predictionMarketEscrowIndexer.ts:706, 743`) sets it from the on-chain event payload, which is itself a non-null `0x${string}`. No backfill or schema migration needed.
- **R3. `Question` union vs. nullable pair** — Modeled as `union ConditionOrConditionGroup = Condition | ConditionGroup`, exposed as `Question.source: ConditionOrConditionGroup!`. Schema enforces "exactly one of," eliminating the both-null / both-set bug class. The `questionType: QuestionType` enum is removed — `__typename` on the union member subsumes it. Name follows GitHub's `IssueOrPullRequest` precedent: literal, no abbreviation, no parallel concept ("Market", "Source") introduced.
- **R4. Collateral field and type naming** — Type is `CollateralToken` (was `CollateralAsset`); field is `collateral: CollateralToken!` on every type that exposes it (`Prediction`, `Position`, `Trade`, `CollateralBalance`, `CollateralBalanceSnapshot`, `CollateralTransfer`). The full `CollateralToken` record carries `{ symbol, address, decimals, chainId }`, so the field name doesn't need to disambiguate between address and ticker — both live inside.
- **R5. Status enums** — The audit revealed that the doc's status enums were aspirational, not migrations from existing wire fields. Once we accept that the data model has only the states it has, every proposed `*Status` enum collapses to either a Boolean (which we already have) or a derivation clients can do themselves. So:

  - **`ConditionStatus` enum — dropped.** No synthetic status. `Condition` directly exposes the three Booleans that carry its actual state: `settled: Boolean!`, `resolvedToYes: Boolean!`, `nonDecisive: Boolean!`, plus `settledAt: UnixSeconds`. Clients render `ACTIVE`/`RESOLVED`/`TIE`/etc. however they want from these. `ConditionFilter.status` replaced with flat Boolean filters (`settled`, `resolvedToYes`, `nonDecisive`).
  - **`ConditionGroupStatus` enum — dropped.** ConditionGroup has no status field today and isn't getting one. If any UI needs a group-level state, it derives from child Conditions.
  - **`PredictionStatus` enum — dropped.** Was sugar on the existing `settled` Boolean (`OPEN = !settled`, `SETTLED = settled`); no `CANCELLED` state exists in the data model. `Prediction` directly exposes `settled: Boolean!` + `result: PredictionResult!`. `PredictionFilter.status` replaced with `settled: Boolean`.
  - **`QuestionStatus` enum — dropped.** Question wraps either Condition or ConditionGroup via the `source` union; clients read state through `... on Condition { settled, resolvedToYes, nonDecisive }`. No view-level status field needed.
  - **`PredictionResult` enum values — finalized as** `{ UNRESOLVED, PREDICTOR_WINS, COUNTERPARTY_WINS }`. Contract collapses non-decisive outcomes to `COUNTERPARTY_WINS` at the resolution layer (`PredictionMarketEscrow.sol:_evaluatePick`, comment at L1262–1267: "SettlementResult has no DRAW variant ... counterparties bear no prediction risk on void/tie outcomes"). Made `Prediction.result` non-null.

  **Follow-up cleanup (separate PR to staging, not this doc PR):** the indexer's `mapSettlementResult` retains a `case 3 → 'NON_DECISIVE'` branch unreachable from current contract behavior; the Prisma `SettlementResult` enum still lists `NON_DECISIVE`. Both are vestigial. Cleanup can either drop them outright (after confirming no live rows carry the value) or leave a tombstone on the Prisma side and remove only the indexer branch.

- **R6. Sort shape (singular vs array)** — Singular `orderBy: <Entity>Order` (matching GitHub's `IssueOrder` precedent), not the array shape originally drafted. Multi-key tiebreakers can be added later non-breakingly via a `then: <Entity>Order` field on the order input if real demand surfaces.
- **R7. Filter convention** — Operator-pattern (Prisma-style) for single-value scalars (`AddressFilter`, `IDFilter`, `BigIntFilter`, `IntFilter`, `DecimalFilter`, `DateTimeFilter`, `StringFilter`). No `BooleanFilter` — Booleans stay flat per the principles. Multi-value membership filters and full-text search stay flat. See principles section for details. Position-specific corollary: the filter on `Position` uses `size: DecimalFilter` and `collateralAmount: DecimalFilter` to match the type's field names (the PR 1730 column-aligned names `balance` / `collateral` are not used on the wire — `size` is the renamed `balance` column, and `collateral` on the type is the `CollateralToken` reference).
- **R8. `Vault` root access + no top-level sort** — Vault is a Node, so it gets `vault(id:)`, `vaultByAddress(address:)`, and `vaults(...)` root fields — matching the prediction/trade/forecast pattern. The previous nesting under `protocol.vault(address)` is removed; Vault is independent and shouldn't sit behind a Protocol grouping. Structurally, a Vault is "an address with an attached time series" — parallel to `Account` for stats purposes (`Vault.stats: VaultStatsConnection!` mirrors `Account.stats: AccountStatsConnection!`). There is no `Vault` table in Prisma; vaults come from static config (`getConfiguredVaults(chainId)`). So `vaults(...)` has no `orderBy:` arg and there is no `VaultOrder` / `VaultOrderField` — the entity has no indexed column to sort on. The field description should document that rows return in registration order. This is the one Connection in the schema without an `orderBy:` arg; that's a deliberate consequence of P1 ("the order-field enum lists fields the entity's indexes actually support"), not an oversight.
- **R9. Stat-row connections over non-Node types** — `ProtocolStat`, `VaultStat`, `AccountStat`, and `CollateralBalanceSnapshot` stay as Connection members without implementing `Node`. They are time-bucketed values, not addressable entities; refetching a stat row by ID is meaningless because the row is uniquely identified by `(entity, timestamp)` already reachable via the parent + filter. Cursors on these connections encode timestamp position. The type-level descriptions in the SDL document this.
- **R10. `UnixSeconds` scalar** — Declared explicitly. Used for timestamps that come directly from chain storage (uint256 seconds) where round-tripping to `DateTime` loses precision. Indexed / derived timestamps continue to use `DateTime`.
