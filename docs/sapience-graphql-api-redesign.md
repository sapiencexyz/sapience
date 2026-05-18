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
- `ActivityItem`

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

`ActivityItem` is a derived aggregate feed item over:

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
activityItem(id:)
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
  balance: BigIntFilter
  collateral: BigIntFilter
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

A parallel input exists for each scalar (`IntFilter`, `StringFilter`, `DateTimeFilter`, `BooleanFilter`, `AddressFilter`, plus parameterized `EnumFilter<T>` per enum where filtering is useful).

Rules:

- **Strict semantics, no implicit OR.** `{ balance: { gte: "1" } }` means `balance >= 1`, full stop. Clients that want richer composition issue separate queries or rely on the server to add an explicit `OR` shape later if real demand surfaces.
- **Unsupported operators on a specific field reject** with a clear error, not silently no-op. If a field can only be filtered by `equals` (e.g., a hashed identifier), the resolver rejects `gt`/`lt` rather than returning empty or full results.
- **Forbid flat `<field>Min` / `<field>Max` on new types.** Existing flat args get `@deprecated` with a one-release migration cycle. See PR 1730 (positions `balance` / `collateral`) for the reference migration shape.
- **Booleans stay flat.** `settled: Boolean` rather than `settled: BooleanFilter` — there is no `gt true` and the operator pattern adds noise without benefit.

The SDL draft elsewhere in this document predates the operator-pattern convention and still shows flat fields like `conditionId: ID` and `createdAfter: DateTime`. Those examples will be normalized to operator-pattern as per-entity PRs land — the draft is illustrative of shape, not the final filter input definitions.

#### Sort

Replace the today-pattern of `orderBy: <FieldEnum>, orderDirection: ASC|DESC` with a single multi-key argument:

```graphql
predictions(
  first: Int
  after: String
  filter: PredictionFilter
  orderBy: [PredictionOrder!]
): PredictionConnection!

input PredictionOrder {
  field: PredictionOrderField!
  direction: OrderDirection!
}

enum PredictionOrderField {
  CREATED_AT
  SETTLED_AT
  COLLATERAL
  PAYOUT
}
```

Rules:

- **Array shape unlocks multi-key sort.** `[{field: ENDS_AT, direction: ASC}, {field: VOLUME, direction: DESC}]` is a single sort key with a tie-breaker.
- **Each entity declares its own `<Entity>OrderField` enum** listing the fields the entity's indexes actually support. This answers open question #6 (which sort fields are supported) at the SDL level: if a field isn't in the enum, you can't sort by it.
- **Adding a sort field is non-breaking; removing one is.** Treat the order-field enum like every other public enum — addition-only after first ship.
- **Default order belongs in the resolver, not the schema.** Document the default in the field description ("orders by `CREATED_AT DESC` when `orderBy` is omitted") rather than encoding it as a default argument that drifts.

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

interface Node {
  id: ID!
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
  id: ID!

  # Exactly one of Condition | ConditionGroup. Modeled as a union so
  # the schema enforces mutual exclusion and clients can't silently
  # observe a both-null or both-set state. `__typename` on the union
  # member subsumes the old `questionType` enum.
  source: ConditionOrConditionGroup!

  title: String!
  description: String
  status: QuestionStatus!
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

enum QuestionStatus {
  ACTIVE
  RESOLVED
  CANCELLED
  ARCHIVED
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
  status: ConditionStatus!

  conditionGroup: ConditionGroup
  question: Question!

