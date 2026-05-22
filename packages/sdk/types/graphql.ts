export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** 0x-prefixed lowercase 20-byte Ethereum address. Mixed-case checksum input is accepted and normalized to lowercase. */
  Address: { input: any; output: any; }
  /** The `BigInt` scalar type represents non-fractional signed whole numeric values. */
  BigInt: { input: any; output: any; }
  /** 0x-prefixed lowercase 32-byte hex value. Used for transaction hashes, EAS UIDs, and other 32-byte on-chain identifiers. */
  Bytes32: { input: any; output: any; }
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar.This scalar is serialized to a string in ISO 8601 format and parsed from a string in ISO 8601 format. */
  DateTime: { input: any; output: any; }
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar.This scalar is serialized to a string in ISO 8601 format and parsed from a string in ISO 8601 format. */
  DateTimeISO: { input: any; output: any; }
  /** Prisma.Decimal — round-tripped as a decimal string with arbitrary precision. */
  Decimal: { input: any; output: any; }
  /** Integer Unix timestamp in seconds (UTC). Wire format is Int; the scalar carries the unit/TZ contract in the type system rather than the field name. */
  UnixSeconds: { input: any; output: any; }
};

/**
 * Address-keyed account record. The thin replacement for the Prisma-leaked
 * `User` type — exposes only the fields the public API actually needs (today,
 * that's referral-graph data). When address-keyed metadata that doesn't fit
 * elsewhere shows up (display name, avatar, settings), it can grow here
 * without renaming.
 */
export type Account = Node & {
  __typename?: 'Account';
  /** Canonical Ethereum wallet address. */
  address: Scalars['Address']['output'];
  collateralBalance: CollateralBalance;
  /** When this account first appeared in the database. */
  createdAt: Scalars['DateTimeISO']['output'];
  forecasts: ForecastConnection;
  id: Scalars['ID']['output'];
  /**
   * Maximum number of referrals this account's code allows. Default is 0,
   * so codes are not usable until explicitly configured.
   */
  maxReferrals: Scalars['Int']['output'];
  positions: PositionConnection;
  predictions: PredictionConnection;
  rank?: Maybe<AccountRanking>;
  /**
   * keccak256(utf8(trimmed_lowercase_code)) of the user's referral code, if
   * they own one. 0x-prefixed hex.
   */
  refCodeHash?: Maybe<Scalars['String']['output']>;
  /** Accounts referred by this account (via this account's referral code). */
  referrals: Array<Account>;
  /** The account that referred this one (via their referral code), if any. */
  referredBy?: Maybe<Account>;
  /** The referral code this account was referred by, if any. */
  referredByCode?: Maybe<ReferralCode>;
  stats: AccountStatConnection;
  trades: TradeConnection;
};


/**
 * Address-keyed account record. The thin replacement for the Prisma-leaked
 * `User` type — exposes only the fields the public API actually needs (today,
 * that's referral-graph data). When address-keyed metadata that doesn't fit
 * elsewhere shows up (display name, avatar, settings), it can grow here
 * without renaming.
 */
export type AccountCollateralBalanceArgs = {
  atBlock?: InputMaybe<Scalars['BigInt']['input']>;
  chainId: Scalars['Int']['input'];
};


/**
 * Address-keyed account record. The thin replacement for the Prisma-leaked
 * `User` type — exposes only the fields the public API actually needs (today,
 * that's referral-graph data). When address-keyed metadata that doesn't fit
 * elsewhere shows up (display name, avatar, settings), it can grow here
 * without renaming.
 */
export type AccountForecastsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ForecastFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ForecastOrder>;
};


/**
 * Address-keyed account record. The thin replacement for the Prisma-leaked
 * `User` type — exposes only the fields the public API actually needs (today,
 * that's referral-graph data). When address-keyed metadata that doesn't fit
 * elsewhere shows up (display name, avatar, settings), it can grow here
 * without renaming.
 */
export type AccountPositionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PositionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PositionOrder>;
};


/**
 * Address-keyed account record. The thin replacement for the Prisma-leaked
 * `User` type — exposes only the fields the public API actually needs (today,
 * that's referral-graph data). When address-keyed metadata that doesn't fit
 * elsewhere shows up (display name, avatar, settings), it can grow here
 * without renaming.
 */
export type AccountPredictionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PredictionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PredictionOrder>;
};


/**
 * Address-keyed account record. The thin replacement for the Prisma-leaked
 * `User` type — exposes only the fields the public API actually needs (today,
 * that's referral-graph data). When address-keyed metadata that doesn't fit
 * elsewhere shows up (display name, avatar, settings), it can grow here
 * without renaming.
 */
export type AccountRankArgs = {
  filter?: InputMaybe<AccountRankingFilter>;
  metric: LeaderboardMetric;
};


/**
 * Address-keyed account record. The thin replacement for the Prisma-leaked
 * `User` type — exposes only the fields the public API actually needs (today,
 * that's referral-graph data). When address-keyed metadata that doesn't fit
 * elsewhere shows up (display name, avatar, settings), it can grow here
 * without renaming.
 */
export type AccountStatsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<AccountStatFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<AccountStatOrder>;
};


/**
 * Address-keyed account record. The thin replacement for the Prisma-leaked
 * `User` type — exposes only the fields the public API actually needs (today,
 * that's referral-graph data). When address-keyed metadata that doesn't fit
 * elsewhere shows up (display name, avatar, settings), it can grow here
 * without renaming.
 */
export type AccountTradesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<TradeFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<TradeOrder>;
};

/**
 * One row of the accuracy leaderboard — an address with its lifetime
 * accuracy score aggregated across every scored forecast. Parallel
 * to `AccountStatsLeaderboardEntry`.
 */
export type AccountAccuracyLeaderboardEntry = {
  __typename?: 'AccountAccuracyLeaderboardEntry';
  accuracyScore: Scalars['Float']['output'];
  address: Scalars['String']['output'];
};

/** Paginated wrapper around `AccountAccuracyLeaderboardEntry` rows with a server-truth hasMore flag. */
export type AccountAccuracyLeaderboardPage = Page & {
  __typename?: 'AccountAccuracyLeaderboardPage';
  hasMore: Scalars['Boolean']['output'];
  items: Array<AccountAccuracyLeaderboardEntry>;
  /** Eagerly populated: derived from the in-memory leaderboard array. */
  totalCount?: Maybe<Scalars['Int']['output']>;
};

/**
 * Accuracy rank and lifetime score for a single address. Mirrors
 * `AccountStatsRank`'s shape (`address`, the metric (`accuracyScore`),
 * `rank` 1-indexed and null when unranked) plus `totalForecasters` — the
 * size of the scored-forecaster set. Named specifically vs the generic
 * `AccountStatsRank.totalParticipants` because this surface only ranks
 * forecasters; accuracy is lifetime-aggregated (the time-weighted error
 * already weights by recency) so there's no window filter.
 */
export type AccountAccuracyRank = {
  __typename?: 'AccountAccuracyRank';
  accuracyScore: Scalars['Float']['output'];
  address: Scalars['Address']['output'];
  rank?: Maybe<Scalars['Int']['output']>;
  totalForecasters: Scalars['Int']['output'];
};

/**
 * Relay-shaped connection over `Account` rows (User table). Address-only
 * synthetic accounts are not returned — those are reachable through
 * `account(address:)` directly. `totalCount` is the row count matching the
 * filter (cheap — the User table is small).
 */
