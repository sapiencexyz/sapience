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

However, because the model is technically multi-collateral aware, public types should expose a `collateralAsset` field for forward compatibility.

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
  questionType: QuestionType!

  condition: Condition
  conditionGroup: ConditionGroup

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

enum QuestionType {
  CONDITION
  GROUP
}

enum QuestionStatus {
  ACTIVE
  RESOLVED
  CANCELLED
  ARCHIVED
}

type ConditionGroup implements Node {
  id: ID!
  databaseId: Int!
  title: String!
  description: String
  status: ConditionGroupStatus!

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

enum ConditionGroupStatus {
  ACTIVE
  RESOLVED
  CANCELLED
  ARCHIVED
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

  collateralAsset: CollateralAsset!
  collateralAmount: Decimal!

  status: PredictionStatus!
  result: PredictionResult
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
  WON
  LOST
  PUSH
}

type Forecast implements Node {
  id: ID!
  uid: Bytes32!

  forecaster: Account!
  subject: Address
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

  collateralAsset: CollateralAsset!
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

  collateralAsset: CollateralAsset!
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

type CollateralAsset {
  symbol: String!
  address: Address!
  decimals: Int!
  chainId: Int!
}

type CollateralBalance {
  account: Account!
  chainId: Int!
  asset: CollateralAsset!
  amount: Decimal!
  atBlock: BigInt
}

type CollateralBalanceSnapshot {
  account: Account!
  chainId: Int!
  asset: CollateralAsset!
  amount: Decimal!
  blockNumber: BigInt!
  timestamp: DateTime!
}

type CollateralTransfer implements Node {
  id: ID!
  account: Account!
  chainId: Int!
  asset: CollateralAsset!
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
  status: [ConditionGroupStatus!]
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
  account: Address
  conditionId: ID
  conditionGroupId: ID
  pickConfigurationId: ID
  createdAfter: DateTime
  createdBefore: DateTime
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

These should be resolved before implementation:

1. Should `Question.id` be exposed publicly as a synthetic stable view ID, or should it be omitted to avoid implying canonical identity?
2. Should `ActivityItem.id` be exposed as a synthetic ID, or should activity feed items rely only on cursor identity?
3. Should `Forecast.subject` use EAS language, or should it be named more product-semantically?
4. Should `Prediction.counterparty` be nullable in all cases?
5. Which exact statuses exist today for `Condition`, `ConditionGroup`, and `Prediction`?
6. Which sort fields are actually supported efficiently by indexes today?
7. Should `totalCount` be available on all connections, or only where it is cheap?
8. Do public clients need `last` / `before`, or is forward pagination enough?
9. Should `Question` expose `condition` and `conditionGroup` as nullable fields, or should it be modeled as a union?
10. Should `collateralAsset` be a scalar enum-like object for wUSDe today, or fully backed by an asset table/type?