  pickConfigurations(
    first: Int
    after: String
    filter: PickConfigurationFilter
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

enum ConditionStatus {
  ACTIVE
  RESOLVED
  CANCELLED
  ARCHIVED
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
  counterparty: Account
  pickConfiguration: PickConfiguration!
  conditions: [Condition!]!

  collateral: CollateralToken!
  collateralAmount: Decimal!

  status: PredictionStatus!
  result: PredictionResult!
  payout: Decimal

  createdAt: DateTime!
  settledAt: DateTime
}

enum PredictionStatus {
  OPEN
  SETTLED
  CANCELLED
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

  condition: Condition
  conditionGroup: ConditionGroup
  pickConfiguration: PickConfiguration

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

  collateral: CollateralToken!
  size: Decimal
  averagePrice: Decimal
  realizedPnl: Decimal
  unrealizedPnl: Decimal

  createdAt: DateTime!
  updatedAt: DateTime
}

type ActivityItem {
  id: ID!
  activityType: ActivityType!
  subject: ActivitySubject!
  account: Account
  createdAt: DateTime!
}

union ActivitySubject = Prediction | Trade | Forecast

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
  vault(address: Address!): Vault
}

type Vault implements Node {
  id: ID!
  address: Address!
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
  nodes: [ActivityItem!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type ActivityEdge {
  node: ActivityItem!
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
  direction: OrderDirection! = DESC
}

enum AccountOrderField {
  CREATED_AT
}

input QuestionFilter {
  search: String
  categoryIds: [ID!]
  tags: [String!]
  status: [QuestionStatus!]
}

input QuestionOrder {
  field: QuestionOrderField!
  direction: OrderDirection! = DESC
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
  conditionGroupId: ID
  categoryIds: [ID!]
  tags: [String!]
  status: [ConditionStatus!]
}

input ConditionOrder {
  field: ConditionOrderField!
  direction: OrderDirection! = DESC
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
  direction: OrderDirection! = DESC
}

enum ConditionGroupOrderField {
  CREATED_AT
  UPDATED_AT
  OPEN_INTEREST
  VOLUME
}

input PredictionFilter {
  account: Address
  conditionId: ID
  conditionGroupId: ID
  pickConfigurationId: ID
  status: [PredictionStatus!]
  createdAfter: DateTime
  createdBefore: DateTime
}

input PredictionOrder {
  field: PredictionOrderField!
  direction: OrderDirection! = DESC
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
  pickConfigurationId: IDFilter
  createdAt: DateTimeFilter
}

input ForecastOrder {
  field: ForecastOrderField!
  direction: OrderDirection! = DESC
}

enum ForecastOrderField {
  CREATED_AT
  FORECAST_SCORE
}

input TradeFilter {
  account: Address
  conditionId: ID
  conditionGroupId: ID
  pickConfigurationId: ID
  createdAfter: DateTime
  createdBefore: DateTime
}

input TradeOrder {
  field: TradeOrderField!
  direction: OrderDirection! = DESC
}

enum TradeOrderField {
  CREATED_AT
  PRICE
  QUANTITY
  COLLATERAL_AMOUNT
}

input ActivityFilter {
  account: Address
  activityTypes: [ActivityType!]
  conditionId: ID
  conditionGroupId: ID
  pickConfigurationId: ID
  createdAfter: DateTime
  createdBefore: DateTime
}

input ActivityOrder {
  field: ActivityOrderField!
  direction: OrderDirection! = DESC
}

enum ActivityOrderField {
  CREATED_AT
}

input PositionFilter {
  account: Address
  conditionId: ID
  conditionGroupId: ID
  pickConfigurationId: ID
}

input PositionOrder {
  field: PositionOrderField!
  direction: OrderDirection! = DESC
}

enum PositionOrderField {
  CREATED_AT
  UPDATED_AT
  SIZE
  REALIZED_PNL
  UNREALIZED_PNL
}

input PickConfigurationFilter {
  conditionId: ID
  conditionGroupId: ID
}

input PickConfigurationOrder {
  field: PickConfigurationOrderField!
  direction: OrderDirection! = DESC
}

enum PickConfigurationOrderField {
  CREATED_AT
}

input CollateralTransferFilter {
  account: Address
  chainId: Int
  excludeProtocol: Boolean
  createdAfter: DateTime
  createdBefore: DateTime
}

input CollateralTransferOrder {
  field: CollateralTransferOrderField!
  direction: OrderDirection! = DESC
}

enum CollateralTransferOrderField {
  CREATED_AT
  AMOUNT
}

input ProtocolStatsFilter {
  from: DateTime
  to: DateTime
  interval: StatsInterval
}

input ProtocolStatsOrder {
  field: ProtocolStatsOrderField!
  direction: OrderDirection! = ASC
}

enum ProtocolStatsOrderField {
  TIMESTAMP
}

input VaultStatsFilter {
  from: DateTime
  to: DateTime
  interval: StatsInterval
}

input VaultStatsOrder {
  field: VaultStatsOrderField!
  direction: OrderDirection! = ASC
}

enum VaultStatsOrderField {
  TIMESTAMP
}

input AccountStatsFilter {
  from: DateTime
  to: DateTime
  interval: StatsInterval
}

input AccountStatsOrder {
  field: AccountStatsOrderField!
  direction: OrderDirection! = ASC
}

enum AccountStatsOrderField {
  TIMESTAMP
}

enum StatsInterval {
  HOUR
  DAY
  WEEK
  MONTH
}

input LeaderboardFilter {
  from: DateTime
  to: DateTime
}
```

---

## Migration Map

| Current Resolver                                                                                  | Target API                                                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `account(address)`                                                                                | `account(address)`                                                                          |
| `accountStats(address, from, to)`                                                                 | `account(address).stats(filter: { from, to })`                                              |
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
| `protocolStats(from, to)`                                                                         | `protocol.stats(filter: { from, to })`                                                      |
| `openInterestByCategory`                                                                          | `protocol.openInterestByCategory`                                                           |
| `openInterestByTimeToResolution`                                                                  | `protocol.openInterestByTimeToResolution`                                                   |
| `vaultStats(vaultAddress, from, to)`                                                              | `protocol.vault(address).stats(filter: { from, to })`                                       |
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

### Deferred — safe to ship later

1. **`Question.id` synthetic ID** — Underlying `Condition` / `ConditionGroup` already carry Node IDs; clients can key on those. Add a synthetic `Question.id` later if a concrete UI need surfaces. Adding a field is non-breaking; committing to a format prematurely locks it forever.
2. **`ActivityItem.id` synthetic ID** — Same logic. Each `ActivityItem` embeds a Prediction / Trade / Forecast that already has a Node ID; cursor handles in-page identity. Skip until a use case appears.
3. **`totalCount` per-connection** — Per-connection call. Add where the count is cheap (covered index, materialized aggregate); omit where it's a table scan. Adding later is non-breaking.
4. **`last` / `before` reverse pagination** — Forward is a strict subset; reverse is purely additive. Ship forward-only; revisit if clients need reverse traversal.

### Per-entity — resolve at each PR

6. **Sort fields by entity** — Now answered structurally: each entity declares its own `<Entity>OrderField` enum listing the fields its indexes support (see "One filter convention, one sort convention" above). Per-entity PRs decide their enum members based on actual index coverage; the SDL enforces the answer.

### Resolved — locked direction, doc updated

3. **`Forecast.subject` naming** — RESOLVED. The EAS "subject" (recipient) on a forecast attestation is the conditionId it targets; that link is already typed as `condition: Condition` on `Forecast`. The redundant `subject: Address` field is dropped from the SDL. Forecasts target a single `Condition` (not a `ConditionGroup`), so `ForecastFilter.conditionGroupId` is also dropped.
4. **`Prediction.counterparty` nullability** — RESOLVED. Ship non-null (`counterparty: Account!`). Prisma schema declares the column non-null (`counterparty String @db.VarChar` in `prisma/schema.prisma`); every indexer write path (`predictionMarketEscrowIndexer.ts:706, 743`) sets it from the on-chain event payload, which is itself a non-null `0x${string}`. No backfill or schema migration needed.
5. **`Question` union vs. nullable pair** — RESOLVED. Modeled as `union ConditionOrConditionGroup = Condition | ConditionGroup`, exposed as `Question.source: ConditionOrConditionGroup!`. Schema enforces "exactly one of," eliminating the both-null / both-set bug class. The `questionType: QuestionType` enum is removed — `__typename` on the union member subsumes it. Name follows GitHub's `IssueOrPullRequest` precedent: literal, no abbreviation, no parallel concept ("Market", "Source") introduced.
6. **Collateral field and type naming** — RESOLVED. Type is `CollateralToken` (was `CollateralAsset`); field is `collateral: CollateralToken!` on every type that exposes it (`Prediction`, `Position`, `Trade`, `CollateralBalance`, `CollateralBalanceSnapshot`, `CollateralTransfer`). The full `CollateralToken` record carries `{ symbol, address, decimals, chainId }`, so the field name doesn't need to disambiguate between address and ticker — both live inside.

### Still open

7. **Status enums — audit done, design call needed.** The audit revealed that the doc's status enums were aspirational, not migrations from existing String fields. Findings + remaining design questions:

   **ConditionGroup — RESOLVED inside this open question.** No `status` field today, no `status` field going forward. `ConditionGroupStatus` enum dropped; `ConditionGroup.status` field dropped; `ConditionGroupFilter.status` dropped. Group-level state is derivable client-side from child Condition state if any UI needs it.

   **Prediction `result` — RESOLVED inside this open question.** Public enum is `enum PredictionResult { UNRESOLVED, PREDICTOR_WINS, COUNTERPARTY_WINS }`. The Prisma `SettlementResult` enum has a fourth value `NON_DECISIVE`, but the contract collapses non-decisive outcomes to `COUNTERPARTY_WINS` at the resolution layer (`PredictionMarketEscrow.sol:_evaluatePick` and the rationale comment at L1262–1267: "non-decisive outcomes are treated as counterparty wins ... SettlementResult has no DRAW variant"). The indexer's `mapSettlementResult` retains a `case 3 → 'NON_DECISIVE'` branch that is unreachable from current contract behavior — vestigial code, future cleanup. Any historical rows carrying `NON_DECISIVE` from an earlier protocol version can be folded to `COUNTERPARTY_WINS` on the fly in the resolver; no backfill required.

   **Condition `status` — still open.** No `status` field today; state is three Booleans (`settled`, `resolvedToYes`, `nonDecisive`). The proposed `enum ConditionStatus { ACTIVE, RESOLVED, CANCELLED, ARCHIVED }` contains values (`CANCELLED`, `ARCHIVED`) that nothing in the data model produces. Open: drop those values and derive `status` from the Booleans (`ACTIVE`/`RESOLVED`, with `nonDecisive` either folded into `RESOLVED` or surfaced as a distinct state), or add columns to support `CANCELLED` / `ARCHIVED` if there's a real product need?

   **Prediction `status` vs. `settled` — still open.** Proposed `enum PredictionStatus { OPEN, SETTLED, CANCELLED }` is mostly sugar on the existing `settled` Boolean (`OPEN = !settled`, `SETTLED = settled`). `CANCELLED` has no source in the data model today. Open: drop `CANCELLED` and let `status` be a derived two-state enum, or define what produces a cancelled prediction (admin override? on-chain unwind path?) and add the column.

   **`Question.status` derivation — still open.** Since `Question` wraps either a `Condition` or a `ConditionGroup`, and `ConditionGroup` has no status, the `Question.status` field needs an explicit derivation rule. Plausible: when source is a Condition, mirror its status; when source is a ConditionGroup, compute from children (all child Conditions resolved → `RESOLVED`, any unresolved → `ACTIVE`, etc.). Open: define the rule formally, or drop `Question.status` and let clients derive whatever view-state they need themselves.