export type AccountConnection = {
  __typename?: 'AccountConnection';
  edges: Array<AccountEdge>;
  nodes: Array<Account>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type AccountEdge = {
  __typename?: 'AccountEdge';
  cursor: Scalars['String']['output'];
  node: Account;
};

/**
 * Filter input for `accountsConnection`. Intentionally narrow — the only
 * meaningful filter dimension for an address-keyed table is substring
 * match against the address itself.
 */
export type AccountFilter = {
  /**
   * Substring search against the wallet address (case-insensitive). Useful
   * for autocomplete / lookup UIs.
   */
  search?: InputMaybe<Scalars['String']['input']>;
};

export type AccountOrder = {
  direction: OrderDirection;
  field: AccountOrderField;
};

export type AccountOrderField =
  | 'CREATED_AT';

export type AccountRanking = {
  __typename?: 'AccountRanking';
  account: Account;
  rank: Scalars['Int']['output'];
  value: Scalars['String']['output'];
};

export type AccountRankingConnection = {
  __typename?: 'AccountRankingConnection';
  edges: Array<AccountRankingEdge>;
  metric: LeaderboardMetric;
  nodes: Array<AccountRanking>;
  pageInfo: PageInfo;
  /**
   * Size of the underlying ranked set the page is sliced from. Already
   * computed in memory (the leaderboard materializes the full ranking),
   * so cheap to surface.
   */
  totalCount: Scalars['Int']['output'];
};

export type AccountRankingEdge = {
  __typename?: 'AccountRankingEdge';
  cursor: Scalars['String']['output'];
  node: AccountRanking;
};

/**
 * Filter input for the `AccountRankingConnection` returned by
 * `leaderboard(...)`. PNL / VOLUME / ROI aggregate over a configurable
 * window; ACCURACY is lifetime-aggregated (the time-weighted Brier-derived
 * score already weights by recency) and ignores the window. Operator-
 * pattern shape matches `AccountStatFilter`.
 */
export type AccountRankingFilter = {
  /**
   * Filter by aggregation epoch seconds. `{ gte }` sets the window's lower
   * bound, `{ lte }` sets the upper bound; both inclusive. Other operators
   * reject — this is a window selector, not a point query.
   */
  timestamp?: InputMaybe<IntFilter>;
};

/**
 * One row of the per-account stats time series — wallet collateral
 * position, settlement PnL, trade volume, and prediction outcome counts
 * at a single snapshot boundary. Mirrors the fat-row pattern used by
 * `ProtocolStat` / `VaultStat`: per-bucket deltas use the `period…`
 * prefix, cumulative-through-bucket values use the `cumulative…` prefix.
 * Wei amounts are 18-decimal decimal strings; counts are integers.
 *
 * Today this is assembled on-demand from the same SQL helpers that back
 * the deprecated `accountBalance` / `accountPnl` / `accountPredictionCount` /
 * `accountVolume` resolvers, projected to a fixed daily cadence. A
 * follow-up will introduce a real per-account snapshot table and swap
 * the resolver to read from it — the wire shape is the destination, so
 * clients are forward-compatible across that swap.
 */
export type AccountStat = {
  __typename?: 'AccountStat';
  account: Account;
  /** Collateral available to claim from settled positions at this bucket (wei, 18 dec) */
  claimableCollateral: Scalars['String']['output'];
  /** Running cumulative realized PnL through this bucket (wei, 18 dec) */
  cumulativePnL: Scalars['String']['output'];
  /** Running cumulative trade volume through this bucket (wei, 18 dec) */
  cumulativeVolume: Scalars['String']['output'];
  /** Active collateral in open positions at this bucket (wei, 18 dec) */
  deployedCollateral: Scalars['String']['output'];
  /** Realized PnL delta over this bucket (wei, 18 dec) */
  periodPnL: Scalars['String']['output'];
  /** Trade volume delta over this bucket (wei, 18 dec) */
  periodVolume: Scalars['String']['output'];
  /** Predictions lost in this bucket */
  predictionsLost: Scalars['Int']['output'];
  /** Predictions settled non-decisively in this bucket */
  predictionsNonDecisive: Scalars['Int']['output'];
  /** Predictions still pending at the bucket boundary */
  predictionsPending: Scalars['Int']['output'];
  /** Predictions opened in this bucket, total */
  predictionsTotal: Scalars['Int']['output'];
  /** Predictions won (settled in caller's favour) in this bucket */
  predictionsWon: Scalars['Int']['output'];
  /** Snapshot boundary. */
  timestamp: Scalars['UnixSeconds']['output'];
};

export type AccountStatConnection = {
  __typename?: 'AccountStatConnection';
  edges: Array<AccountStatEdge>;
  nodes: Array<AccountStat>;
  pageInfo: PageInfo;
  /**
   * Size of the full time-series rendered by this query (pre-pagination).
   * Already known in memory — the resolver materializes every bucket
   * before slicing — so cheap to surface.
   */
  totalCount: Scalars['Int']['output'];
};

export type AccountStatEdge = {
  __typename?: 'AccountStatEdge';
  cursor: Scalars['String']['output'];
  node: AccountStat;
};

export type AccountStatFilter = {
  timestamp?: InputMaybe<IntFilter>;
};

export type AccountStatOrder = {
  direction: OrderDirection;
  field: AccountStatOrderField;
};

export type AccountStatOrderField =
  | 'TIMESTAMP';

/**
 * Filters for `accountStatsLeaderboardPage` and `accountStatsRank`. All fields
 * are optional: omit the input entirely to rank by `NET_PNL` over all time.
 * `from` omitted ⇒ no lower bound (all-time); `to` omitted ⇒ now. Both bounds
 * are inclusive.
 */
export type AccountStatsFilters = {
  from?: InputMaybe<Scalars['UnixSeconds']['input']>;
  /** @deprecated Use `from: UnixSeconds` — same wire format (Int seconds), the new field drops the unit-suffix in favor of carrying the contract on the scalar type. */
  fromEpoch?: InputMaybe<Scalars['Int']['input']>;
  metric?: InputMaybe<AccountStatsMetric>;
  to?: InputMaybe<Scalars['UnixSeconds']['input']>;
  /** @deprecated Use `to: UnixSeconds` — same wire format (Int seconds), the new field drops the unit-suffix in favor of carrying the contract on the scalar type. */
  toEpoch?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * One row of the account-stats leaderboard — an address with its net PnL,
 * gross gains, gross losses, and trading volume over a window. All amounts
 * are wei strings (18 decimals); `losses` is negative.
 */
export type AccountStatsLeaderboardEntry = {
  __typename?: 'AccountStatsLeaderboardEntry';
  address: Scalars['String']['output'];
  gains: Scalars['String']['output'];
  losses: Scalars['String']['output'];
  netPnL: Scalars['String']['output'];
  volume: Scalars['String']['output'];
};

/** Paginated wrapper around `AccountStatsLeaderboardEntry` rows with a server-truth hasMore flag. */
export type AccountStatsLeaderboardPage = Page & {
  __typename?: 'AccountStatsLeaderboardPage';
  hasMore: Scalars['Boolean']['output'];
  items: Array<AccountStatsLeaderboardEntry>;
  /** Eagerly populated: derived from the in-memory merged-stats array. */
  totalCount?: Maybe<Scalars['Int']['output']>;
};

/** Metric an account-stats leaderboard is ranked by. */
export type AccountStatsMetric =
  | 'GAINS'
  | 'LOSSES'
  | 'NET_PNL'
  | 'VOLUME';

/**
 * Stats + rank for a single address against the same ranked set the
 * leaderboard slices. Stat fields mirror `AccountStatsLeaderboardEntry` and
 * are always populated (zero when the address has no activity in the window).
 * `rank` is 1-indexed against the ranked set for the chosen metric, or null
 * when the address is absent from it. `totalParticipants` is the size of the
 * ranked set in the window (0 when the window has no participants at all,
 * distinguishing an empty-window stub from an unranked address in a
 * populated window).
 */
export type AccountStatsRank = {
  __typename?: 'AccountStatsRank';
  address: Scalars['String']['output'];
  gains: Scalars['String']['output'];
  losses: Scalars['String']['output'];
  netPnL: Scalars['String']['output'];
  rank?: Maybe<Scalars['Int']['output']>;
  totalParticipants: Scalars['Int']['output'];
  volume: Scalars['String']['output'];
};

export type Activity = {
  __typename?: 'Activity';
  account: Account;
  createdAt: Scalars['DateTimeISO']['output'];
  source: ActivitySource;
};

export type ActivityConnection = {
  __typename?: 'ActivityConnection';
  edges: Array<ActivityEdge>;
  nodes: Array<Activity>;
  pageInfo: PageInfo;
  /**
   * Sum of matching Prediction and SecondaryTrade rows for the same filters
   * the page was sliced from. Resolved lazily via two indexed `COUNT(*)`
   * queries only when clients select this field.
   */
  totalCount: Scalars['Int']['output'];
};

export type ActivityEdge = {
  __typename?: 'ActivityEdge';
  cursor: Scalars['String']['output'];
  node: Activity;
};

/**
 * Filter input for the Relay-shaped `activity(...)` connection. Combines
 * with AND. `types: []` is an explicit zero-result query — omit `types`
 * to include both predictions and trades.
 */
export type ActivityFilter = {
  /**
   * Restrict to a single account's activity (case-insensitive). OR-across
   * prediction roles (predictor / counterparty) and trade sides (buyer /
   * seller). Omit for a global feed.
   */
  account?: InputMaybe<Scalars['String']['input']>;
  /**
   * Restrict to activity reachable through a ConditionGroup's member conditions.
   * Expanded server-side into the group's condition ids, then treated as
   * `conditionIds`.
   */
  conditionGroupId?: InputMaybe<Scalars['Int']['input']>;
  /**
   * Restrict to activity on a single condition. Walks Pick → PickConfiguration
   * to derive the matching pickConfigIds (predictions) and predictor /
   * counterparty tokens (trades).
   */
  conditionId?: InputMaybe<Scalars['String']['input']>;
  /**
   * Restrict to activity on any of these conditions. Union with `conditionId`
   * when both are supplied; useful for group-backed feeds where the caller
   * has the condition list pre-resolved.
   */
  conditionIds?: InputMaybe<Array<Scalars['String']['input']>>;
  /**
   * Filter by activity row creation epoch seconds, e.g. `{ gte: 1770000000 }`.
   * Applied as `createdAt` on Predictions (Postgres timestamp) and
   * `executedAt` on Trades (Int seconds) — bounds project to each side's
   * native column type.
   */
  createdAt?: InputMaybe<IntFilter>;
  /**
   * Restrict to activity tied to a single pick configuration. When combined
   * with `conditionId`/`conditionIds`, intersects with that condition's
   * pickConfig set.
   */
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  /**
   * Restrict to one or both ActivityType union members. `[]` is an explicit
   * zero-result query.
   */
  types?: InputMaybe<Array<ActivityType>>;
};

/**
 * Flat filter input for the `accountActivityPage` query. Each field is
 * optional; values combine with AND. Omit `address` for a global feed.
 */
export type ActivityFilters = {
  /** Restrict to a single account's activity (case-insensitive). Omit for a global feed. */
  address?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to activity on a single condition. */
  conditionId?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to activity tied to a single pick configuration. */
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to just prediction events or just trade events. Omit for both. */
  type?: InputMaybe<ActivityItemType>;
};

/** A single activity entry — either a prediction or a trade, sorted by timestamp */
export type ActivityItem = {
  __typename?: 'ActivityItem';
  prediction?: Maybe<Prediction>;
  /** Unix seconds timestamp for sorting. */
  timestamp: Scalars['UnixSeconds']['output'];
  trade?: Maybe<ActivityTrade>;
  type: Scalars['String']['output'];
};

/**
 * Discriminator for which side of `ActivityItem` is populated. Wire values
 * are lowercase to preserve compatibility with the deprecated `accountActivity`
 * path that shipped before the enum tightening.
 */
export type ActivityItemType =
  | 'prediction'
  | 'trade';

/** Paginated wrapper around ActivityItem rows with a server-truth hasMore flag */
export type ActivityItemsPage = Page & {
  __typename?: 'ActivityItemsPage';
  hasMore: Scalars['Boolean']['output'];
  items: Array<ActivityItem>;
  /** May be null: the merged predictions/trades feed doesn't compute a unified count. */
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type ActivityOrder = {
  direction: OrderDirection;
  field: ActivityOrderField;
};

export type ActivityOrderField =
  | 'CREATED_AT';

export type ActivitySource = Prediction | Trade;

/** Trade fields embedded in an activity item */
export type ActivityTrade = {
  __typename?: 'ActivityTrade';
  blockNumber: Scalars['Int']['output'];
  buyer: Scalars['String']['output'];
  chainId: Scalars['Int']['output'];
  collateral: Scalars['String']['output'];
  executedAt: Scalars['UnixSeconds']['output'];
  id: Scalars['Int']['output'];
  pickConfig?: Maybe<PickConfiguration>;
  price: Scalars['String']['output'];
  seller: Scalars['String']['output'];
  token: Scalars['String']['output'];
  tokenAmount: Scalars['String']['output'];
  tradeHash: Scalars['String']['output'];
  txHash: Scalars['String']['output'];
};

export type ActivityType =
  | 'PREDICTION'
  | 'TRADE';

/** Time-bucketed collateral-balance data point (legacy). */
export type BalanceDataPoint = {
  __typename?: 'BalanceDataPoint';
  /** Collateral available to claim from settled positions (wei) */
  claimableCollateral: Scalars['String']['output'];
  /** Active collateral deployed in open positions (wei) */
  deployedCollateral: Scalars['String']['output'];
  /** Unix epoch timestamp (seconds) for the start of this bucket */
  timestamp: Scalars['Int']['output'];
};

export type BigIntFilter = {
  equals?: InputMaybe<Scalars['BigInt']['input']>;
  gt?: InputMaybe<Scalars['BigInt']['input']>;
  gte?: InputMaybe<Scalars['BigInt']['input']>;
  in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  lt?: InputMaybe<Scalars['BigInt']['input']>;
  lte?: InputMaybe<Scalars['BigInt']['input']>;
  not?: InputMaybe<NestedBigIntFilter>;
  notIn?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

export type BoolFilter = {
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolFilter>;
};

export type BoolNullableFilter = {
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolNullableFilter>;
};

export type Category = Node & {
  __typename?: 'Category';
  _count?: Maybe<CategoryCount>;
  conditionGroups: Array<ConditionGroup>;
  conditions: Array<Condition>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  slug?: Maybe<Scalars['String']['output']>;
};


export type CategoryConditionGroupsArgs = {
  cursor?: InputMaybe<ConditionGroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionGroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionGroupWhereInput>;
};


export type CategoryConditionsArgs = {
  cursor?: InputMaybe<ConditionWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};

export type CategoryConnection = {
  __typename?: 'CategoryConnection';
  edges: Array<CategoryEdge>;
  nodes: Array<Category>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type CategoryCount = {
  __typename?: 'CategoryCount';
  condition: Scalars['Int']['output'];
  condition_group: Scalars['Int']['output'];
};


export type CategoryCountConditionArgs = {
  where?: InputMaybe<ConditionWhereInput>;
};


export type CategoryCountCondition_GroupArgs = {
  where?: InputMaybe<ConditionGroupWhereInput>;
};

export type CategoryEdge = {
  __typename?: 'CategoryEdge';
  cursor: Scalars['String']['output'];
  node: Category;
};

/**
 * Filter input for `categoriesConnection`. Intentionally narrow — the
 * category table is tiny, so the only meaningful filter dimension is
 * substring match for autocomplete / lookup UIs.
 */
export type CategoryFilter = {
  /** Case-insensitive substring search against the category name. */
  search?: InputMaybe<Scalars['String']['input']>;
};

export type CategoryNullableRelationFilter = {
  is?: InputMaybe<CategoryWhereInput>;
  isNot?: InputMaybe<CategoryWhereInput>;
};

/** Open-interest aggregated for a single category. */
export type CategoryOpenInterest = {
  __typename?: 'CategoryOpenInterest';
  category: Category;
  /** Open interest in wei (decimal string) */
  openInterest: Scalars['String']['output'];
};

export type CategoryOrderByWithRelationInput = {
  conditionGroups?: InputMaybe<ConditionGroupOrderByRelationAggregateInput>;
  conditions?: InputMaybe<ConditionOrderByRelationAggregateInput>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
};

export type CategoryScalarFieldEnum =
  | 'createdAt'
  | 'id'
  | 'name'
  | 'slug';

export type CategoryWhereInput = {
  AND?: InputMaybe<Array<CategoryWhereInput>>;
  NOT?: InputMaybe<Array<CategoryWhereInput>>;
  OR?: InputMaybe<Array<CategoryWhereInput>>;
  conditionGroups?: InputMaybe<ConditionGroupListRelationFilter>;
  conditions?: InputMaybe<ConditionListRelationFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  name?: InputMaybe<StringFilter>;
  slug?: InputMaybe<StringFilter>;
};

export type CategoryWhereUniqueInput = {
  AND?: InputMaybe<Array<CategoryWhereInput>>;
  NOT?: InputMaybe<Array<CategoryWhereInput>>;
  OR?: InputMaybe<Array<CategoryWhereInput>>;
  conditionGroups?: InputMaybe<ConditionGroupListRelationFilter>;
  conditions?: InputMaybe<ConditionListRelationFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<StringFilter>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

/** Record of a settled prediction redemption where a holder burns tokens for collateral */
export type Claim = {
  __typename?: 'Claim';
  chainId: Scalars['Int']['output'];
  collateralPaid: Scalars['String']['output'];
  holder: Scalars['Address']['output'];
  id: Scalars['Int']['output'];
  marketAddress: Scalars['Address']['output'];
  positionToken: Scalars['Address']['output'];
  predictionId: Scalars['String']['output'];
  redeemedAt: Scalars['UnixSeconds']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  tokensBurned: Scalars['String']['output'];
  txHash: Scalars['String']['output'];
};

/** Record of a position close where both sides burn tokens and receive payouts */
export type Close = {
  __typename?: 'Close';
  burnedAt: Scalars['UnixSeconds']['output'];
  chainId: Scalars['Int']['output'];
  counterpartyHolder: Scalars['Address']['output'];
  counterpartyPayout: Scalars['String']['output'];
  counterpartyTokensBurned: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  marketAddress: Scalars['Address']['output'];
  pickConfigId: Scalars['String']['output'];
  predictorHolder: Scalars['Address']['output'];
  predictorPayout: Scalars['String']['output'];
  predictorTokensBurned: Scalars['String']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  txHash: Scalars['String']['output'];
};

export type CollateralBalance = {
  __typename?: 'CollateralBalance';
  account: Account;
  address: Scalars['Address']['output'];
  amount: Scalars['String']['output'];
  atBlock?: Maybe<Scalars['Int']['output']>;
  balance: Scalars['String']['output'];
  chainId: Scalars['Int']['output'];
  collateral: CollateralToken;
};

export type CollateralBalanceSnapshot = {
  __typename?: 'CollateralBalanceSnapshot';
  account: Account;
  amount: Scalars['String']['output'];
  /**
   * Same value as `amount`. Carried over from the legacy `CollateralBalanceSnapshotType`.
   * @deprecated Use `amount` — same value, drops the wallet-balance framing for consistency with `CollateralTransfer.amount`.
   */
  balance: Scalars['String']['output'];
  blockNumber: Scalars['BigInt']['output'];
  chainId: Scalars['Int']['output'];
  collateral: CollateralToken;
  /**
   * Position of this snapshot in the returned series, starting at 0 for the
   * most-recent boundary. Carried over from the legacy `CollateralBalanceSnapshotType`.
   * @deprecated Index is incidental to the returned list order; rely on `timestamp` (or array position) instead.
   */
  index: Scalars['Int']['output'];
  timestamp: Scalars['DateTimeISO']['output'];
};

export type CollateralToken = {
  __typename?: 'CollateralToken';
  address: Scalars['Address']['output'];
  chainId: Scalars['Int']['output'];
  decimals: Scalars['Int']['output'];
  symbol: Scalars['String']['output'];
};

export type CollateralTransfer = Node & {
  __typename?: 'CollateralTransfer';
  account: Account;
  amount: Scalars['String']['output'];
  blockNumber: Scalars['Int']['output'];
  chainId: Scalars['Int']['output'];
  collateral: CollateralToken;
  createdAt: Scalars['DateTimeISO']['output'];
  from: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  logIndex: Scalars['Int']['output'];
  timestamp: Scalars['DateTimeISO']['output'];
  to: Scalars['String']['output'];
  transactionHash: Scalars['Bytes32']['output'];
  value: Scalars['String']['output'];
};

/** Relay-shaped connection over `CollateralTransfer` rows. */
export type CollateralTransferConnection = {
  __typename?: 'CollateralTransferConnection';
  edges: Array<CollateralTransferEdge>;
  nodes: Array<CollateralTransfer>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type CollateralTransferEdge = {
  __typename?: 'CollateralTransferEdge';
  cursor: Scalars['String']['output'];
  node: CollateralTransfer;
};

export type CollateralTransferFilter = {
  account?: InputMaybe<Scalars['Address']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  timestamp?: InputMaybe<DateTimeFilter>;
  transactionHash?: InputMaybe<Scalars['Bytes32']['input']>;
};

export type CollateralTransferOrder = {
  direction: OrderDirection;
  field: CollateralTransferOrderField;
};

export type CollateralTransferOrderField =
  | 'BLOCK_NUMBER';

export type Condition = Node & {
  __typename?: 'Condition';
  _count?: Maybe<ConditionCount>;
  assertionId?: Maybe<Scalars['String']['output']>;
  assertionTimestamp?: Maybe<Scalars['UnixSeconds']['output']>;
  category?: Maybe<Category>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId: Scalars['Int']['output'];
  conditionGroup?: Maybe<ConditionGroup>;
  conditionGroupId?: Maybe<Scalars['Int']['output']>;
  /** Natural-key condition id (on-chain identifier), returned verbatim. */
  conditionId: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  description: Scalars['String']['output'];
  displayOrder?: Maybe<Scalars['Int']['output']>;
  endTime: Scalars['UnixSeconds']['output'];
  /** YES probability from Polymarket (0.0–1.0), null for non-Polymarket */
  estimatedPrice?: Maybe<Scalars['Float']['output']>;
  forecasts: ForecastConnection;
  /**
   * Opaque global ID for Relay-style `node(id:)` refetch. Use `conditionId`
   * for the on-chain condition identifier.
   */
  id: Scalars['ID']['output'];
  /**
   * Mislabeled alias of `resolverAddress`. Holds the resolver contract address,
   * not the PredictionMarketEscrow address. The recent `resolver → marketAddress`
   * migration collapsed a real distinction; `resolverAddress` is the corrected name.
   * @deprecated Use `resolverAddress` — same value, but accurately named. This field holds the resolver (oracle) contract address, not the market/escrow address that `Prediction.marketAddress` / `PickConfiguration.marketAddress` carry.
   */
  marketAddress: Scalars['Address']['output'];
  nonDecisive: Scalars['Boolean']['output'];
  openInterest: Scalars['String']['output'];
  optionName?: Maybe<Scalars['String']['output']>;
  /**
   * Resolution state of this condition. `null` until the on-chain resolver
   * returns; once settled, carries the resolved value (`YES` / `NO` for
   * decisive outcomes, `NON_DECISIVE` for voids / ties). Filter "settled
   * vs unsettled" via `outcome: { isNull: ... }` rather than relying on
   * the deprecated `settled: Boolean!` field.
   */
  outcome?: Maybe<ConditionOutcome>;
  predictionCount: Scalars['Int']['output'];
  /**
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `predictions`) in a subsequent migration.
   */
  predictionsConnection: PredictionConnection;
  public: Scalars['Boolean']['output'];
  question: Scalars['String']['output'];
  resolvedToYes: Scalars['Boolean']['output'];
  /**
   * Canonical resolver address for this condition (required).
   * @deprecated Use `resolverAddress` — same value, Address-typed and consistent with `Forecast.resolverAddress` / `Pick.conditionResolverAddress`.
   */
  resolver: Scalars['String']['output'];
  /**
   * Resolver contract address — the oracle that settles this condition's outcome.
   * Distinct from the PredictionMarketEscrow address (which is `Prediction.marketAddress` /
   * `PickConfiguration.marketAddress`); one resolver contract can settle conditions
   * referenced by many escrow markets.
   */
  resolverAddress: Scalars['Address']['output'];
  settled: Scalars['Boolean']['output'];
  settledAt?: Maybe<Scalars['UnixSeconds']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
  /** Image URL from Polymarket similar market */
  similarMarketImage?: Maybe<Scalars['String']['output']>;
  /** USD total trading volume from Polymarket similar market */
  similarMarketVolume: Scalars['Float']['output'];
  similarMarketVolume1h: Scalars['Float']['output'];
  similarMarketVolume4h: Scalars['Float']['output'];
  similarMarketVolume7d: Scalars['Float']['output'];
  similarMarketVolume24h: Scalars['Float']['output'];
  similarMarketVolumeFiltered1h: Scalars['Float']['output'];
  similarMarketVolumeFiltered4h: Scalars['Float']['output'];
  similarMarketVolumeFiltered7d: Scalars['Float']['output'];
  similarMarketVolumeFiltered24h: Scalars['Float']['output'];
  similarMarkets: Array<Scalars['String']['output']>;
  tags: Array<Scalars['String']['output']>;
  trades: TradeConnection;
};


export type ConditionCategoryArgs = {
  where?: InputMaybe<CategoryWhereInput>;
};


export type ConditionConditionGroupArgs = {
  where?: InputMaybe<ConditionGroupWhereInput>;
};


export type ConditionForecastsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ForecastFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ForecastOrder>;
};


export type ConditionPredictionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PredictionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PredictionOrder>;
};


export type ConditionTradesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<TradeFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<TradeOrder>;
};

/** Relay-shaped connection over `Condition` rows. */
export type ConditionConnection = {
  __typename?: 'ConditionConnection';
  edges: Array<ConditionEdge>;
  nodes: Array<Condition>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type ConditionCount = {
  __typename?: 'ConditionCount';
  forecasts: Scalars['Int']['output'];
};


export type ConditionCountForecastsArgs = {
  where?: InputMaybe<ForecastWhereInput>;
};

/** Cursor-bearing edge for `ConditionConnection`. */
export type ConditionEdge = {
  __typename?: 'ConditionEdge';
  cursor: Scalars['String']['output'];
  node: Condition;
};

/**
 * Engagement status for a Condition. A condition has "engagement" if it
 * has non-zero open interest OR at least one forecast. Used by
 * cleanup workflows to find dead markets and recheck them.
 */
export type ConditionEngagement =
  /** `openInterest != 0` OR at least one forecast. */
  | 'ANY'
  /** `openInterest = 0` AND no forecasts. */
  | 'NONE';

/**
 * Filter input for the Relay-shaped `conditions` connection. Combines
 * with AND. Public-only — non-public conditions are out of scope here;
 * admin paths need an explicit replacement surface if private-condition
 * visibility is still required.
 */
export type ConditionFilter = {
  /** Restrict to conditions whose category id is in this set. */
  categoryIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** Restrict to conditions whose category slug is in this set. */
  categorySlugs?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Restrict to a single chain. Defaults to DEFAULT_CHAIN_ID when a resolver-address filter is present. */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Restrict to / exclude conditions in a specific group. `{ isNull: true }` matches ungrouped conditions. */
  conditionGroupId?: InputMaybe<IdFilter>;
  /** Engagement status based on open interest or forecasts. */
  engagement?: InputMaybe<ConditionEngagement>;
  /** Filter by estimated price, e.g. `{ gte: 0.2, lte: 0.8 }`. */
  estimatedPrice?: InputMaybe<FloatFilter>;
  /** Restrict to conditions that have a non-empty similarMarkets array. */
  hasSimilarMarkets?: InputMaybe<Scalars['Boolean']['input']>;
  /** Restrict to these condition IDs (case-insensitive). */
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  /**
   * Deprecated alias for `resolverAddress`; kept during the rename window for older clients.
   * @deprecated Use `resolverAddress` — same resolver/oracle contract address, accurately named.
   */
  marketAddress?: InputMaybe<Scalars['Address']['input']>;
  /**
   * Deprecated alias for `resolverAddressIn`; kept during the rename window for older clients.
   * @deprecated Use `resolverAddressIn` — same resolver/oracle contract addresses, accurately named.
   */
  marketAddressIn?: InputMaybe<Array<Scalars['Address']['input']>>;
  /**
   * Filter by resolution state. `{ isNull: true }` selects unsettled
   * conditions; `{ isNull: false }` selects settled (any outcome);
   * `{ equals: NON_DECISIVE }` selects voided settlements specifically.
   */
  outcome?: InputMaybe<ConditionOutcomeFilter>;
  /** Restrict to conditions resolved YES (true) or NO (false). Implies settled=true. */
  resolvedToYes?: InputMaybe<Scalars['Boolean']['input']>;
  /**
   * Match the on-chain resolver (oracle) contract address. Maps to the DB
   * `condition.resolver` column. Distinct from `Prediction.marketAddress` /
   * `PickConfiguration.marketAddress`, which carry the PredictionMarketEscrow
   * contract.
   */
  resolverAddress?: InputMaybe<Scalars['Address']['input']>;
  /** Match any of these resolver contract addresses. Same semantics as `resolverAddress`. */
  resolverAddressIn?: InputMaybe<Array<Scalars['Address']['input']>>;
  /** Filter by resolution epoch seconds, e.g. `{ gte: 1770000000 }`. */
  resolvesAt?: InputMaybe<IntFilter>;
  /** Free-text search across `question`, `shortName`, and `description` (case-insensitive). */
  search?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to settled (true) or unsettled (false) conditions. */
  settled?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by all-time similar-market volume, e.g. `{ gte: 10000 }`. */
  similarMarketVolume?: InputMaybe<FloatFilter>;
  /** Restrict to conditions tagged with any of these values. */
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Visibility filter. Defaults to PUBLIC when omitted; ID filters bypass the default for direct lookups. */
  visibility?: InputMaybe<ConditionVisibility>;
};

/** Legacy flat filter input for removed offset-page condition access. */
export type ConditionFilters = {
  /** Restrict to conditions whose category slug is in this set. */
  categorySlugs?: InputMaybe<Array<Scalars['String']['input']>>;
  /**
   * Restrict to a single chain. When omitted and a `contractAddress*` filter is
   * present, defaults to the API's `DEFAULT_CHAIN_ID` so address lookups are not
   * silently cross-chain (contract addresses are not a global namespace).
   */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Restrict to a single condition group. */
  conditionGroupId?: InputMaybe<Scalars['Int']['input']>;
  /**
   * Match the on-chain contract address that owns the condition
   * (case-insensitive). Maps to the DB `resolver` column. Pair with `chainId`
   * for a fully-qualified `(chainId, address)` lookup; if omitted, `chainId`
   * defaults to `DEFAULT_CHAIN_ID`.
   */
  contractAddress?: InputMaybe<Scalars['String']['input']>;
  /**
   * Match any of these on-chain contract addresses (case-insensitive). Same
   * semantics as `contractAddress` — see its docs for `chainId` defaulting.
   */
  contractAddressIn?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Engagement filter (used by cleanup workflows). See `ConditionEngagement`. */
  engagement?: InputMaybe<ConditionEngagement>;
  /** When true, only return conditions that have a non-empty `similarMarkets` array. */
  hasSimilarMarkets?: InputMaybe<Scalars['Boolean']['input']>;
  /** Restrict to these condition IDs (case-insensitive). */
  ids?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Restrict to conditions with `endTime <= this`. */
  maxEndTime?: InputMaybe<Scalars['UnixSeconds']['input']>;
  /** Restrict to conditions with `endTime >= this`. */
  minEndTime?: InputMaybe<Scalars['UnixSeconds']['input']>;
  /** Restrict to conditions resolved YES (true) or NO (false). Implies settled=true. */
  resolvedToYes?: InputMaybe<Scalars['Boolean']['input']>;
  /**
   * Match the resolver address (case-insensitive). Protocol-jargon alias of
   * `contractAddress`; new callers should prefer `contractAddress`.
   */
  resolver?: InputMaybe<Scalars['String']['input']>;
  /**
   * Match any of these resolver addresses (case-insensitive). Protocol-jargon
   * alias of `contractAddressIn`; new callers should prefer `contractAddressIn`.
   */
  resolverIn?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Free-text search across question, shortName, and description (case-insensitive). */
  search?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to settled (true) or unsettled (false) conditions. */
  settled?: InputMaybe<Scalars['Boolean']['input']>;
  /** Restrict to conditions not assigned to any condition group. */
  ungroupedOnly?: InputMaybe<Scalars['Boolean']['input']>;
  /** Visibility filter. Defaults to `PUBLIC` when omitted. */
  visibility?: InputMaybe<ConditionVisibility>;
};

/**
 * TODO(node-migration): Should `implements Node` with `id: ID!`. Currently
 * exposes `id: Int!` (Prisma row id), so the wire format would change from
 * number → opaque string — a breaking change for typed clients. Plan: add
 * `globalId: ID!` alongside, deprecate the raw integer read, flip on a
 * future major.
 */
export type ConditionGroup = {
  __typename?: 'ConditionGroup';
  _count?: Maybe<ConditionGroupCount>;
  category?: Maybe<Category>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  conditions: Array<Condition>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  similarMarkets: Array<Scalars['String']['output']>;
  /**
   * Compatibility alias mirroring `name`. Kept so external clients still
   * selecting `ConditionGroup.title` keep working through one release.
   * @deprecated Use `name` — same value, the alias exists only to absorb in-flight queries from older clients.
   */
  title: Scalars['String']['output'];
};


/**
 * TODO(node-migration): Should `implements Node` with `id: ID!`. Currently
 * exposes `id: Int!` (Prisma row id), so the wire format would change from
 * number → opaque string — a breaking change for typed clients. Plan: add
 * `globalId: ID!` alongside, deprecate the raw integer read, flip on a
 * future major.
 */
export type ConditionGroupCategoryArgs = {
  where?: InputMaybe<CategoryWhereInput>;
};


/**
 * TODO(node-migration): Should `implements Node` with `id: ID!`. Currently
 * exposes `id: Int!` (Prisma row id), so the wire format would change from
 * number → opaque string — a breaking change for typed clients. Plan: add
 * `globalId: ID!` alongside, deprecate the raw integer read, flip on a
 * future major.
 */
export type ConditionGroupConditionsArgs = {
  cursor?: InputMaybe<ConditionWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};

/** Relay-shaped connection over `ConditionGroup` rows. */
export type ConditionGroupConnection = {
  __typename?: 'ConditionGroupConnection';
  edges: Array<ConditionGroupEdge>;
  nodes: Array<ConditionGroup>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type ConditionGroupCount = {
  __typename?: 'ConditionGroupCount';
  condition: Scalars['Int']['output'];
};


export type ConditionGroupCountConditionArgs = {
  where?: InputMaybe<ConditionWhereInput>;
};

/** Cursor-bearing edge for `ConditionGroupConnection`. */
export type ConditionGroupEdge = {
  __typename?: 'ConditionGroupEdge';
  cursor: Scalars['String']['output'];
  node: ConditionGroup;
};

/**
 * Filter input for the Relay-shaped `conditionGroups` connection. Combines
 * with AND. Returns only groups with at least one public condition; the
 * admin-only finer-grained switches need an explicit replacement surface if still required.
 */
export type ConditionGroupFilter = {
  /** Restrict to groups whose category id is in this set. */
  categoryIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** Restrict to groups whose category slug is in this set. */
  categorySlugs?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Restrict to groups that have at least one condition on this chain. */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Restrict to these condition group IDs. */
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** When true, allow groups with no conditions. Defaults false. */
  includeEmpty?: InputMaybe<Scalars['Boolean']['input']>;
  /** When true, require at least one public condition on the group. */
  publicOnly?: InputMaybe<Scalars['Boolean']['input']>;
  /** Free-text search across the group's `name` (case-insensitive). */
  search?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to groups whose conditions carry any of these tags. */
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** Legacy flat filter input for removed offset-page condition group access. */
export type ConditionGroupFilters = {
  /** Restrict to groups whose category slug is in this set. */
  categorySlugs?: InputMaybe<Array<Scalars['String']['input']>>;
  /**
   * Restrict to groups that have at least one Condition on this chain.
   * Implemented as a `conditions: { some: { chainId: $chainId } }` filter, so
   * groups whose conditions live on other chains drop out of the page.
   */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Restrict to these condition group IDs. */
  ids?: InputMaybe<Array<Scalars['Int']['input']>>;
  /**
   * When false (default), groups with no Conditions are filtered out — this
   * matches what every UI consumer wants. When true, empty groups are
   * included (admin-style use cases only).
   */
  includeEmpty?: InputMaybe<Scalars['Boolean']['input']>;
  /**
   * When true, restrict to groups that have at least one *public* Condition.
   * Defaults to false — matches the deprecated bare-array surface, which had
   * no visibility filter on the group itself.
   */
  publicOnly?: InputMaybe<Scalars['Boolean']['input']>;
  /** Free-text search across the group's `name` (case-insensitive). */
  search?: InputMaybe<Scalars['String']['input']>;
};

export type ConditionGroupListRelationFilter = {
  every?: InputMaybe<ConditionGroupWhereInput>;
  none?: InputMaybe<ConditionGroupWhereInput>;
  some?: InputMaybe<ConditionGroupWhereInput>;
};

export type ConditionGroupNullableRelationFilter = {
  is?: InputMaybe<ConditionGroupWhereInput>;
  isNot?: InputMaybe<ConditionGroupWhereInput>;
};

/** Order input for the Relay-shaped `conditionGroups` connection. */
export type ConditionGroupOrder = {
  direction: OrderDirection;
  field: ConditionGroupOrderField;
};

export type ConditionGroupOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type ConditionGroupOrderByWithRelationInput = {
  category?: InputMaybe<CategoryOrderByWithRelationInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  conditions?: InputMaybe<ConditionOrderByRelationAggregateInput>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  maxCreatedAtEpoch?: InputMaybe<SortOrder>;
  maxEndTime?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  publicConditionCount?: InputMaybe<SortOrder>;
  similarMarkets?: InputMaybe<SortOrder>;
  totalOpenInterest?: InputMaybe<SortOrder>;
  totalPredictionCount?: InputMaybe<SortOrder>;
  totalSimilarMarketVolume1h?: InputMaybe<SortOrder>;
  totalSimilarMarketVolume4h?: InputMaybe<SortOrder>;
  totalSimilarMarketVolume7d?: InputMaybe<SortOrder>;
  totalSimilarMarketVolume24h?: InputMaybe<SortOrder>;
  totalSimilarMarketVolumeFiltered1h?: InputMaybe<SortOrder>;
  totalSimilarMarketVolumeFiltered4h?: InputMaybe<SortOrder>;
  totalSimilarMarketVolumeFiltered7d?: InputMaybe<SortOrder>;
  totalSimilarMarketVolumeFiltered24h?: InputMaybe<SortOrder>;
};

/**
 * Sort fields for the Relay-shaped `conditionGroups` connection. Mirrors
 * the Condition enum value names; the resolver maps each to the
 * group-level denormalized aggregate column (`maxCreatedAtEpoch`,
 * `maxEndTime`, `totalPredictionCount`, `totalSimilarMarketVolume24h`,
 * `totalSimilarMarketVolume7d`).
 *
 * `OPEN_INTEREST` is intentionally omitted — symmetric with
 * `ConditionOrderField` above. The `totalOpenInterest` column is
 * Decimal (not varchar), so the numeric-sort issue doesn't apply at the
 * group level — but listing `OPEN_INTEREST` on `ConditionGroupOrderField`
 * without listing it on `ConditionOrderField` would be confusingly
 * asymmetric, so we hold both back together.
 */
export type ConditionGroupOrderField =
  | 'CREATED_AT'
  | 'PREDICTION_COUNT'
  | 'RESOLVES_AT'
  | 'SIMILAR_MARKET_VOLUME_7D'
  | 'SIMILAR_MARKET_VOLUME_24H';

export type ConditionGroupScalarFieldEnum =
  | 'categoryId'
  | 'createdAt'
  | 'id'
  | 'maxCreatedAtEpoch'
  | 'maxEndTime'
  | 'name'
  | 'publicConditionCount'
  | 'similarMarkets'
  | 'totalOpenInterest'
  | 'totalPredictionCount'
  | 'totalSimilarMarketVolume1h'
  | 'totalSimilarMarketVolume4h'
  | 'totalSimilarMarketVolume7d'
  | 'totalSimilarMarketVolume24h'
  | 'totalSimilarMarketVolumeFiltered1h'
  | 'totalSimilarMarketVolumeFiltered4h'
  | 'totalSimilarMarketVolumeFiltered7d'
  | 'totalSimilarMarketVolumeFiltered24h';

/** Legacy condition-group offset sort fields retained only for generated compatibility. */
export type ConditionGroupSortField =
  | 'CREATED_AT'
  | 'MAX_END_TIME'
  | 'TOTAL_OPEN_INTEREST'
  | 'TOTAL_PREDICTION_COUNT';

export type ConditionGroupWhereInput = {
  AND?: InputMaybe<Array<ConditionGroupWhereInput>>;
  NOT?: InputMaybe<Array<ConditionGroupWhereInput>>;
  OR?: InputMaybe<Array<ConditionGroupWhereInput>>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  conditions?: InputMaybe<ConditionListRelationFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  maxCreatedAtEpoch?: InputMaybe<BigIntFilter>;
  maxEndTime?: InputMaybe<IntFilter>;
  name?: InputMaybe<StringFilter>;
  publicConditionCount?: InputMaybe<IntFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
  totalOpenInterest?: InputMaybe<DecimalFilter>;
  totalPredictionCount?: InputMaybe<IntFilter>;
  totalSimilarMarketVolume1h?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolume4h?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolume7d?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolume24h?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolumeFiltered1h?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolumeFiltered4h?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolumeFiltered7d?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolumeFiltered24h?: InputMaybe<DecimalFilter>;
};

export type ConditionGroupWhereUniqueInput = {
  AND?: InputMaybe<Array<ConditionGroupWhereInput>>;
  NOT?: InputMaybe<Array<ConditionGroupWhereInput>>;
  OR?: InputMaybe<Array<ConditionGroupWhereInput>>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  conditions?: InputMaybe<ConditionListRelationFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  maxCreatedAtEpoch?: InputMaybe<BigIntFilter>;
  maxEndTime?: InputMaybe<IntFilter>;
  name?: InputMaybe<Scalars['String']['input']>;
  publicConditionCount?: InputMaybe<IntFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
  totalOpenInterest?: InputMaybe<DecimalFilter>;
  totalPredictionCount?: InputMaybe<IntFilter>;
  totalSimilarMarketVolume1h?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolume4h?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolume7d?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolume24h?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolumeFiltered1h?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolumeFiltered4h?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolumeFiltered7d?: InputMaybe<DecimalFilter>;
  totalSimilarMarketVolumeFiltered24h?: InputMaybe<DecimalFilter>;
};

export type ConditionListRelationFilter = {
  every?: InputMaybe<ConditionWhereInput>;
  none?: InputMaybe<ConditionWhereInput>;
  some?: InputMaybe<ConditionWhereInput>;
};

export type ConditionNullableRelationFilter = {
  is?: InputMaybe<ConditionWhereInput>;
  isNot?: InputMaybe<ConditionWhereInput>;
};

/**
 * Discriminated union over the two backing entities a `Question` can wrap.
 * Clients use fragment spreads on `Condition` and `ConditionGroup` to read
 * fields specific to each branch.
 */
export type ConditionOrConditionGroup = Condition | ConditionGroup;

/** Order input for the Relay-shaped `conditions` connection. */
export type ConditionOrder = {
  direction: OrderDirection;
  field: ConditionOrderField;
};

export type ConditionOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type ConditionOrderByWithRelationInput = {
  assertionId?: InputMaybe<SortOrderInput>;
  assertionTimestamp?: InputMaybe<SortOrderInput>;
  category?: InputMaybe<CategoryOrderByWithRelationInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  chainId?: InputMaybe<SortOrder>;
  conditionGroup?: InputMaybe<ConditionGroupOrderByWithRelationInput>;
  conditionGroupId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  displayOrder?: InputMaybe<SortOrderInput>;
  endTime?: InputMaybe<SortOrder>;
  estimatedPrice?: InputMaybe<SortOrderInput>;
  forecasts?: InputMaybe<ForecastOrderByRelationAggregateInput>;
  id?: InputMaybe<SortOrder>;
  nonDecisive?: InputMaybe<SortOrder>;
  openInterest?: InputMaybe<SortOrder>;
  optionName?: InputMaybe<SortOrderInput>;
  predictionCount?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  resolvedToYes?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrder>;
  settled?: InputMaybe<SortOrder>;
  settledAt?: InputMaybe<SortOrderInput>;
  shortName?: InputMaybe<SortOrderInput>;
  similarMarketImage?: InputMaybe<SortOrderInput>;
  similarMarketVolume?: InputMaybe<SortOrder>;
  similarMarketVolume1h?: InputMaybe<SortOrder>;
  similarMarketVolume4h?: InputMaybe<SortOrder>;
  similarMarketVolume7d?: InputMaybe<SortOrder>;
  similarMarketVolume24h?: InputMaybe<SortOrder>;
  similarMarketVolumeFiltered1h?: InputMaybe<SortOrder>;
  similarMarketVolumeFiltered4h?: InputMaybe<SortOrder>;
  similarMarketVolumeFiltered7d?: InputMaybe<SortOrder>;
  similarMarketVolumeFiltered24h?: InputMaybe<SortOrder>;
  similarMarkets?: InputMaybe<SortOrder>;
  tags?: InputMaybe<SortOrder>;
};

/**
 * Sort fields for the Relay-shaped `conditions` connection. All values
 * map to existing partial indexes on the `condition` table:
 *
 * - `CREATED_AT` → `IDX_condition_public_createdat`
 * - `RESOLVES_AT` → `IDX_condition_public_endtime` (column: `endTime`)
 * - `PREDICTION_COUNT` → `IDX_condition_prediction_count`
 * - `SIMILAR_MARKET_VOLUME_24H` → `IDX_condition_public_volume24h`
 * - `SIMILAR_MARKET_VOLUME_7D` → `IDX_condition_public_volume7d`
 *
 * `OPEN_INTEREST` is intentionally omitted. The underlying
 * `Condition.openInterest` column is varchar; the partial index
 * `IDX_condition_oi_numeric` is on the `::numeric` cast expression, so
 * typed Prisma `orderBy` would sort lexicographically (`"9" > "1000"`)
 * and miss the index. Lands together with raw-SQL numeric sort in a
 * follow-up — additive, non-breaking.
 */
export type ConditionOrderField =
  | 'CREATED_AT'
  | 'PREDICTION_COUNT'
  | 'RESOLVES_AT'
  | 'SIMILAR_MARKET_VOLUME_7D'
  | 'SIMILAR_MARKET_VOLUME_24H';

/**
 * Resolved state of a `Condition`. `YES` and `NO` are decisive resolutions
 * of the binary outcome; `NON_DECISIVE` covers voided / tied / unresolvable
 * settlements (which the protocol collapses to `COUNTERPARTY_WINS` at the
 * Prediction layer). Nullable on the wire — `null` means "not yet settled."
 *
 * Derived at the resolver from `settled` / `resolvedToYes` / `nonDecisive`
 * columns; clients should filter "settled" via `outcome: { isNull: false }`
 * rather than depending on the legacy boolean fields.
 */
export type ConditionOutcome =
  | 'NO'
  | 'NON_DECISIVE'
  | 'YES';

/**
 * Operator-pattern filter for `ConditionOutcome` enum. `{ isNull: true }`
 * selects unsettled conditions; `{ isNull: false }` selects settled
 * (any outcome). `{ equals: NON_DECISIVE }` selects voided/non-decisive
 * settlements specifically. See `ConditionOutcome`.
 */
export type ConditionOutcomeFilter = {
  equals?: InputMaybe<ConditionOutcome>;
  in?: InputMaybe<Array<ConditionOutcome>>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<ConditionOutcome>;
  notIn?: InputMaybe<Array<ConditionOutcome>>;
};

export type ConditionRelationFilter = {
  is?: InputMaybe<ConditionWhereInput>;
  isNot?: InputMaybe<ConditionWhereInput>;
};

export type ConditionScalarFieldEnum =
  | 'assertionId'
  | 'assertionTimestamp'
  | 'categoryId'
  | 'chainId'
  | 'conditionGroupId'
  | 'createdAt'
  | 'description'
  | 'displayOrder'
  | 'endTime'
  | 'estimatedPrice'
  | 'id'
  | 'nonDecisive'
  | 'openInterest'
  | 'optionName'
  | 'predictionCount'
  | 'public'
  | 'question'
  | 'resolvedToYes'
  | 'resolver'
  | 'settled'
  | 'settledAt'
  | 'shortName'
  | 'similarMarketImage'
  | 'similarMarketVolume'
  | 'similarMarketVolume1h'
  | 'similarMarketVolume4h'
  | 'similarMarketVolume7d'
  | 'similarMarketVolume24h'
  | 'similarMarketVolumeFiltered1h'
  | 'similarMarketVolumeFiltered4h'
  | 'similarMarketVolumeFiltered7d'
  | 'similarMarketVolumeFiltered24h'
  | 'similarMarkets'
  | 'tags';

/** Legacy condition offset sort fields retained only for generated compatibility. */
export type ConditionSortField =
  | 'CREATED_AT'
  | 'END_TIME'
  | 'OPEN_INTEREST'
  | 'PREDICTION_COUNT';

/** Legacy condition visibility filter. */
export type ConditionVisibility =
  | 'ALL'
  | 'PRIVATE'
  | 'PUBLIC';

export type ConditionWhereInput = {
  AND?: InputMaybe<Array<ConditionWhereInput>>;
  NOT?: InputMaybe<Array<ConditionWhereInput>>;
  OR?: InputMaybe<Array<ConditionWhereInput>>;
  assertionId?: InputMaybe<StringNullableFilter>;
  assertionTimestamp?: InputMaybe<IntNullableFilter>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  chainId?: InputMaybe<IntFilter>;
  conditionGroup?: InputMaybe<ConditionGroupNullableRelationFilter>;
  conditionGroupId?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  description?: InputMaybe<StringFilter>;
  displayOrder?: InputMaybe<IntNullableFilter>;
  endTime?: InputMaybe<IntFilter>;
  estimatedPrice?: InputMaybe<FloatNullableFilter>;
  forecasts?: InputMaybe<ForecastListRelationFilter>;
  id?: InputMaybe<StringFilter>;
  nonDecisive?: InputMaybe<BoolFilter>;
  openInterest?: InputMaybe<StringFilter>;
  optionName?: InputMaybe<StringNullableFilter>;
  predictionCount?: InputMaybe<IntFilter>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringFilter>;
  resolvedToYes?: InputMaybe<BoolFilter>;
  resolver?: InputMaybe<StringFilter>;
  settled?: InputMaybe<BoolFilter>;
  settledAt?: InputMaybe<IntNullableFilter>;
  shortName?: InputMaybe<StringNullableFilter>;
  similarMarketImage?: InputMaybe<StringNullableFilter>;
  similarMarketVolume?: InputMaybe<FloatFilter>;
  similarMarketVolume1h?: InputMaybe<FloatFilter>;
  similarMarketVolume4h?: InputMaybe<FloatFilter>;
  similarMarketVolume7d?: InputMaybe<FloatFilter>;
  similarMarketVolume24h?: InputMaybe<FloatFilter>;
  similarMarketVolumeFiltered1h?: InputMaybe<FloatFilter>;
  similarMarketVolumeFiltered4h?: InputMaybe<FloatFilter>;
  similarMarketVolumeFiltered7d?: InputMaybe<FloatFilter>;
  similarMarketVolumeFiltered24h?: InputMaybe<FloatFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
  tags?: InputMaybe<StringNullableListFilter>;
};

export type ConditionWhereUniqueInput = {
  AND?: InputMaybe<Array<ConditionWhereInput>>;
  NOT?: InputMaybe<Array<ConditionWhereInput>>;
  OR?: InputMaybe<Array<ConditionWhereInput>>;
  assertionId?: InputMaybe<StringNullableFilter>;
  assertionTimestamp?: InputMaybe<IntNullableFilter>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  chainId?: InputMaybe<IntFilter>;
  conditionGroup?: InputMaybe<ConditionGroupNullableRelationFilter>;
  conditionGroupId?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  description?: InputMaybe<StringFilter>;
  displayOrder?: InputMaybe<IntNullableFilter>;
  endTime?: InputMaybe<IntFilter>;
  estimatedPrice?: InputMaybe<FloatNullableFilter>;
  forecasts?: InputMaybe<ForecastListRelationFilter>;
  id?: InputMaybe<Scalars['String']['input']>;
  nonDecisive?: InputMaybe<BoolFilter>;
  openInterest?: InputMaybe<StringFilter>;
  optionName?: InputMaybe<StringNullableFilter>;
  predictionCount?: InputMaybe<IntFilter>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringFilter>;
  resolvedToYes?: InputMaybe<BoolFilter>;
  resolver?: InputMaybe<StringFilter>;
  settled?: InputMaybe<BoolFilter>;
  settledAt?: InputMaybe<IntNullableFilter>;
  shortName?: InputMaybe<StringNullableFilter>;
  similarMarketImage?: InputMaybe<StringNullableFilter>;
  similarMarketVolume?: InputMaybe<FloatFilter>;
  similarMarketVolume1h?: InputMaybe<FloatFilter>;
  similarMarketVolume4h?: InputMaybe<FloatFilter>;
  similarMarketVolume7d?: InputMaybe<FloatFilter>;
  similarMarketVolume24h?: InputMaybe<FloatFilter>;
  similarMarketVolumeFiltered1h?: InputMaybe<FloatFilter>;
  similarMarketVolumeFiltered4h?: InputMaybe<FloatFilter>;
  similarMarketVolumeFiltered7d?: InputMaybe<FloatFilter>;
  similarMarketVolumeFiltered24h?: InputMaybe<FloatFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
  tags?: InputMaybe<StringNullableListFilter>;
};

export type DateTimeFilter = {
  equals?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  in?: InputMaybe<Array<Scalars['DateTimeISO']['input']>>;
  lt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  lte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  not?: InputMaybe<NestedDateTimeFilter>;
  notIn?: InputMaybe<Array<Scalars['DateTimeISO']['input']>>;
};

export type DateTimeNullableFilter = {
  equals?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  in?: InputMaybe<Array<Scalars['DateTimeISO']['input']>>;
  lt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  lte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  not?: InputMaybe<NestedDateTimeNullableFilter>;
  notIn?: InputMaybe<Array<Scalars['DateTimeISO']['input']>>;
};

export type DecimalFilter = {
  equals?: InputMaybe<Scalars['Decimal']['input']>;
  gt?: InputMaybe<Scalars['Decimal']['input']>;
  gte?: InputMaybe<Scalars['Decimal']['input']>;
  in?: InputMaybe<Array<Scalars['Decimal']['input']>>;
  lt?: InputMaybe<Scalars['Decimal']['input']>;
  lte?: InputMaybe<Scalars['Decimal']['input']>;
  not?: InputMaybe<NestedDecimalFilter>;
  notIn?: InputMaybe<Array<Scalars['Decimal']['input']>>;
};

export type FloatFilter = {
  equals?: InputMaybe<Scalars['Float']['input']>;
  gt?: InputMaybe<Scalars['Float']['input']>;
  gte?: InputMaybe<Scalars['Float']['input']>;
  in?: InputMaybe<Array<Scalars['Float']['input']>>;
  lt?: InputMaybe<Scalars['Float']['input']>;
  lte?: InputMaybe<Scalars['Float']['input']>;
  not?: InputMaybe<NestedFloatFilter>;
  notIn?: InputMaybe<Array<Scalars['Float']['input']>>;
};

export type FloatNullableFilter = {
  equals?: InputMaybe<Scalars['Float']['input']>;
  gt?: InputMaybe<Scalars['Float']['input']>;
  gte?: InputMaybe<Scalars['Float']['input']>;
  in?: InputMaybe<Array<Scalars['Float']['input']>>;
  lt?: InputMaybe<Scalars['Float']['input']>;
  lte?: InputMaybe<Scalars['Float']['input']>;
  not?: InputMaybe<NestedFloatNullableFilter>;
  notIn?: InputMaybe<Array<Scalars['Float']['input']>>;
};

/**
 * Public Forecast surface backed by EAS attestation rows.
 *
 * TODO(node-migration): Should `implements Node` with `id: ID!`. Currently
 * exposes `id: Int!` (Prisma row id), so the wire format would change from
 * number → opaque string — a breaking change for typed clients. Plan: add
 * `globalId: ID!` alongside, deprecate the raw integer read, flip on a
 * future major.
 */
export type Forecast = {
  __typename?: 'Forecast';
  /** When the forecast was made on-chain. */
  attestedAt: Scalars['UnixSeconds']['output'];
  blockNumber: Scalars['Int']['output'];
  comment?: Maybe<Scalars['String']['output']>;
  condition?: Maybe<Condition>;
  conditionId?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  data: Scalars['String']['output'];
  decodedDataJson: Scalars['String']['output'];
  /**
   * Raw forecast value as recorded on-chain — the `uint256 forecast` field
   * on the EAS attestation schema, returned as a decimal string in D18
   * fixed-point representing a probability in `[0, 1e18]`. For the
   * canonical normalized probability use `Forecast.forecastScore.probabilityFloat`
   * (0–1 float) or `Forecast.forecastScore.probabilityD18`
   * (18-decimal fixed-point string).
   */
  forecast: Scalars['String']['output'];
  forecastScore?: Maybe<ForecastScore>;
  forecaster: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  recipient: Scalars['String']['output'];
  /**
   * Resolver contract address from the on-chain EAS attestation (`address resolver`
   * on the forecast schema). Identifies which oracle the forecaster is predicting
   * against — same address as `Condition.resolverAddress` when the forecast
   * matches a tracked condition.
   */
  resolverAddress?: Maybe<Scalars['Address']['output']>;
  schemaId: Scalars['String']['output'];
  transactionHash: Scalars['String']['output'];
  uid: Scalars['String']['output'];
};


/**
 * Public Forecast surface backed by EAS attestation rows.
 *
 * TODO(node-migration): Should `implements Node` with `id: ID!`. Currently
 * exposes `id: Int!` (Prisma row id), so the wire format would change from
 * number → opaque string — a breaking change for typed clients. Plan: add
 * `globalId: ID!` alongside, deprecate the raw integer read, flip on a
 * future major.
 */
export type ForecastConditionArgs = {
  where?: InputMaybe<ConditionWhereInput>;
};


/**
 * Public Forecast surface backed by EAS attestation rows.
 *
 * TODO(node-migration): Should `implements Node` with `id: ID!`. Currently
 * exposes `id: Int!` (Prisma row id), so the wire format would change from
 * number → opaque string — a breaking change for typed clients. Plan: add
 * `globalId: ID!` alongside, deprecate the raw integer read, flip on a
 * future major.
 */
export type ForecastForecastScoreArgs = {
  where?: InputMaybe<ForecastScoreWhereInput>;
};

/** Relay-shaped connection over `Forecast` rows. */
export type ForecastConnection = {
  __typename?: 'ForecastConnection';
  edges: Array<ForecastEdge>;
  nodes: Array<Forecast>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

/** Cursor-bearing edge for `ForecastConnection`. */
export type ForecastEdge = {
  __typename?: 'ForecastEdge';
  cursor: Scalars['String']['output'];
  node: Forecast;
};

/**
 * Filter input for the `forecastsConnection` query. Each field is optional;
 * values combine with AND.
 */
export type ForecastFilter = {
  /** Filter by forecast epoch seconds, e.g. `{ gte: 1770000000, lt: 1770086400 }`. */
  attestedAt?: InputMaybe<IntFilter>;
  /** Restrict to forecasts on a single condition. */
  conditionId?: InputMaybe<Scalars['String']['input']>;
  /**
   * Restrict to forecasts on any of these conditions. Useful for group-backed
   * feeds where the caller already has the condition list resolved.
   */
  conditionIds?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Restrict to a single forecaster address (case-insensitive). */
  forecaster?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to a single recipient address (case-insensitive). */
  recipient?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to a single EAS schema ID. */
  schemaId?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to a single forecast by UID. */
  uid?: InputMaybe<Scalars['String']['input']>;
};

export type ForecastListRelationFilter = {
  every?: InputMaybe<ForecastWhereInput>;
  none?: InputMaybe<ForecastWhereInput>;
  some?: InputMaybe<ForecastWhereInput>;
};

/** Order input for `forecastsConnection`. */
export type ForecastOrder = {
  direction: OrderDirection;
  field: ForecastOrderField;
};

export type ForecastOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

/** Sort fields for `forecastsConnection`. */
export type ForecastOrderField =
  | 'ATTESTED_AT'
  | 'CREATED_AT';

export type ForecastRelationFilter = {
  is?: InputMaybe<ForecastWhereInput>;
  isNot?: InputMaybe<ForecastWhereInput>;
};

export type ForecastScore = {
  __typename?: 'ForecastScore';
  createdAt: Scalars['DateTimeISO']['output'];
  errorSquared?: Maybe<Scalars['Float']['output']>;
  forecast: Forecast;
  forecastId: Scalars['Int']['output'];
  forecaster: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  madeAt: Scalars['UnixSeconds']['output'];
  marketId?: Maybe<Scalars['String']['output']>;
  outcome?: Maybe<Scalars['Int']['output']>;
  probabilityD18?: Maybe<Scalars['String']['output']>;
  probabilityFloat?: Maybe<Scalars['Float']['output']>;
  questionId?: Maybe<Scalars['String']['output']>;
  /**
   * Resolver contract address this score is keyed against. Mirrors
   * `Condition.resolverAddress` for the scored forecast. The DB row carries two
   * legacy columns (`marketAddress`, `resolver`) that hold the same value; the
   * GraphQL surface exposes the single corrected name.
   */
  resolverAddress?: Maybe<Scalars['Address']['output']>;
  scoredAt?: Maybe<Scalars['DateTimeISO']['output']>;
  used: Scalars['Boolean']['output'];
};

export type ForecastScoreNullableRelationFilter = {
  is?: InputMaybe<ForecastScoreWhereInput>;
  isNot?: InputMaybe<ForecastScoreWhereInput>;
};

export type ForecastScoreWhereInput = {
  AND?: InputMaybe<Array<ForecastScoreWhereInput>>;
  NOT?: InputMaybe<Array<ForecastScoreWhereInput>>;
  OR?: InputMaybe<Array<ForecastScoreWhereInput>>;
  createdAt?: InputMaybe<DateTimeFilter>;
  errorSquared?: InputMaybe<FloatNullableFilter>;
  forecast?: InputMaybe<ForecastRelationFilter>;
  forecastId?: InputMaybe<IntFilter>;
  forecaster?: InputMaybe<StringFilter>;
  id?: InputMaybe<IntFilter>;
  madeAt?: InputMaybe<IntFilter>;
  marketAddress?: InputMaybe<StringNullableFilter>;
  marketId?: InputMaybe<StringNullableFilter>;
  outcome?: InputMaybe<IntNullableFilter>;
  probabilityD18?: InputMaybe<StringNullableFilter>;
  probabilityFloat?: InputMaybe<FloatNullableFilter>;
  questionId?: InputMaybe<StringNullableFilter>;
  resolver?: InputMaybe<StringNullableFilter>;
  scoredAt?: InputMaybe<DateTimeNullableFilter>;
  used?: InputMaybe<BoolFilter>;
};

export type ForecastWhereInput = {
  AND?: InputMaybe<Array<ForecastWhereInput>>;
  NOT?: InputMaybe<Array<ForecastWhereInput>>;
  OR?: InputMaybe<Array<ForecastWhereInput>>;
  attestedAt?: InputMaybe<IntFilter>;
  blockNumber?: InputMaybe<IntFilter>;
  comment?: InputMaybe<StringNullableFilter>;
  condition?: InputMaybe<ConditionNullableRelationFilter>;
  conditionId?: InputMaybe<StringNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  data?: InputMaybe<StringFilter>;
  decodedDataJson?: InputMaybe<StringFilter>;
  forecast?: InputMaybe<StringFilter>;
  forecastScore?: InputMaybe<ForecastScoreNullableRelationFilter>;
  forecaster?: InputMaybe<StringFilter>;
  id?: InputMaybe<IntFilter>;
  recipient?: InputMaybe<StringFilter>;
  resolver?: InputMaybe<StringNullableFilter>;
  schemaId?: InputMaybe<StringFilter>;
  transactionHash?: InputMaybe<StringFilter>;
  uid?: InputMaybe<StringFilter>;
};

/**
 * DEPRECATED — kept only as the return type of `accountAccuracy`, which is
 * itself `@deprecated`. The leaderboard-row shape lives on
 * `AccountAccuracyLeaderboardEntry` (address + accuracyScore); the legacy aggregation
 * counters (`numScored`, `numTimeWeighted`, `sumErrorSquared`,
 * `sumTimeWeightedError`) were always returned as zeros from the resolver
 * even on main, so callers should treat them as non-load-bearing.
 */
export type ForecasterScore = {
  __typename?: 'ForecasterScore';
  accuracyScore: Scalars['Float']['output'];
  address: Scalars['String']['output'];
  numScored: Scalars['Int']['output'];
  numTimeWeighted: Scalars['Int']['output'];
  sumErrorSquared: Scalars['Float']['output'];
  sumTimeWeightedError: Scalars['Float']['output'];
};

/**
 * Operator-pattern filter for `ID` scalar fields. Supports equality,
 * membership, negation, and null. Resolvers reject unsupported operators
 * on a per-field basis (e.g., a non-nullable column rejects `isNull`).
 */
export type IdFilter = {
  equals?: InputMaybe<Scalars['ID']['input']>;
  in?: InputMaybe<Array<Scalars['ID']['input']>>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<Scalars['ID']['input']>;
  notIn?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type IntFilter = {
  equals?: InputMaybe<Scalars['Int']['input']>;
  gt?: InputMaybe<Scalars['Int']['input']>;
  gte?: InputMaybe<Scalars['Int']['input']>;
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lt?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
  not?: InputMaybe<NestedIntFilter>;
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type IntNullableFilter = {
  equals?: InputMaybe<Scalars['Int']['input']>;
  gt?: InputMaybe<Scalars['Int']['input']>;
  gte?: InputMaybe<Scalars['Int']['input']>;
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lt?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
  not?: InputMaybe<NestedIntNullableFilter>;
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type LeaderboardMetric =
  | 'ACCURACY'
  | 'PNL'
  | 'ROI'
  | 'VOLUME';

export type NestedBigIntFilter = {
  equals?: InputMaybe<Scalars['BigInt']['input']>;
  gt?: InputMaybe<Scalars['BigInt']['input']>;
  gte?: InputMaybe<Scalars['BigInt']['input']>;
  in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  lt?: InputMaybe<Scalars['BigInt']['input']>;
  lte?: InputMaybe<Scalars['BigInt']['input']>;
  not?: InputMaybe<NestedBigIntFilter>;
  notIn?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

export type NestedBoolFilter = {
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolFilter>;
};

export type NestedBoolNullableFilter = {
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolNullableFilter>;
};

export type NestedDateTimeFilter = {
  equals?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  in?: InputMaybe<Array<Scalars['DateTimeISO']['input']>>;
  lt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  lte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  not?: InputMaybe<NestedDateTimeFilter>;
  notIn?: InputMaybe<Array<Scalars['DateTimeISO']['input']>>;
};

export type NestedDateTimeNullableFilter = {
  equals?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  in?: InputMaybe<Array<Scalars['DateTimeISO']['input']>>;
  lt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  lte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  not?: InputMaybe<NestedDateTimeNullableFilter>;
  notIn?: InputMaybe<Array<Scalars['DateTimeISO']['input']>>;
};

export type NestedDecimalFilter = {
  equals?: InputMaybe<Scalars['Decimal']['input']>;
  gt?: InputMaybe<Scalars['Decimal']['input']>;
  gte?: InputMaybe<Scalars['Decimal']['input']>;
  in?: InputMaybe<Array<Scalars['Decimal']['input']>>;
  lt?: InputMaybe<Scalars['Decimal']['input']>;
  lte?: InputMaybe<Scalars['Decimal']['input']>;
  not?: InputMaybe<NestedDecimalFilter>;
  notIn?: InputMaybe<Array<Scalars['Decimal']['input']>>;
};

export type NestedFloatFilter = {
  equals?: InputMaybe<Scalars['Float']['input']>;
  gt?: InputMaybe<Scalars['Float']['input']>;
  gte?: InputMaybe<Scalars['Float']['input']>;
  in?: InputMaybe<Array<Scalars['Float']['input']>>;
  lt?: InputMaybe<Scalars['Float']['input']>;
  lte?: InputMaybe<Scalars['Float']['input']>;
  not?: InputMaybe<NestedFloatFilter>;
  notIn?: InputMaybe<Array<Scalars['Float']['input']>>;
};

export type NestedFloatNullableFilter = {
  equals?: InputMaybe<Scalars['Float']['input']>;
  gt?: InputMaybe<Scalars['Float']['input']>;
  gte?: InputMaybe<Scalars['Float']['input']>;
  in?: InputMaybe<Array<Scalars['Float']['input']>>;
  lt?: InputMaybe<Scalars['Float']['input']>;
  lte?: InputMaybe<Scalars['Float']['input']>;
  not?: InputMaybe<NestedFloatNullableFilter>;
  notIn?: InputMaybe<Array<Scalars['Float']['input']>>;
};

export type NestedIntFilter = {
  equals?: InputMaybe<Scalars['Int']['input']>;
  gt?: InputMaybe<Scalars['Int']['input']>;
  gte?: InputMaybe<Scalars['Int']['input']>;
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lt?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
  not?: InputMaybe<NestedIntFilter>;
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type NestedIntNullableFilter = {
  equals?: InputMaybe<Scalars['Int']['input']>;
  gt?: InputMaybe<Scalars['Int']['input']>;
  gte?: InputMaybe<Scalars['Int']['input']>;
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lt?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
  not?: InputMaybe<NestedIntNullableFilter>;
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type NestedStringFilter = {
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  equals?: InputMaybe<Scalars['String']['input']>;
  gt?: InputMaybe<Scalars['String']['input']>;
  gte?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  lt?: InputMaybe<Scalars['String']['input']>;
  lte?: InputMaybe<Scalars['String']['input']>;
  not?: InputMaybe<NestedStringFilter>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type NestedStringNullableFilter = {
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  equals?: InputMaybe<Scalars['String']['input']>;
  gt?: InputMaybe<Scalars['String']['input']>;
  gte?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  lt?: InputMaybe<Scalars['String']['input']>;
  lte?: InputMaybe<Scalars['String']['input']>;
  not?: InputMaybe<NestedStringNullableFilter>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

/**
 * Relay-style identifiable object. Types that implement `Node` carry a
 * globally unique opaque `id` and are refetchable through the root
 * `node(id:)` / `nodes(ids:)` fields. Domain identifiers (predictionId,
 * hash, uid, address) remain on the entity as separate fields; `id` is a
 * second identity layer used for cache normalization and polymorphic
 * refetch.
 */
export type Node = {
  /**
   * Opaque, globally unique identifier. Clients should treat this as a
   * refetch token only — do not parse, mint, or compare it to domain ids.
   * Stable for the lifetime of the entity it identifies.
   */
  id: Scalars['ID']['output'];
};

export type NullsOrder =
  | 'first'
  | 'last';

/** Sort order shared across every `orderBy` input on the redesigned surface. */
export type OrderDirection =
  | 'ASC'
  | 'DESC';

/**
 * Shared shape for `*Page` paginated wrappers. Concrete types add their own
 * strongly-typed `items` field; `hasMore` and `totalCount` live here so generic
 * clients can read them across page types.
 */
export type Page = {
  /** Server-truth signal that more rows exist beyond this page. Always populated. */
  hasMore: Scalars['Boolean']['output'];
  /**
   * Total rows matching the same filters as `items`.
   *
   * Lazy by default — the count query only fires when this field is selected
   * in the operation, so paginated requests that don't need a total don't pay
   * for one. Concrete `*Page` types call out the two exceptions to this:
   *   - **Eagerly populated**: the count is cheap (e.g. derived from the same
   *     in-memory array `items` was sliced from), so it's always set.
   *   - **May be null**: the underlying query (unions, merged feeds) cannot
   *     efficiently produce a stable total, so the field is null even when
   *     the client selects it.
   */
  totalCount?: Maybe<Scalars['Int']['output']>;
};

/**
 * Cursor-based pagination metadata for Relay-style connections. Sits
 * alongside the legacy `Page` interface (offset/skip-based pagination)
 * during the API redesign; new connection types use `PageInfo`, existing
 * `*Page` types keep `Page`.
 */
export type PageInfo = {
  __typename?: 'PageInfo';
  /** Cursor of the last edge in the page, or null when the page is empty. */
  endCursor?: Maybe<Scalars['String']['output']>;
  /** True if more rows exist after `endCursor` in the current ordering. */
  hasNextPage: Scalars['Boolean']['output'];
  /** True if more rows exist before `startCursor` in the current ordering. */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** Cursor of the first edge in the page, or null when the page is empty. */
  startCursor?: Maybe<Scalars['String']['output']>;
};

/**
 * Individual outcome pick within a pick configuration.
 *
 * TODO(node-migration): Should `implements Node` with `id: ID!`. Currently
 * exposes `id: Int!` (Prisma row id), so the wire format would change from
 * number → opaque string — a breaking change for typed clients. Plan: add
 * `globalId: ID!` alongside, deprecate the raw integer read, flip on a
 * future major.
 */
export type Pick = {
  __typename?: 'Pick';
  /** The condition this pick references. May be null if the conditionId is dangling. */
  condition?: Maybe<Condition>;
  conditionId: Scalars['String']['output'];
  /** @deprecated Use `conditionResolverAddress` — same value, Address-typed and consistent with `Condition.resolverAddress`. */
  conditionResolver: Scalars['String']['output'];
  /**
   * Resolver (oracle) contract address for the referenced condition — mirrors
   * `Condition.resolverAddress`. Replaces the loosely-typed `conditionResolver`.
   */
  conditionResolverAddress: Scalars['Address']['output'];
  id: Scalars['Int']['output'];
  pickConfigId: Scalars['String']['output'];
  predictedOutcome: Scalars['Int']['output'];
};

/** Group of outcome picks forming a combined prediction position, with collateral and settlement tracking */
export type PickConfiguration = Node & {
  __typename?: 'PickConfiguration';
  chainId: Scalars['Int']['output'];
  claimedCounterpartyCollateral: Scalars['String']['output'];
  claimedPredictorCollateral: Scalars['String']['output'];
  counterpartyToken?: Maybe<Scalars['String']['output']>;
  endsAt?: Maybe<Scalars['UnixSeconds']['output']>;
  /**
   * Opaque global ID for Relay-style `node(id:)` refetch. Use `pickConfigId`
   * for the natural pick-configuration identifier.
   */
  id: Scalars['ID']['output'];
  isLegacy: Scalars['Boolean']['output'];
  marketAddress: Scalars['Address']['output'];
  /** Natural-key pick-configuration id, returned verbatim. */
  pickConfigId: Scalars['String']['output'];
  picks: Array<Pick>;
  positions: PositionConnection;
  predictionId?: Maybe<Scalars['String']['output']>;
  predictions: PredictionConnection;
  predictorToken?: Maybe<Scalars['String']['output']>;
  resolved: Scalars['Boolean']['output'];
  resolvedAt?: Maybe<Scalars['UnixSeconds']['output']>;
  result: SettlementResult;
  totalCounterpartyCollateral: Scalars['String']['output'];
  totalPredictorCollateral: Scalars['String']['output'];
  trades: TradeConnection;
};


/** Group of outcome picks forming a combined prediction position, with collateral and settlement tracking */
export type PickConfigurationPositionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PositionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PositionOrder>;
};


/** Group of outcome picks forming a combined prediction position, with collateral and settlement tracking */
export type PickConfigurationPredictionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PredictionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PredictionOrder>;
};


/** Group of outcome picks forming a combined prediction position, with collateral and settlement tracking */
export type PickConfigurationTradesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<TradeFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<TradeOrder>;
};

/** Relay-shaped connection over `PickConfiguration` rows. */
export type PickConfigurationConnection = {
  __typename?: 'PickConfigurationConnection';
  edges: Array<PickConfigurationEdge>;
  nodes: Array<PickConfiguration>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

/** Cursor-bearing edge for `PickConfigurationConnection`. */
export type PickConfigurationEdge = {
  __typename?: 'PickConfigurationEdge';
  cursor: Scalars['String']['output'];
  node: PickConfiguration;
};

/**
 * Filter input for the `pickConfigurationsConnection` query. Values combine with AND.
 * Range-like scalars use operator-pattern inputs; identifier/domain fields stay flat.
 */
export type PickConfigurationFilter = {
  /** Restrict to a single chain. Chain IDs are identifiers, not range-filtered metrics. */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Restrict to resolved (true) or unresolved (false) pick configurations. */
  resolved?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by settlement result, e.g. `{ equals: PREDICTOR_WINS }`. */
  result?: InputMaybe<SettlementResultFilter>;
  /** Restrict to pick configurations whose predictor or counterparty token is in this set (case-insensitive). Max 100 addresses per request. */
  tokens?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** Order input for the Relay-shaped `pickConfigurationsConnection`. */
export type PickConfigurationOrder = {
  direction: OrderDirection;
  field: PickConfigurationOrderField;
};

/** Sort fields for the Relay-shaped `pickConfigurationsConnection`. */
export type PickConfigurationOrderField =
  | 'CREATED_AT'
  | 'ENDS_AT'
  | 'RESOLVED_AT';

/** Time-bucketed PnL data point with cumulative tracking (legacy). */
export type PnlDataPoint = {
  __typename?: 'PnlDataPoint';
  /** Running cumulative PnL in wei */
  cumulativePnl: Scalars['String']['output'];
  /** PnL for this bucket in wei */
  pnl: Scalars['String']['output'];
  /** Unix epoch timestamp (seconds) for the start of this bucket */
  timestamp: Scalars['Int']['output'];
};

/**
 * ERC-20 token balance representing one side of a prediction position. The
 * underlying Position row may surface as multiple `*Page` items: one
 * "open" row carrying remaining cost basis, plus one synthesized "sell"
 * row per secondary-market disposal (so PnL realizes incrementally).
 */
export type Position = Node & {
  __typename?: 'Position';
  /**
   * Number of position tokens still held (decimal string, 18 decimals on
   * Sapience). Synthesized sell rows carry `"0"` here — the realized PnL
   * delta from that sell lives on `realizedPnL`.
   */
  balance: Scalars['String']['output'];
  chainId: Scalars['Int']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  /** Holder wallet address (lowercase 0x-hex). */
  holder: Scalars['String']['output'];
  /**
   * Opaque global ID for Relay-style `node(id:)` refetch. Use `positionId`
   * for the synthetic position row identifier.
   */
  id: Scalars['ID']['output'];
  /** True if this is the predictor token side; false for counterparty. */
  isPredictorToken: Scalars['Boolean']['output'];
  pickConfig?: Maybe<PickConfiguration>;
  pickConfigId: Scalars['String']['output'];
  /**
   * Synthetic row id. Open rows use the underlying Position row id
   * serialized as a string; synthesized sell rows append `"-sell-<tradeHash>"`.
   */
  positionId: Scalars['String']['output'];
  /**
   * Realized PnL delta for a synthesized sell row (wei, 18 decimals;
   * signed — negative when sold below cost basis). Null on open rows;
   * use `cumulativePnL` on the bucketed `accountStats` series for the
   * holder-wide aggregate.
   */
  realizedPnL?: Maybe<Scalars['String']['output']>;
  /**
   * ERC-20 position token address. Validated via the `Address` scalar
   * (lowercased 0x-hex).
   */
  tokenAddress: Scalars['Address']['output'];
  /**
   * Cumulative payout the contract would owe this position if every
   * matched prediction resolved in the holder's favour (wei, 18 dec).
   * Equal to the total collateral pool across the holder's matched
   * predictions, NOT the net profit. Null when the holder has no matched
   * predictions on this pickConfig.
   */
  totalPayout?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTimeISO']['output'];
  /**
   * Cost basis remaining on the holder's open balance (wei, 18 dec). For
   * synthesized sell rows this is the basis allocated to the shares
   * disposed of, computed via running WAC. Null when there is no basis to
   * surface (zero-balance settled position, etc.).
   */
  userCollateral?: Maybe<Scalars['String']['output']>;
};

/** Relay-shaped connection over `Position` rows. */
export type PositionConnection = {
  __typename?: 'PositionConnection';
  edges: Array<PositionEdge>;
  nodes: Array<Position>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

/** Cursor-bearing edge for `PositionConnection`. */
export type PositionEdge = {
  __typename?: 'PositionEdge';
  cursor: Scalars['String']['output'];
  node: Position;
};

/** Filter input for the Relay-shaped `positionsConnection` query. Combines with AND. */
export type PositionFilter = {
  /** Restrict to a single chain. */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Filter by holder collateral on the pickConfig, e.g. `{ gte: "1000000000000000000" }`. */
  collateral?: InputMaybe<BigIntFilter>;
  /** Restrict to positions tied to a single condition (via the pickConfig join). */
  conditionId?: InputMaybe<Scalars['String']['input']>;
  /** Filter by pickConfig end epoch seconds, e.g. `{ gte: 1770000000, lt: 1770086400 }`. */
  endsAt?: InputMaybe<IntFilter>;
  /** Restrict to a single holder address (case-insensitive). */
  holder?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to positions where holder won/lost the settled pickConfig. */
  holderWon?: InputMaybe<Scalars['Boolean']['input']>;
  /** Restrict to a single pick configuration. */
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to positions whose pickConfig settled with this result. */
  result?: InputMaybe<SettlementResult>;
  /** Restrict to settled (true) or unsettled (false) positions. */
  settled?: InputMaybe<Scalars['Boolean']['input']>;
};

/**
 * Flat filter input for the deprecated `positionsPage` query. Each field is
 * optional; values combine with AND. New callers should use the operator-pattern
 * `PositionFilter` on `positionsConnection`.
 */
export type PositionFilters = {
  /** Restrict to a single chain. */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Restrict to positions whose holder collateral on the pickConfig is `<= this` (wei). */
  collateralMax?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to positions whose holder collateral on the pickConfig is `>= this` (wei). */
  collateralMin?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to positions tied to a single condition (via the pickConfig join). */
  conditionId?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to positions whose pickConfig `endsAt <= this`. */
  endsAtMax?: InputMaybe<Scalars['UnixSeconds']['input']>;
  /** Restrict to positions whose pickConfig `endsAt >= this`. */
  endsAtMin?: InputMaybe<Scalars['UnixSeconds']['input']>;
  /** Restrict to a single holder address (case-insensitive). */
  holder?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to positions where the holder won (true) or lost (false). Combines side with settlement result. */
  holderWon?: InputMaybe<Scalars['Boolean']['input']>;
  /** Restrict to a single pick configuration. */
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to positions whose pickConfig settled with this result. */
  result?: InputMaybe<SettlementResult>;
  /** Restrict to settled (true) or unsettled (false) positions. */
  settled?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Order input for the Relay-shaped `positionsConnection`. */
export type PositionOrder = {
  direction: OrderDirection;
  field: PositionOrderField;
};

/** Sort fields for the Relay-shaped `positionsConnection`. */
export type PositionOrderField =
  | 'CREATED_AT'
  | 'UPDATED_AT';

/** Field to sort positions by */
export type PositionSortField =
  | 'CREATED_AT'
  | 'UPDATED_AT'
  | 'createdAt'
  | 'updatedAt';

/**
 * Paginated wrapper around Position rows with a server-truth hasMore flag.
 * `totalCount` counts underlying Position rows matching the filters (not the
 * rendered event-stream rows, which can be larger due to per-sell synthetic
 * expansion).
 */
export type PositionsPage = Page & {
  __typename?: 'PositionsPage';
  hasMore: Scalars['Boolean']['output'];
  items: Array<Position>;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

/**
 * Escrow-based prediction record between a predictor and counterparty, with collateral and settlement tracking.
 *
 * TODO(node-migration): Should `implements Node` with `id: ID!`. Currently
 * exposes `id: Int!` (Prisma row id), so the wire format would change from
 * number → opaque string — a breaking change for typed clients. Plan: add
 * `globalId: ID!` alongside, deprecate the raw integer read, flip on a
 * future major.
 */
export type Prediction = {
  __typename?: 'Prediction';
  chainId: Scalars['Int']['output'];
  collateralDeposited?: Maybe<Scalars['String']['output']>;
  collateralDepositedAt?: Maybe<Scalars['UnixSeconds']['output']>;
  counterparty: Scalars['String']['output'];
  counterpartyClaimable?: Maybe<Scalars['String']['output']>;
  counterpartyCollateral: Scalars['String']['output'];
  counterpartyToken: Scalars['String']['output'];
  createTxHash: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  isLegacy: Scalars['Boolean']['output'];
  marketAddress: Scalars['Address']['output'];
  pickConfig?: Maybe<PickConfiguration>;
  predictionId: Scalars['String']['output'];
  predictor: Scalars['String']['output'];
  predictorClaimable?: Maybe<Scalars['String']['output']>;
  predictorCollateral: Scalars['String']['output'];
  predictorToken: Scalars['String']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  result: SettlementResult;
  settleTxHash?: Maybe<Scalars['String']['output']>;
  settled: Scalars['Boolean']['output'];
  settledAt?: Maybe<Scalars['UnixSeconds']['output']>;
};

/** Relay-shaped connection over `Prediction` rows. */
export type PredictionConnection = {
  __typename?: 'PredictionConnection';
  edges: Array<PredictionEdge>;
  nodes: Array<Prediction>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

/** Time-bucketed prediction-count data point with outcome breakdown (legacy). */
export type PredictionCountDataPoint = {
  __typename?: 'PredictionCountDataPoint';
  /** Predictions lost in this bucket */
  lost: Scalars['Int']['output'];
  /** Predictions settled as non-decisive in this bucket */
  nonDecisive: Scalars['Int']['output'];
  /** Predictions still pending in this bucket */
  pending: Scalars['Int']['output'];
  /** Unix epoch timestamp (seconds) for the start of this bucket */
  timestamp: Scalars['Int']['output'];
  /** Total predictions opened in this bucket */
  total: Scalars['Int']['output'];
  /** Predictions won in this bucket */
  won: Scalars['Int']['output'];
};

/** Cursor-bearing edge for `PredictionConnection`. */
export type PredictionEdge = {
  __typename?: 'PredictionEdge';
  cursor: Scalars['String']['output'];
  node: Prediction;
};

/**
 * Filter input for the `predictionsConnection` query. Each field is optional;
 * values combine with AND.
 */
export type PredictionFilter = {
  /** Restrict to predictions where the address is predictor or counterparty. */
  address?: InputMaybe<Scalars['Address']['input']>;
  /** Restrict to a single chain. */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Restrict to predictions on a single condition (via the pickConfig join). */
  conditionId?: InputMaybe<Scalars['String']['input']>;
  /**
   * Restrict to predictions on any of these conditions (via the pickConfig join).
   * Useful for group-backed feeds where the caller already has the condition
   * list resolved.
   */
  conditionIds?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Filter by pickConfig end epoch seconds, e.g. `{ gte: 1770000000, lt: 1770086400 }`. */
  endsAt?: InputMaybe<IntFilter>;
  /** Restrict to legacy (true) or non-legacy (false) predictions. */
  isLegacy?: InputMaybe<Scalars['Boolean']['input']>;
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  /**
   * Restrict to a single prediction by on-chain id. Supports the
   * by-predictionId single-record lookup pattern —
   * `predictionsConnection(filter: { predictionId: $p }).nodes[0]` replaces
   * the dedicated `predictionByOnchainId` query.
   */
  predictionId?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to predictions whose pickConfig settled with this result. */
  result?: InputMaybe<SettlementResult>;
  /** Restrict to settled (true) or unsettled (false) predictions. */
  settled?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Order input for `predictionsConnection`. */
export type PredictionOrder = {
  direction: OrderDirection;
  field: PredictionOrderField;
};

/** Sort fields for `predictionsConnection`. */
export type PredictionOrderField =
  | 'CREATED_AT';

/** Field to sort predictions by */
export type PredictionSortField =
  | 'CREATED_AT'
  | 'SETTLED_AT'
  | 'createdAt'
  | 'settledAt';

/**
 * DEPRECATED — kept only as the return type of `accountProfitRank`, which is
 * itself `@deprecated`. The replacement `AccountStatsRank` carries the same
 * rank / totalParticipants plus a richer per-metric stat breakdown
 * (`netPnL` / `gains` / `losses` / `volume`); `totalPnL` here maps to
 * `AccountStatsRank.netPnL`.
 */
export type ProfitRank = {
  __typename?: 'ProfitRank';
  address: Scalars['String']['output'];
  rank?: Maybe<Scalars['Int']['output']>;
  totalParticipants: Scalars['Int']['output'];
  totalPnL: Scalars['String']['output'];
};

export type Protocol = {
  __typename?: 'Protocol';
  openInterestByCategory: Array<CategoryOpenInterest>;
  openInterestByTimeToResolution: Array<TimeToResolutionBucket>;
  stats: ProtocolStatConnection;
};


export type ProtocolStatsArgs = {
  filter?: InputMaybe<ProtocolStatFilter>;
};

/** Protocol-wide stats snapshot — no vault scoping. */
export type ProtocolStat = {
  __typename?: 'ProtocolStat';
  /** Cumulative count of predictions and secondary trades/sales */
  cumulativeTradeCount: Scalars['Int']['output'];
  cumulativeVolume: Scalars['String']['output'];
  escrowBalance: Scalars['String']['output'];
  openInterest: Scalars['String']['output'];
  /** Trade-count delta over the snapshot interval */
  periodTradeCount: Scalars['Int']['output'];
  /** Cumulative-volume delta over the snapshot interval */
  periodVolume: Scalars['String']['output'];
  /** Snapshot boundary, aligned to the snapshot interval. */
  timestamp: Scalars['UnixSeconds']['output'];
};

export type ProtocolStatConnection = {
  __typename?: 'ProtocolStatConnection';
  edges: Array<ProtocolStatEdge>;
  nodes: Array<ProtocolStat>;
  pageInfo: PageInfo;
  /**
   * Size of the full snapshot series rendered by this query (pre-pagination).
   * Already known in memory — the resolver materializes every snapshot
   * before slicing — so cheap to surface.
   */
  totalCount: Scalars['Int']['output'];
};

export type ProtocolStatEdge = {
  __typename?: 'ProtocolStatEdge';
  cursor: Scalars['String']['output'];
  node: ProtocolStat;
};

export type ProtocolStatFilter = {
  timestamp?: InputMaybe<IntFilter>;
};

export type Query = {
  __typename?: 'Query';
  /**
   * Look up a single account by canonical wallet address. Replacement for
   * `user(where:)` — accepts a flat `address: Address!` arg instead of the
   * Prisma-shaped `UserWhereUniqueInput`.
   */
  account?: Maybe<Account>;
  /**
   * Lifetime accuracy score for a single address, or null if no scored
   * forecasts exist.
   * @deprecated Use `accountAccuracyRank` for the rank-and-score shape, or `accuracyLeaderboardPage` for the leaderboard. `ForecasterScore`'s legacy counter fields (numScored, sumErrorSquared, …) were always returned as zeros.
   */
  accountAccuracy?: Maybe<ForecasterScore>;
  /**
   * Accuracy rank and lifetime score for a single address. Mirrors
   * `accountStatsRank`'s shape: stats fields are always populated (zero for
   * unscored addresses), `rank` is null when the address is absent from the
   * ranked set, and `totalForecasters` is the size of the scored-forecaster
   * set.
   * @deprecated Use `account(address: $a).rank(metric: ACCURACY)` — returns the same rank + value via the Relay-shaped Account surface.
   */
  accountAccuracyRank: AccountAccuracyRank;
  /**
   * Unified activity feed — predictions and trades merged by timestamp. When address is provided, scopes to that account; otherwise returns recent global activity.
   * @deprecated Use `activityPage` — same data with a server-truth `hasMore` stop signal.
   */
  accountActivity: Array<ActivityItem>;
  /**
   * Deprecated alias for `activityPage` — the `account*` prefix predates the
   * global-feed mode (added when `address` became optional). Kept on the
   * flat-arg shape; callers wanting the `filters:` input should migrate
   * to `activityPage`.
   * @deprecated Use `activityPage` — same resolver, the name reflects that the resolver also serves the global feed when `address` is omitted.
   */
  accountActivityPage: ActivityItemsPage;
  /**
   * Time-bucketed collateral balance for a single address — deployed (in open
   * positions) and claimable (settled but unredeemed). DEPRECATED: use
   * `accountStats`; the fat row carries `deployedCollateral` /
   * `claimableCollateral` per snapshot.
   * @deprecated Use `accountStats` — the fat row carries `deployedCollateral` / `claimableCollateral` per snapshot.
   */
  accountBalance: Array<BalanceDataPoint>;
  /**
   * Time-bucketed profit-and-loss for a single address with cumulative tracking.
   * DEPRECATED: use `accountStats`; the fat row carries `periodPnL` /
   * `cumulativePnL` per snapshot.
   * @deprecated Use `accountStats` — the fat row carries `periodPnL` / `cumulativePnL` per snapshot.
   */
  accountPnl: Array<PnlDataPoint>;
  /**
   * Time-bucketed prediction count with outcome breakdown for a single address,
   * bucketed by creation time. DEPRECATED: use `accountStats`; the fat row carries
   * `predictionsTotal` / `predictionsWon` / `predictionsLost` / `predictionsPending`
   * / `predictionsNonDecisive` per snapshot.
   * @deprecated Use `accountStats` — the fat row carries `predictionsTotal` / `predictionsWon` / `predictionsLost` / `predictionsPending` / `predictionsNonDecisive` per snapshot.
   */
  accountPredictionCount: Array<PredictionCountDataPoint>;
  /**
   * Profit rank and total PnL for a single address relative to all
   * participants. Lifetime (no window).
   * @deprecated Use `accountStatsRank(address:)` — same rank + totalParticipants, plus a richer stat breakdown. `ProfitRank.totalPnL` maps to `AccountStatsRank.netPnL`.
   */
  accountProfitRank: ProfitRank;
  /**
   * Per-account stats time series — wallet collateral position, PnL, volume,
   * and prediction outcome counts across snapshots in a window. Mirrors the
   * `protocolStats` / `vaultStats` fat-row shape: no `interval` arg, server
   * picks the cadence; `fromEpoch` / `toEpoch` are optional epoch seconds
   * (inclusive). Both omitted ⇒ last 365 days (the DAY-bucket cap in the
   * helper layer until the snapshot table lands).
   *
   * Implementation today wraps the legacy per-metric SQL helpers and emits
   * one point per day. A follow-up migrates this to a real per-account
   * snapshot table without changing the wire shape.
   * @deprecated Use `account(address: $a).stats(filter: { timestamp: { gte: $from, lte: $to } })` — same fat-row shape via the Relay-shaped Account surface.
   */
  accountStats: Array<AccountStat>;
  /** @deprecated Use `leaderboard(metric: PNL|VOLUME|ROI, first:, after:, filter:)` — Relay-shaped pagination over the same ranked set. */
  accountStatsLeaderboardPage: AccountStatsLeaderboardPage;
  /**
   * Stats + rank for a single address against the same ranked set the
   * leaderboard slices. `filters` omitted ⇒ rank by `NET_PNL` over all-time.
   * Stats fields are always present (zero when the address has no activity
   * in the window). `rank` is null when the address is absent from the
   * ranked set; `totalParticipants` is the ranked-set size (0 when the
   * window has no participants at all — that distinguishes "empty window"
   * from "present window, address unranked").
   * @deprecated Use `account(address: $a).rank(metric: PNL|VOLUME|ROI, filter:)` — returns the same rank + value via the Relay-shaped Account surface.
   */
  accountStatsRank: AccountStatsRank;
  /**
   * Lifetime trading volume for a single address as a wei-decimal string.
   * DEPRECATED: use `accountStatsRank(address: $a).volume` (omit `filters` for
   * all-time).
   * @deprecated Use `accountStatsRank(address: $a).volume` (omit `filters` for all-time).
   */
  accountTotalVolume: Scalars['String']['output'];
  /**
   * Time-bucketed trading volume for a single address. DEPRECATED: use
   * `accountStats`; the fat row carries `periodVolume` / `cumulativeVolume` per snapshot.
   * @deprecated Use `accountStats` — the fat row carries `periodVolume` / `cumulativeVolume` per snapshot.
   */
  accountVolume: Array<VolumeDataPoint>;
  /**
   * Relay-shaped connection over accounts (User-table rows). Single-address
   * lookups should keep using `account(address:)`, which synthesizes
   * address-backed Accounts for wallets without a User row;
   * `accountsConnection` is for enumeration / search use cases.
   *
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `accounts`) in a subsequent migration.
   */
  accountsConnection: AccountConnection;
  /**
   * Top forecasters ranked by lifetime accuracy. The time-weighted error
   * already weights by recency, so there's no window filter on this surface.
   * Page-shaped with server-truth `hasMore`; `totalCount` is populated
   * unconditionally (cheap in-memory derivation).
   * @deprecated Use `leaderboard(metric: ACCURACY, first:, after:)` — Relay-shaped pagination over the same ranked set.
   */
  accuracyLeaderboardPage: AccountAccuracyLeaderboardPage;
  activity: ActivityConnection;
  /**
   * Unified activity feed (predictions + trades merged by timestamp), wrapped
   * in an `ActivityItemsPage` with a server-truth `hasMore` flag. The whole
   * field is deprecated in favor of `activity(...)`, the Relay-shaped
   * replacement; flat-arg / `filters:`-arg variants both keep working until
   * the deprecation window closes.
   * @deprecated Use `activity(first:, after:, filter:, orderBy:)` — Relay-shaped pagination over the same merged predictions/trades feed.
   */
  activityPage: ActivityItemsPage;
  /** @deprecated Use `categoriesConnection(first:, after:)` — Relay-shaped cursor pagination over categories. */
  categories: Array<Category>;
  /**
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `categories`) in a subsequent migration, once the deprecated
   * bare-array `categories` sibling above is removed.
   */
  categoriesConnection: CategoryConnection;
  /**
   * Paginated list of prediction claim (redemption) records, filterable by holder, prediction, and chain
   * @deprecated Unused; will be removed. No live consumers — claim records are reachable as a side-effect of position settlement.
   */
  claims: Array<Claim>;
  /**
   * Paginated list of position close (burn) records, filterable by address, pick config, and chain
   * @deprecated Unused; will be removed. No live consumers — close records are reachable as a side-effect of position settlement.
   */
  closes: Array<Close>;
  /** @deprecated Use `collateralBalance(account:, chainId:)`; legacy `address` remains as an argument alias during migration. */
  collateralBalance: CollateralBalance;
  /**
   * Cumulative wUSDe collateral balance for an address at `count + 1`
   * evenly-spaced snapshot boundaries going back from now. The snapshot
   * cadence is `intervalSeconds` (preferred); the legacy `intervalHours`
   * arg is retained as a deprecated alias — when both are supplied,
   * `intervalSeconds` wins.
   */
  collateralBalanceHistory: Array<CollateralBalanceSnapshot>;
  /** @deprecated Use `collateralTransfersConnection(first:, after:, filter:, orderBy:)` — Relay-shaped cursor pagination over collateral transfers. */
  collateralTransfers: Array<CollateralTransfer>;
  /**
   * Relay-shaped connection over collateral transfers. Forward-only cursor pagination via `first` / `after`.
   *
   * Sorting is timestamp-based with `id` as the stable tie-breaker. Defaults to `TIMESTAMP` / `DESC` when omitted.
   *
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `collateralTransfers`) in a subsequent migration, once the
   * deprecated bare-array `collateralTransfers` sibling above is removed.
   */
  collateralTransfersConnection: CollateralTransferConnection;
  /** @deprecated Pending flat-id arg flip in the final cleanup PR — single-record `condition(id:)` will replace the Prisma `where:` shape. */
  condition?: Maybe<Condition>;
  /** @deprecated Pending flat-id arg flip in the final cleanup PR — single-record `conditionGroup(id:)` will replace the Prisma `where:` shape. */
  conditionGroup?: Maybe<ConditionGroup>;
  /**
   * Deprecated bare-array form. Retained unchanged for the one-release
   * deprecation window so pinned clients keep working. New callers
   * should use `conditionGroupsConnection(first:, after:, filter:, orderBy:)`.
   * @deprecated Use `conditionGroupsConnection(first:, after:, filter:, orderBy:)` — Relay-shaped cursor pagination over the same data.
   */
  conditionGroups: Array<ConditionGroup>;
  /**
   * Relay-shaped connection over `ConditionGroup` rows. Forward-only
   * cursor pagination via `first` / `after`. Replaces the deprecated
   * bare `conditionGroups(where:)`. `totalCount` is omitted per design-doc D3
   * (default-off, add per-PR where cheap).
   *
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `conditionGroups`) in a subsequent migration, once the deprecated
   * bare-array sibling above is removed.
   */
  conditionGroupsConnection: ConditionGroupConnection;
  /**
   * Deprecated bare-array form. Retained unchanged for the one-release
   * deprecation window. New callers should use
   * `conditionsConnection(first:, after:, filter:, orderBy:)`.
   * @deprecated Use `conditionsConnection(first:, after:, filter:, orderBy:)` — Relay-shaped cursor pagination over the same data.
   */
  conditions: Array<Condition>;
  /**
   * Relay-shaped connection over `Condition` rows. Forward-only cursor
   * pagination via `first` / `after`. Replaces the deprecated bare
   * `conditions(where:)`. Public conditions only.
   *
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `conditions`) in a subsequent migration, once the deprecated
   * bare-array sibling above is removed.
   */
  conditionsConnection: ConditionConnection;
  /**
   * Relay-style forecast list backed by EAS attestations. Defaults to attestedAt DESC.
   *
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `forecasts`) in a subsequent migration.
   */
  forecastsConnection: ForecastConnection;
  leaderboard: AccountRankingConnection;
  /**
   * Refetch any `Node`-implementing entity by its opaque global id. Returns
   * `null` when the id is malformed, the type is not registered, or the
   * underlying entity has been deleted. By-attribute lookups go through the
   * matching `*Connection(filter:)` — e.g. `tradesConnection(filter: { tradeHash: $h }).nodes[0]`
   * or `predictionsConnection(filter: { predictionId: $p }).nodes[0]`. `node(id:)`
   * exists so Relay-style clients can refetch cached entities polymorphically
   * without knowing their concrete type.
   */
  node?: Maybe<Node>;
  /**
   * Batched form of `node(id:)`. Preserves input order; each element is
   * resolved independently and may be null. Useful for client caches that
   * refresh many entities in one round trip.
   */
  nodes: Array<Maybe<Node>>;
  /**
   * Open interest aggregated per category — protocol-wide. Sums each ConditionGroup's pre-computed totalOpenInterest plus each ungrouped public condition's openInterest, returning categories with non-zero OI sorted descending.
   * @deprecated Use `protocol.openInterestByCategory`.
   */
  openInterestByCategory: Array<CategoryOpenInterest>;
  /**
   * Open interest bucketed by time-to-resolution — protocol-wide. Each unsettled prediction's collateral falls into the bucket of its latest condition endTime; expired-but-pending predictions roll into the soonest bucket.
   * @deprecated Use `protocol.openInterestByTimeToResolution`.
   */
  openInterestByTimeToResolution: Array<TimeToResolutionBucket>;
  /**
   * Look up a single pick configuration by ID
   * @deprecated Unused as a top-level query. Individual configs are reachable via the embedded `pickConfig` field on positions/predictions/trades, or via `pickConfigurationsConnection` for list lookups.
   */
  pickConfiguration?: Maybe<PickConfiguration>;
  /**
   * Paginated list of pick configurations, filterable by chain, resolution status, and result
   * @deprecated Use `pickConfigurationsConnection` — Relay-shaped cursor pagination over the same data.
   */
  pickConfigurations: Array<PickConfiguration>;
  /**
   * Relay-shaped connection over pick configurations.
   *
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `pickConfigurations`) in a subsequent migration, once the
   * deprecated bare-array `pickConfigurations` sibling above is removed.
   */
  pickConfigurationsConnection: PickConfigurationConnection;
  /** Top 20 most-used tags across public conditions */
  popularTags: Array<Scalars['String']['output']>;
  /**
   * Count of token positions for a given holder
   * @deprecated Use `positionsConnection` — Relay-shaped cursor pagination over the same data.
   */
  positionCount: Scalars['Int']['output'];
  /**
   * Paginated list of token position balances, filterable by holder, condition, chain, pick config, settlement, date range, collateral range, and won/lost status
   * @deprecated Use `positionsConnection` — Relay-shaped cursor pagination over the same data.
   */
  positions: Array<Position>;
  /**
   * Relay-shaped connection over token positions.
   *
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `positions`) in a subsequent migration, once the deprecated
   * `positions` bare-array / `positionsPage` siblings above are removed.
   */
  positionsConnection: PositionConnection;
  /**
   * Deprecated page wrapper retained for main/backward compatibility. New callers should use `positionsConnection(first:, after:, filter:, orderBy:)`.
   * @deprecated Use `positionsConnection` instead.
   */
  positionsPage: PositionsPage;
  /**
   * Look up a single prediction by its on-chain prediction ID. Pass
   * `predictionId:` — the legacy `id:` arg is kept (deprecated) so existing
   * callers keep working through one release.
   */
  prediction?: Maybe<Prediction>;
  /**
   * Count of escrow predictions involving the given address
   * @deprecated Use `predictionsConnection(...).totalCount` — same number, available alongside the connection payload, no extra query needed.
   */
  predictionCount: Scalars['Int']['output'];
  /**
   * Paginated list of escrow-based predictions, filterable by address, condition, chain, and settlement status
   * @deprecated Use `predictionsConnection` — same data with Relay `pageInfo.hasNextPage` and `pageInfo.endCursor`.
   */
  predictions: Array<Prediction>;
  /**
   * Relay-style prediction list. Defaults to createdAt DESC.
   *
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `predictions`) in a subsequent migration, once the deprecated
   * `predictions` bare-array sibling above is removed.
   */
  predictionsConnection: PredictionConnection;
  /**
   * Accounts ranked by an account metric (net PnL, gains, losses, or volume)
   * over an optional date window. `filters` omitted ⇒ rank by `NET_PNL` over
   * all-time. PnL metrics are attributed to settlement time, volume to trade
   * time. Page-shaped with server-truth `hasMore`; `totalCount` is populated
   * unconditionally (cheap in-memory derivation).
   */
  protocol: Protocol;
  /**
   * Protocol-wide statistics time series at the configured snapshot cadence —
   * cumulative volume, trade count, open interest, escrow balance. Window
   * with `fromEpoch` / `toEpoch` (epoch seconds, inclusive). Both omitted
   * returns full history.
   *
   * Bar timestamps: closed bars are labelled at *the start* of the interval
   * they represent (capture time minus one interval), so a bar at
   * `2026-01-01 00:00` summarizes activity ending `2026-01-02 00:00`. When
   * `toEpoch` covers now, a trailing live candle is appended; the live
   * candle's `timestamp` is the *current* interval boundary (not shifted
   * back), so callers can distinguish it as `points[points.length - 1]
   * .timestamp >= floor(now / interval) * interval`.
   * @deprecated Use `protocol.stats(filter:)` — Relay-shaped stats connection under the protocol namespace.
   */
  protocolStats: Array<ProtocolStat>;
  /**
   * Time-bucketed total protocol trading volume across all users. DEPRECATED:
   * use `protocolStats`; the fat row carries `periodVolume` / `cumulativeVolume`
   * per snapshot.
   * @deprecated Use `protocolStats` — the fat row carries `periodVolume` / `cumulativeVolume` per snapshot.
   */
  protocolVolume: Array<VolumeDataPoint>;
  /**
   * Deprecated bare-array form. Retained unchanged for the one-release
   * deprecation window so pinned clients keep working. New callers
   * should use `questionsConnection(first:, after:, filter:, orderBy:)`.
   * @deprecated Use `questionsConnection(first:, after:, filter:, orderBy:)` — Relay-shaped cursor pagination over the same interleaved feed.
   */
  questions: Array<Question>;
  /**
   * Relay-shaped connection over `Question` rows — the interleaved
   * Condition / ConditionGroup feed. Forward-only cursor pagination via
   * `first` / `after`. Replaces the deprecated bare `questions(...)`. `totalCount` is omitted on
   * `QuestionConnection` because the underlying SQL UNION cannot produce
   * a single COUNT cheaply.
   *
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `questions`) in a subsequent migration, once the deprecated
   * bare-array sibling above is removed.
   */
  questionsConnection: QuestionConnection;
  /**
   * Look up a single secondary market trade by its trade hash. Pass
   * `tradeHash:` — the legacy `id:` arg is kept (deprecated) so existing
   * callers keep working through one release.
   */
  trade?: Maybe<Trade>;
  /**
   * Count of secondary market trades matching the given filters
   * @deprecated Use `tradesConnection` — Relay-shaped cursor pagination over the same data.
   */
  tradeCount: Scalars['Int']['output'];
  /**
   * Paginated list of secondary market trades, filterable by seller, buyer, token, and chain
   * @deprecated Use `tradesConnection` — Relay-shaped cursor pagination over the same data.
   */
  trades: Array<Trade>;
  /**
   * Relay-shaped connection over secondary market trades.
   *
   * Note: this field will be renamed to drop the `Connection` suffix
   * (→ `trades`) in a subsequent migration, once the deprecated
   * `trades` bare-array sibling above is removed.
   */
  tradesConnection: TradeConnection;
  /** @deprecated Use `account(address:)` — flat address arg, returns the same address-keyed referral data via the new public-API-shaped `Account` type. The Prisma-leaked `User` type will be removed once telemetry on this path drains. */
  user?: Maybe<User>;
  /** @deprecated Unused; will be removed. No live consumers — account lookups go through `account(address:)`. */
  users: Array<User>;
  vault?: Maybe<Vault>;
  /**
   * Vault-specific statistics time series for a single vault address — vault
   * balance, deployed/available collateral, cumulative PnL, deposits,
   * withdrawals, airdrop gains, secondary flows, unredeemed claims. Window
   * with `fromEpoch` / `toEpoch` (epoch seconds, inclusive). Both omitted
   * returns full history.
   *
   * Bar timestamps follow the same convention as `protocolStats`: closed
   * bars are labelled at the *start* of the interval they represent, and a
   * trailing live candle (anchored to the *current* interval boundary) is
   * appended when `toEpoch` covers now.
   * @deprecated Use `vaultsConnection(filter: { address: $a }).nodes[0].stats(filter:)` — per-vault snapshots live on Vault.
   */
  vaultStats: Array<VaultStat>;
  /**
   * Paginated vault list, filterable by address / chain. Vaults are a
   * small statically configured set, so this exists mainly as the
   * by-address lookup pattern (`vaultsConnection(filter: { address: $a })`)
   * — replacing the dedicated `vaultByAddress` query.
   */
  vaultsConnection: VaultConnection;
};


export type QueryAccountArgs = {
  address: Scalars['Address']['input'];
};


export type QueryAccountAccuracyArgs = {
  address: Scalars['String']['input'];
};


export type QueryAccountAccuracyRankArgs = {
  address: Scalars['String']['input'];
};


export type QueryAccountActivityArgs = {
  address?: InputMaybe<Scalars['String']['input']>;
  conditionId?: InputMaybe<Scalars['String']['input']>;
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
  type?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAccountActivityPageArgs = {
  address?: InputMaybe<Scalars['String']['input']>;
  conditionId?: InputMaybe<Scalars['String']['input']>;
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
  type?: InputMaybe<ActivityItemType>;
};


export type QueryAccountBalanceArgs = {
  address: Scalars['String']['input'];
  from?: InputMaybe<Scalars['DateTimeISO']['input']>;
  interval: TimeInterval;
  to?: InputMaybe<Scalars['DateTimeISO']['input']>;
};


export type QueryAccountPnlArgs = {
  address: Scalars['String']['input'];
  from?: InputMaybe<Scalars['DateTimeISO']['input']>;
  interval: TimeInterval;
  to?: InputMaybe<Scalars['DateTimeISO']['input']>;
};


export type QueryAccountPredictionCountArgs = {
  address: Scalars['String']['input'];
  from?: InputMaybe<Scalars['DateTimeISO']['input']>;
  interval: TimeInterval;
  to?: InputMaybe<Scalars['DateTimeISO']['input']>;
};


export type QueryAccountProfitRankArgs = {
  address: Scalars['String']['input'];
};


export type QueryAccountStatsArgs = {
  address: Scalars['String']['input'];
  from?: InputMaybe<Scalars['UnixSeconds']['input']>;
  fromEpoch?: InputMaybe<Scalars['Int']['input']>;
  to?: InputMaybe<Scalars['UnixSeconds']['input']>;
  toEpoch?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryAccountStatsLeaderboardPageArgs = {
  filters?: InputMaybe<AccountStatsFilters>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QueryAccountStatsRankArgs = {
  address: Scalars['String']['input'];
  filters?: InputMaybe<AccountStatsFilters>;
};


export type QueryAccountTotalVolumeArgs = {
  address: Scalars['String']['input'];
};


export type QueryAccountVolumeArgs = {
  address: Scalars['String']['input'];
  from?: InputMaybe<Scalars['DateTimeISO']['input']>;
  interval: TimeInterval;
  to?: InputMaybe<Scalars['DateTimeISO']['input']>;
};


export type QueryAccountsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<AccountFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<AccountOrder>;
};


export type QueryAccuracyLeaderboardPageArgs = {
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QueryActivityArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ActivityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ActivityOrder>;
};


export type QueryActivityPageArgs = {
  address?: InputMaybe<Scalars['String']['input']>;
  conditionId?: InputMaybe<Scalars['String']['input']>;
  filters?: InputMaybe<ActivityFilters>;
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
  type?: InputMaybe<ActivityItemType>;
};


export type QueryCategoriesArgs = {
  cursor?: InputMaybe<CategoryWhereUniqueInput>;
  distinct?: InputMaybe<Array<CategoryScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<CategoryOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryCategoriesConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<CategoryFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryClaimsArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  holder?: InputMaybe<Scalars['String']['input']>;
  predictionId?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QueryClosesArgs = {
  address?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QueryCollateralBalanceArgs = {
  account?: InputMaybe<Scalars['Address']['input']>;
  address?: InputMaybe<Scalars['String']['input']>;
  atBlock?: InputMaybe<Scalars['Int']['input']>;
  chainId: Scalars['Int']['input'];
};


export type QueryCollateralBalanceHistoryArgs = {
  account?: InputMaybe<Scalars['Address']['input']>;
  address?: InputMaybe<Scalars['String']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
  chainId: Scalars['Int']['input'];
  count?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  intervalHours?: Scalars['Int']['input'];
  intervalSeconds?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryCollateralTransfersArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  excludeProtocol?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
};


export type QueryCollateralTransfersConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<CollateralTransferFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<CollateralTransferOrder>;
};


export type QueryConditionArgs = {
  where: ConditionWhereUniqueInput;
};


export type QueryConditionGroupArgs = {
  where: ConditionGroupWhereUniqueInput;
};


export type QueryConditionGroupsArgs = {
  cursor?: InputMaybe<ConditionGroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionGroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionGroupWhereInput>;
};


export type QueryConditionGroupsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ConditionGroupFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ConditionGroupOrder>;
};


export type QueryConditionsArgs = {
  cursor?: InputMaybe<ConditionWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};


export type QueryConditionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ConditionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ConditionOrder>;
};


export type QueryForecastsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ForecastFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ForecastOrder>;
};


export type QueryLeaderboardArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<AccountRankingFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  metric: LeaderboardMetric;
};


export type QueryNodeArgs = {
  id: Scalars['ID']['input'];
};


export type QueryNodesArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type QueryPickConfigurationArgs = {
  id: Scalars['String']['input'];
};


export type QueryPickConfigurationsArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  resolved?: InputMaybe<Scalars['Boolean']['input']>;
  result?: InputMaybe<SettlementResult>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
  tokens?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryPickConfigurationsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PickConfigurationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PickConfigurationOrder>;
};


export type QueryPositionCountArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  holder: Scalars['String']['input'];
  settled?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryPositionsArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  collateralMax?: InputMaybe<Scalars['String']['input']>;
  collateralMin?: InputMaybe<Scalars['String']['input']>;
  conditionId?: InputMaybe<Scalars['String']['input']>;
  endsAtMax?: InputMaybe<Scalars['Int']['input']>;
  endsAtMin?: InputMaybe<Scalars['Int']['input']>;
  holder?: InputMaybe<Scalars['String']['input']>;
  holderWon?: InputMaybe<Scalars['Boolean']['input']>;
  orderBy?: InputMaybe<PositionSortField>;
  orderDirection?: InputMaybe<SortOrder>;
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  result?: InputMaybe<SettlementResult>;
  settled?: InputMaybe<Scalars['Boolean']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QueryPositionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PositionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PositionOrder>;
};


export type QueryPositionsPageArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  collateralMax?: InputMaybe<Scalars['String']['input']>;
  collateralMin?: InputMaybe<Scalars['String']['input']>;
  conditionId?: InputMaybe<Scalars['String']['input']>;
  endsAtMax?: InputMaybe<Scalars['UnixSeconds']['input']>;
  endsAtMin?: InputMaybe<Scalars['UnixSeconds']['input']>;
  filters?: InputMaybe<PositionFilters>;
  holder?: InputMaybe<Scalars['String']['input']>;
  holderWon?: InputMaybe<Scalars['Boolean']['input']>;
  orderBy?: InputMaybe<PositionSortField>;
  orderDirection?: InputMaybe<SortOrder>;
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  result?: InputMaybe<SettlementResult>;
  settled?: InputMaybe<Scalars['Boolean']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QueryPredictionArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
  predictionId?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPredictionCountArgs = {
  address: Scalars['String']['input'];
  chainId?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryPredictionsArgs = {
  address?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  conditionId?: InputMaybe<Scalars['String']['input']>;
  isLegacy?: InputMaybe<Scalars['Boolean']['input']>;
  orderBy?: InputMaybe<PredictionSortField>;
  orderDirection?: InputMaybe<SortOrder>;
  settled?: InputMaybe<Scalars['Boolean']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QueryPredictionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PredictionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PredictionOrder>;
};


export type QueryProtocolStatsArgs = {
  from?: InputMaybe<Scalars['UnixSeconds']['input']>;
  fromEpoch?: InputMaybe<Scalars['Int']['input']>;
  to?: InputMaybe<Scalars['UnixSeconds']['input']>;
  toEpoch?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryProtocolVolumeArgs = {
  from?: InputMaybe<Scalars['DateTimeISO']['input']>;
  interval: TimeInterval;
  to?: InputMaybe<Scalars['DateTimeISO']['input']>;
};


export type QueryQuestionsArgs = {
  categorySlugs?: InputMaybe<Array<Scalars['String']['input']>>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  maxEstimatedPrice?: InputMaybe<Scalars['Float']['input']>;
  maxSimilarMarketVolume?: InputMaybe<Scalars['Float']['input']>;
  minEndTime?: InputMaybe<Scalars['Int']['input']>;
  minEstimatedPrice?: InputMaybe<Scalars['Float']['input']>;
  minSimilarMarketVolume?: InputMaybe<Scalars['Float']['input']>;
  resolutionStatus?: InputMaybe<ResolutionStatus>;
  search?: InputMaybe<Scalars['String']['input']>;
  similarMarketVolumeWindow?: InputMaybe<VolumeWindow>;
  skip?: Scalars['Int']['input'];
  sortDirection?: SortOrder;
  sortField?: InputMaybe<QuestionSortField>;
  tag?: InputMaybe<Scalars['String']['input']>;
  take?: Scalars['Int']['input'];
};


export type QueryQuestionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<QuestionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<QuestionOrder>;
};


export type QueryTradeArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
  tradeHash?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTradeCountArgs = {
  buyer?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  seller?: InputMaybe<Scalars['String']['input']>;
  token?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTradesArgs = {
  address?: InputMaybe<Scalars['String']['input']>;
  buyer?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  seller?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
  token?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTradesConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<TradeFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<TradeOrder>;
};


export type QueryUserArgs = {
  where: UserWhereUniqueInput;
};


export type QueryUsersArgs = {
  cursor?: InputMaybe<UserWhereUniqueInput>;
  distinct?: InputMaybe<Array<UserScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<UserOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<UserWhereInput>;
};


export type QueryVaultArgs = {
  id: Scalars['ID']['input'];
};


export type QueryVaultStatsArgs = {
  from?: InputMaybe<Scalars['UnixSeconds']['input']>;
  fromEpoch?: InputMaybe<Scalars['Int']['input']>;
  to?: InputMaybe<Scalars['UnixSeconds']['input']>;
  toEpoch?: InputMaybe<Scalars['Int']['input']>;
  vaultAddress: Scalars['String']['input'];
};


export type QueryVaultsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<VaultFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryMode =
  | 'default'
  | 'insensitive';

/**
 * A question — derived view that interleaves grouped and ungrouped markets.
 * A `Question` is **not** a durable entity (no `Node` membership, no
 * `question(id:)` lookup). Identity flows through the wrapped `source`
 * (either a `Condition` or a `ConditionGroup`), each of which already
 * carries its own primary key.
 */
export type Question = {
  __typename?: 'Question';
  activity: ActivityConnection;
  category?: Maybe<Category>;
  /** @deprecated Use `source` (union over Condition | ConditionGroup). */
  condition?: Maybe<Condition>;
  /** Creation timestamp forwarded from the source. */
  createdAt: Scalars['DateTimeISO']['output'];
  /** Long-form description forwarded from the source (`Condition.description`); null for groups. */
  description?: Maybe<Scalars['String']['output']>;
  forecasts: ForecastConnection;
  /** @deprecated Use `source` (union over Condition | ConditionGroup). */
  group?: Maybe<ConditionGroup>;
  /** Open interest forwarded from the source — `Condition.openInterest` or `ConditionGroup.totalOpenInterest`. */
  openInterest?: Maybe<Scalars['String']['output']>;
  /** @deprecated Use `source` and read `predictionCount` on the wrapped entity. */
  predictionCount?: Maybe<Scalars['Int']['output']>;
  predictions: PredictionConnection;
  /** @deprecated Use `source.__typename`. */
  questionType: QuestionItemType;
  /** Resolution time forwarded from the source — `Condition.endTime` or `ConditionGroup.maxEndTime`. */
  resolvesAt?: Maybe<Scalars['UnixSeconds']['output']>;
  /**
   * The underlying entity this question wraps. Exactly one of
   * `Condition` | `ConditionGroup`. `__typename` discriminates between
   * the two; the legacy `questionType` field is the same information in
   * scalar form and is now `@deprecated`.
   */
  source: ConditionOrConditionGroup;
  tags: Array<Scalars['String']['output']>;
  /** Display title forwarded from the source — `Condition.question` or `ConditionGroup.name`. */
  title: Scalars['String']['output'];
  trades: TradeConnection;
  /** 24h similar-market volume forwarded from the source. */
  volume?: Maybe<Scalars['Float']['output']>;
};


/**
 * A question — derived view that interleaves grouped and ungrouped markets.
 * A `Question` is **not** a durable entity (no `Node` membership, no
 * `question(id:)` lookup). Identity flows through the wrapped `source`
 * (either a `Condition` or a `ConditionGroup`), each of which already
 * carries its own primary key.
 */
export type QuestionActivityArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ActivityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ActivityOrder>;
};


/**
 * A question — derived view that interleaves grouped and ungrouped markets.
 * A `Question` is **not** a durable entity (no `Node` membership, no
 * `question(id:)` lookup). Identity flows through the wrapped `source`
 * (either a `Condition` or a `ConditionGroup`), each of which already
 * carries its own primary key.
 */
export type QuestionForecastsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ForecastFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ForecastOrder>;
};


/**
 * A question — derived view that interleaves grouped and ungrouped markets.
 * A `Question` is **not** a durable entity (no `Node` membership, no
 * `question(id:)` lookup). Identity flows through the wrapped `source`
 * (either a `Condition` or a `ConditionGroup`), each of which already
 * carries its own primary key.
 */
export type QuestionPredictionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PredictionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PredictionOrder>;
};


/**
 * A question — derived view that interleaves grouped and ungrouped markets.
 * A `Question` is **not** a durable entity (no `Node` membership, no
 * `question(id:)` lookup). Identity flows through the wrapped `source`
 * (either a `Condition` or a `ConditionGroup`), each of which already
 * carries its own primary key.
 */
export type QuestionTradesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<TradeFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<TradeOrder>;
};

/** Relay-shaped connection over `Question` rows. */
export type QuestionConnection = {
  __typename?: 'QuestionConnection';
  edges: Array<QuestionEdge>;
  nodes: Array<Question>;
  pageInfo: PageInfo;
  /**
   * Size of the underlying ranked set the page is sliced from. Resolved lazily
   * via a separate `COUNT(*)` over the same `condition_group` / ungrouped
   * `condition` UNION only when clients select this field.
   */
  totalCount: Scalars['Int']['output'];
};

/** Cursor-bearing edge for `QuestionConnection`. */
export type QuestionEdge = {
  __typename?: 'QuestionEdge';
  cursor: Scalars['String']['output'];
  node: Question;
};

/**
 * Filter input for the Relay-shaped `questions` connection. Combines
 * with AND. For outcome-based filtering today, use
 * `conditions(filter: { outcome: ... })`.
 */
export type QuestionFilter = {
  /** Restrict to questions whose category slug is in this set. */
  categorySlugs?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Restrict to a single chain. Defaults to DEFAULT_CHAIN_ID when a resolver-address filter is present. */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Filter by estimated price, e.g. `{ gte: 0.2, lte: 0.8 }`. */
  estimatedPrice?: InputMaybe<FloatFilter>;
  /**
   * Deprecated alias for `resolverAddress`; kept during the rename window for older clients.
   * @deprecated Use `resolverAddress` — same resolver/oracle contract address, accurately named.
   */
  marketAddress?: InputMaybe<Scalars['Address']['input']>;
  /**
   * Deprecated alias for `resolverAddressIn`; kept during the rename window for older clients.
   * @deprecated Use `resolverAddressIn` — same resolver/oracle contract addresses, accurately named.
   */
  marketAddressIn?: InputMaybe<Array<Scalars['Address']['input']>>;
  /** Resolution-status filter; defaults to all when omitted. */
  resolutionStatus?: InputMaybe<ResolutionStatus>;
  /**
   * Match the on-chain resolver (oracle) contract address for the underlying condition.
   * Distinct from the PredictionMarketEscrow address; see `Condition.resolverAddress`.
   */
  resolverAddress?: InputMaybe<Scalars['Address']['input']>;
  /** Match any of these resolver contract addresses. Same semantics as `resolverAddress`. */
  resolverAddressIn?: InputMaybe<Array<Scalars['Address']['input']>>;
  /** Filter by resolution epoch seconds, e.g. `{ gte: 1770000000 }`. */
  resolvesAt?: InputMaybe<IntFilter>;
  /** Free-text search across the wrapped Condition/Group's title and description (case-insensitive). */
  search?: InputMaybe<Scalars['String']['input']>;
  /** Filter by all-time or windowed similar-market volume, e.g. `{ gte: 10000 }`. */
  similarMarketVolume?: InputMaybe<FloatFilter>;
  /** Window the similar-market-volume filter and sort look at. When omitted, the all-time column is used. */
  similarMarketVolumeWindow?: InputMaybe<VolumeWindow>;
  /**
   * Restrict to questions tagged with this value. Single-tag only at
   * the SDL level — the underlying union runner accepts one tag at a
   * time. Multi-tag (`[String!]`) will be added when the runner supports
   * it (additive, non-breaking).
   */
  tag?: InputMaybe<Scalars['String']['input']>;
};

/**
 * Legacy flat filter input mirroring the inline-arg shape that the deprecated
 * `questions(...)` resolver kept.
 */
export type QuestionFilters = {
  /** Restrict to questions whose category slug is in this set. */
  categorySlugs?: InputMaybe<Array<Scalars['String']['input']>>;
  /**
   * Restrict to a single chain. When omitted and a `contractAddress*` filter is
   * present, defaults to the API's `DEFAULT_CHAIN_ID` so address lookups are not
   * silently cross-chain.
   */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /**
   * Match the on-chain contract address that owns the underlying condition
   * (case-insensitive). Maps to the DB `condition.resolver` column. Pair with
   * `chainId`; if omitted, `chainId` defaults to `DEFAULT_CHAIN_ID`.
   */
  contractAddress?: InputMaybe<Scalars['String']['input']>;
  /**
   * Match any of these on-chain contract addresses (case-insensitive). Same
   * semantics as `contractAddress`.
   */
  contractAddressIn?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Restrict to conditions with `estimatedPrice <= this`. */
  maxEstimatedPrice?: InputMaybe<Scalars['Float']['input']>;
  /** Restrict to conditions with similar-market volume `<= this`. */
  maxSimilarMarketVolume?: InputMaybe<Scalars['Float']['input']>;
  /** Restrict to conditions with `endTime >= this`. */
  minEndTime?: InputMaybe<Scalars['UnixSeconds']['input']>;
  /** Restrict to conditions with `estimatedPrice >= this`. */
  minEstimatedPrice?: InputMaybe<Scalars['Float']['input']>;
  /** Restrict to conditions with similar-market volume `>= this`. */
  minSimilarMarketVolume?: InputMaybe<Scalars['Float']['input']>;
  /** Resolution-status filter; defaults to `all` when omitted. */
  resolutionStatus?: InputMaybe<ResolutionStatus>;
  /** Free-text search across the group/condition's `name`, `question`, `shortName`, and `tags` (case-insensitive). */
  search?: InputMaybe<Scalars['String']['input']>;
  /**
   * Window the similar-market-volume filter and sort look at. When omitted,
   * the all-time `similarMarketVolume` column is used.
   */
  similarMarketVolumeWindow?: InputMaybe<VolumeWindow>;
  /** Single-tag filter (case-sensitive against the condition's `tags` array). */
  tag?: InputMaybe<Scalars['String']['input']>;
};

/** Whether a question is a group of related conditions or a single condition */
export type QuestionItemType =
  | 'condition'
  | 'group';

/** Order input for the Relay-shaped `questions` connection. */
export type QuestionOrder = {
  direction: OrderDirection;
  field: QuestionOrderField;
};

/**
 * Sort fields for the Relay-shaped `questions` connection. The runner
 * unions Conditions and ConditionGroups; sort values pick the column on
 * each side. Unlike the narrower Condition/ConditionGroup connections,
 * `OPEN_INTEREST` is available here because this feed uses raw SQL and
 * casts the varchar-backed open-interest values numerically.
 */
export type QuestionOrderField =
  | 'CREATED_AT'
  | 'OPEN_INTEREST'
  | 'PREDICTION_COUNT'
  | 'RESOLVES_AT'
  | 'SIMILAR_MARKET_VOLUME_7D'
  | 'SIMILAR_MARKET_VOLUME_24H';

/** Field to sort questions by */
export type QuestionSortField =
  | 'createdAt'
  | 'endTime'
  | 'openInterest'
  | 'predictionCount'
  | 'similarMarketVolume';

/**
 * Public referral code metadata. Exposed via `User.referredByCode` /
 * `Account.referredByCode` so clients can render an account's referrer.
 *
 * Referral codes are low-security attribution hints: using someone else's code
 * only credits that referrer; it does not grant access to funds or privileged
 * actions. `codeHash` is intentionally omitted from GraphQL — public clients
 * identify codes by integer `id`. Aggregate analytics (claim count, volume,
 * claimants) live on the public REST endpoint `GET /referrals/codes`.
 *
 * TODO(node-migration): Should `implements Node` with `id: ID!`. Currently
 * exposes `id: Int!` (Prisma row id), so the wire format would change from
 * number → opaque string — a breaking change for typed clients. Plan: add
 * `globalId: ID!` alongside, deprecate the raw integer read, flip on a
 * future major.
 */
export type ReferralCode = {
  __typename?: 'ReferralCode';
  createdAt: Scalars['DateTimeISO']['output'];
  createdBy: Scalars['String']['output'];
  creatorType: Scalars['String']['output'];
  expiresAt?: Maybe<Scalars['UnixSeconds']['output']>;
  id: Scalars['Int']['output'];
  isActive: Scalars['Boolean']['output'];
  maxClaims: Scalars['Int']['output'];
  updatedAt: Scalars['DateTimeISO']['output'];
};

export type ReferralCodeNullableRelationFilter = {
  is?: InputMaybe<ReferralCodeWhereInput>;
  isNot?: InputMaybe<ReferralCodeWhereInput>;
};

export type ReferralCodeOrderByWithRelationInput = {
  createdAt?: InputMaybe<SortOrder>;
  createdBy?: InputMaybe<SortOrder>;
  creatorType?: InputMaybe<SortOrder>;
  expiresAt?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  isActive?: InputMaybe<SortOrder>;
  maxClaims?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ReferralCodeWhereInput = {
  AND?: InputMaybe<Array<ReferralCodeWhereInput>>;
  NOT?: InputMaybe<Array<ReferralCodeWhereInput>>;
  OR?: InputMaybe<Array<ReferralCodeWhereInput>>;
  createdAt?: InputMaybe<DateTimeFilter>;
  createdBy?: InputMaybe<StringFilter>;
  creatorType?: InputMaybe<StringFilter>;
  expiresAt?: InputMaybe<IntNullableFilter>;
  id?: InputMaybe<IntFilter>;
  isActive?: InputMaybe<BoolFilter>;
  maxClaims?: InputMaybe<IntFilter>;
  updatedAt?: InputMaybe<DateTimeFilter>;
};

/** Filter questions by their resolution status */
export type ResolutionStatus =
  | 'all'
  | 'resolved'
  | 'resolvedNo'
  | 'resolvedYes'
  | 'unresolved';

/** Outcome of a prediction settlement */
export type SettlementResult =
  | 'COUNTERPARTY_WINS'
  | 'NON_DECISIVE'
  | 'PREDICTOR_WINS'
  | 'UNRESOLVED';

export type SettlementResultFilter = {
  equals?: InputMaybe<SettlementResult>;
  in?: InputMaybe<Array<SettlementResult>>;
  not?: InputMaybe<SettlementResult>;
  notIn?: InputMaybe<Array<SettlementResult>>;
};

export type SortOrder =
  | 'ASC'
  | 'DESC'
  | 'asc'
  | 'desc';

export type SortOrderInput = {
  nulls?: InputMaybe<NullsOrder>;
  sort: SortOrder;
};

export type StringFilter = {
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  equals?: InputMaybe<Scalars['String']['input']>;
  gt?: InputMaybe<Scalars['String']['input']>;
  gte?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  lt?: InputMaybe<Scalars['String']['input']>;
  lte?: InputMaybe<Scalars['String']['input']>;
  mode?: InputMaybe<QueryMode>;
  not?: InputMaybe<NestedStringFilter>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type StringNullableFilter = {
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  equals?: InputMaybe<Scalars['String']['input']>;
  gt?: InputMaybe<Scalars['String']['input']>;
  gte?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  lt?: InputMaybe<Scalars['String']['input']>;
  lte?: InputMaybe<Scalars['String']['input']>;
  mode?: InputMaybe<QueryMode>;
  not?: InputMaybe<NestedStringNullableFilter>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type StringNullableListFilter = {
  equals?: InputMaybe<Array<Scalars['String']['input']>>;
  has?: InputMaybe<Scalars['String']['input']>;
  hasEvery?: InputMaybe<Array<Scalars['String']['input']>>;
  hasSome?: InputMaybe<Array<Scalars['String']['input']>>;
  isEmpty?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Time interval for bucketing the legacy per-account time-series resolvers. */
export type TimeInterval =
  | 'DAY'
  | 'HOUR'
  | 'MONTH'
  | 'WEEK';

/**
 * Open-interest aggregated by time-to-resolution bucket. Each unsettled
 * prediction's collateral is bucketed by the latest endTime among the conditions
 * it touches (the moment its OI can finally be claimed). One row per non-empty
 * bucket, ordered from soonest (bucket = 1) to furthest out.
 */
export type TimeToResolutionBucket = {
  __typename?: 'TimeToResolutionBucket';
  /** Sort order: 1 = soonest, increasing for further-out buckets */
  bucket: Scalars['Int']['output'];
  /** Display label, e.g. ≤1d / 2-7d / 1-2mo */
  label: Scalars['String']['output'];
  /** Open interest in wei (decimal string) */
  openInterest: Scalars['String']['output'];
  /** Number of predictions contributing to this bucket */
  predictionCount: Scalars['Int']['output'];
};

/**
 * Secondary market trade record where position tokens are exchanged
 * between users. The on-chain reference is `tradeHash`; `id` is an
 * internal row id (see schema-preamble conventions).
 *
 * TODO(node-migration): Should `implements Node` with `id: ID!`. Currently
 * exposes `id: Int!` (Prisma row id), so the wire format would change from
 * number → opaque string — a breaking change for typed clients. Plan: add
 * `globalId: ID!` alongside, deprecate the raw integer read, flip on a
 * future major.
 */
export type Trade = {
  __typename?: 'Trade';
  blockNumber: Scalars['Int']['output'];
  /** Buyer wallet address (lowercase 0x-hex). */
  buyer: Scalars['String']['output'];
  chainId: Scalars['Int']['output'];
  /** Collateral asset address paid in this trade (lowercase 0x-hex). */
  collateral: Scalars['String']['output'];
  executedAt: Scalars['UnixSeconds']['output'];
  id: Scalars['Int']['output'];
  /** Total collateral paid by buyer (wei, 18 dec). `price / tokenAmount` is the per-share price. */
  price: Scalars['String']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  /** Seller wallet address (lowercase 0x-hex). */
  seller: Scalars['String']['output'];
  /** Position token address being exchanged (lowercase 0x-hex). */
  token: Scalars['String']['output'];
  /** Quantity of position tokens transferred (wei, 18 dec on Sapience). */
  tokenAmount: Scalars['String']['output'];
  /** Canonical trade hash — the on-chain identifier (0x-prefixed). */
  tradeHash: Scalars['String']['output'];
  txHash: Scalars['String']['output'];
};

/** Relay-shaped connection over `Trade` rows. */
export type TradeConnection = {
  __typename?: 'TradeConnection';
  edges: Array<TradeEdge>;
  nodes: Array<Trade>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

/** Cursor-bearing edge for `TradeConnection`. */
export type TradeEdge = {
  __typename?: 'TradeEdge';
  cursor: Scalars['String']['output'];
  node: Trade;
};

/** Filter input for the Relay-shaped `tradesConnection` query. Combines with AND. */
export type TradeFilter = {
  /** Restrict to trades where the address is seller or buyer. Mutually exclusive with `seller`/`buyer`. */
  address?: InputMaybe<Scalars['Address']['input']>;
  /** Restrict to a single buyer address. */
  buyer?: InputMaybe<Scalars['Address']['input']>;
  /** Restrict to a single chain. */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Filter by execution epoch seconds, e.g. `{ gte: 1770000000, lt: 1770086400 }`. */
  executedAt?: InputMaybe<IntFilter>;
  /** Restrict to a single seller address. */
  seller?: InputMaybe<Scalars['Address']['input']>;
  /** Restrict to a single position token address. */
  token?: InputMaybe<Scalars['Address']['input']>;
  tokens?: InputMaybe<Array<Scalars['Address']['input']>>;
  /**
   * Restrict to a single trade by execution hash. Supports the
   * by-hash single-record lookup pattern — `tradesConnection(filter: { tradeHash: $h }).nodes[0]`
   * replaces the dedicated `tradeByHash` query.
   */
  tradeHash?: InputMaybe<Scalars['Bytes32']['input']>;
};

/** Order input for the Relay-shaped `tradesConnection`. */
export type TradeOrder = {
  direction: OrderDirection;
  field: TradeOrderField;
};

/** Sort fields for the Relay-shaped `tradesConnection`. */
export type TradeOrderField =
  | 'BLOCK_NUMBER'
  | 'EXECUTED_AT';

/**
 * Application-level user record, keyed by wallet address,
 * used for referrals and other per-wallet metadata.
 */
export type User = {
  __typename?: 'User';
  _count?: Maybe<UserCount>;
  /** Canonical Ethereum wallet address for this user. */
  address: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  /**
   * Maximum number of referrals this user's code allows. Default is 0,
   * so codes are not usable until explicitly configured.
   */
  maxReferrals: Scalars['Int']['output'];
  /** keccak256(utf8(trimmed_lowercase_code)) stored as 0x-prefixed hex. */
  refCodeHash?: Maybe<Scalars['String']['output']>;
  referrals: Array<User>;
  referredBy?: Maybe<User>;
  referredByCode?: Maybe<ReferralCode>;
  referredByCodeId?: Maybe<Scalars['Int']['output']>;
  referredById?: Maybe<Scalars['Int']['output']>;
  updatedAt: Scalars['DateTimeISO']['output'];
};


/**
 * Application-level user record, keyed by wallet address,
 * used for referrals and other per-wallet metadata.
 */
export type UserReferralsArgs = {
  cursor?: InputMaybe<UserWhereUniqueInput>;
  distinct?: InputMaybe<Array<UserScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<UserOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<UserWhereInput>;
};


/**
 * Application-level user record, keyed by wallet address,
 * used for referrals and other per-wallet metadata.
 */
export type UserReferredByArgs = {
  where?: InputMaybe<UserWhereInput>;
};


/**
 * Application-level user record, keyed by wallet address,
 * used for referrals and other per-wallet metadata.
 */
export type UserReferredByCodeArgs = {
  where?: InputMaybe<ReferralCodeWhereInput>;
};

export type UserCount = {
  __typename?: 'UserCount';
  referrals: Scalars['Int']['output'];
};


export type UserCountReferralsArgs = {
  where?: InputMaybe<UserWhereInput>;
};

export type UserListRelationFilter = {
  every?: InputMaybe<UserWhereInput>;
  none?: InputMaybe<UserWhereInput>;
  some?: InputMaybe<UserWhereInput>;
};

export type UserNullableRelationFilter = {
  is?: InputMaybe<UserWhereInput>;
  isNot?: InputMaybe<UserWhereInput>;
};

export type UserOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type UserOrderByWithRelationInput = {
  address?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  maxReferrals?: InputMaybe<SortOrder>;
  refCodeHash?: InputMaybe<SortOrderInput>;
  referrals?: InputMaybe<UserOrderByRelationAggregateInput>;
  referredBy?: InputMaybe<UserOrderByWithRelationInput>;
  referredByCode?: InputMaybe<ReferralCodeOrderByWithRelationInput>;
  referredByCodeId?: InputMaybe<SortOrderInput>;
  referredById?: InputMaybe<SortOrderInput>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type UserScalarFieldEnum =
  | 'address'
  | 'createdAt'
  | 'id'
  | 'maxReferrals'
  | 'refCodeHash'
  | 'referredByCodeId'
  | 'referredById'
  | 'updatedAt';

export type UserWhereInput = {
  AND?: InputMaybe<Array<UserWhereInput>>;
  NOT?: InputMaybe<Array<UserWhereInput>>;
  OR?: InputMaybe<Array<UserWhereInput>>;
  address?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  maxReferrals?: InputMaybe<IntFilter>;
  refCodeHash?: InputMaybe<StringNullableFilter>;
  referrals?: InputMaybe<UserListRelationFilter>;
  referredBy?: InputMaybe<UserNullableRelationFilter>;
  referredByCode?: InputMaybe<ReferralCodeNullableRelationFilter>;
  referredByCodeId?: InputMaybe<IntNullableFilter>;
  referredById?: InputMaybe<IntNullableFilter>;
  updatedAt?: InputMaybe<DateTimeFilter>;
};

export type UserWhereUniqueInput = {
  AND?: InputMaybe<Array<UserWhereInput>>;
  NOT?: InputMaybe<Array<UserWhereInput>>;
  OR?: InputMaybe<Array<UserWhereInput>>;
  address?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  maxReferrals?: InputMaybe<IntFilter>;
  refCodeHash?: InputMaybe<Scalars['String']['input']>;
  referrals?: InputMaybe<UserListRelationFilter>;
  referredBy?: InputMaybe<UserNullableRelationFilter>;
  referredByCode?: InputMaybe<ReferralCodeNullableRelationFilter>;
  referredByCodeId?: InputMaybe<IntNullableFilter>;
  referredById?: InputMaybe<IntNullableFilter>;
  updatedAt?: InputMaybe<DateTimeFilter>;
};

export type Vault = Node & {
  __typename?: 'Vault';
  account: Account;
  address: Scalars['Address']['output'];
  chainId: Scalars['Int']['output'];
  collateral: CollateralToken;
  id: Scalars['ID']['output'];
  stats: VaultStatConnection;
};


export type VaultStatsArgs = {
  filter?: InputMaybe<VaultStatFilter>;
};

export type VaultConnection = {
  __typename?: 'VaultConnection';
  edges: Array<VaultEdge>;
  nodes: Array<Vault>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type VaultEdge = {
  __typename?: 'VaultEdge';
  cursor: Scalars['String']['output'];
  node: Vault;
};

/**
 * Filter input for `vaultsConnection`. Vaults are a small statically
 * configured set, so the filter exists primarily to support
 * `vaultsConnection(filter: { address: $a })` as the by-address lookup
 * pattern — the connection replaces the dedicated `vaultByAddress` query.
 */
export type VaultFilter = {
  /**
   * Restrict to a single vault address (case-insensitive). Matches both
   * the canonical vault address and any of its configured legacy aliases.
   */
  address?: InputMaybe<Scalars['Address']['input']>;
  /**
   * Restrict to a single chain. Defaults to the SDK's `DEFAULT_CHAIN_ID`
   * when omitted.
   */
  chainId?: InputMaybe<Scalars['Int']['input']>;
};

/** Vault-specific stats snapshot for a single vault address. */
export type VaultStat = {
  __typename?: 'VaultStat';
  airdropGains: Scalars['String']['output'];
  availableAssets: Scalars['String']['output'];
  balance: Scalars['String']['output'];
  cumulativePnL: Scalars['String']['output'];
  deployed: Scalars['String']['output'];
  deposits: Scalars['String']['output'];
  /** Realized PnL delta over the snapshot interval */
  periodPnL: Scalars['String']['output'];
  positionsLost: Scalars['Int']['output'];
  positionsWon: Scalars['Int']['output'];
  /** Cumulative wUSDe paid by the vault on secondary-market buys */
  secondaryBought: Scalars['String']['output'];
  /** Cumulative wUSDe received by the vault on secondary-market sells */
  secondarySold: Scalars['String']['output'];
  /** Snapshot boundary, aligned to the snapshot interval. */
  timestamp: Scalars['UnixSeconds']['output'];
  /** wUSDe earmarked for the vault from resolved-but-not-yet-redeemed wins */
  unredeemedClaim: Scalars['String']['output'];
  vault: Vault;
  withdrawals: Scalars['String']['output'];
};

export type VaultStatConnection = {
  __typename?: 'VaultStatConnection';
  edges: Array<VaultStatEdge>;
  nodes: Array<VaultStat>;
  pageInfo: PageInfo;
  /**
   * Size of the full per-vault snapshot series (pre-pagination). Already
   * known in memory — the resolver materializes every snapshot before
   * slicing — so cheap to surface.
   */
  totalCount: Scalars['Int']['output'];
};

export type VaultStatEdge = {
  __typename?: 'VaultStatEdge';
  cursor: Scalars['String']['output'];
  node: VaultStat;
};

export type VaultStatFilter = {
  timestamp?: InputMaybe<IntFilter>;
};

/** Time-bucketed volume data point for charts (legacy). */
export type VolumeDataPoint = {
  __typename?: 'VolumeDataPoint';
  /** Unix epoch timestamp (seconds) for the start of this bucket */
  timestamp: Scalars['Int']['output'];
  /** Total volume in wei for this bucket */
  volume: Scalars['String']['output'];
};

/** Time window for volume-based sorting */
export type VolumeWindow =
  | 'fourHours'
  | 'fourHoursFiltered'
  | 'oneHour'
  | 'oneHourFiltered'
  | 'sevenDays'
  | 'sevenDaysFiltered'
  | 'twentyFourHours'
  | 'twentyFourHoursFiltered';
