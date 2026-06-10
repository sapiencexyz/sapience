export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  /** 0x-prefixed lowercase 20-byte Ethereum address. Mixed-case checksum input is accepted and normalized to lowercase. */
  Address: { input: any; output: any };
  /** The `BigInt` scalar type represents non-fractional signed whole numeric values. */
  BigInt: { input: any; output: any };
  /** 0x-prefixed lowercase hex of any byte length. Mixed-case input is accepted and normalized to lowercase. */
  Bytes: { input: any; output: any };
  /** 0x-prefixed lowercase 32-byte hex value. Used for transaction hashes, EAS UIDs, and other 32-byte on-chain identifiers. */
  Bytes32: { input: any; output: any };
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar.This scalar is serialized to a string in ISO 8601 format and parsed from a string in ISO 8601 format. */
  DateTimeISO: { input: any; output: any };
  /** Integer epoch seconds. Wire format is Int; the scalar carries the unit/TZ contract in the type system rather than the field name. */
  UnixSeconds: { input: any; output: any };
};

/**
 * Address-keyed account record — wallet-level identity. Synthesized for
 * addresses that have no User row so every valid address resolves to an
 * Account; persistent rows additionally carry referral metadata.
 */
export type Account = AddressEntity &
  Node & {
    __typename?: 'Account';
    /** Canonical lowercase Ethereum wallet address. */
    address: Scalars['Address']['output'];
    /**
     * Chain this account view is scoped to. Defaults to the deployment's chain
     * when the account was resolved without an explicit `chainId`.
     */
    chainId: Scalars['Int']['output'];
    /**
     * Current wUSDe wallet balance at an optional block (defaults to head).
     * Scoped to the account's `chainId`.
     */
    collateralBalance: CollateralBalance;
    /**
     * Time-bucketed wUSDe wallet balance snapshots, scoped to the account's
     * `chainId`. Step size is `intervalSeconds` (default 7d); returns
     * `first + 1` boundaries back from now.
     */
    collateralBalanceHistory: CollateralBalanceConnection;
    /** When this account first appeared in the database. Synthesized accounts return the unix epoch. */
    createdAt: Scalars['DateTimeISO']['output'];
    id: Scalars['ID']['output'];
    /** This account's ranking on a chosen metric, or `null` when unranked. */
    ranking?: Maybe<Ranking>;
  };

/**
 * Address-keyed account record — wallet-level identity. Synthesized for
 * addresses that have no User row so every valid address resolves to an
 * Account; persistent rows additionally carry referral metadata.
 */
export type AccountCollateralBalanceArgs = {
  atBlock?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * Address-keyed account record — wallet-level identity. Synthesized for
 * addresses that have no User row so every valid address resolves to an
 * Account; persistent rows additionally carry referral metadata.
 */
export type AccountCollateralBalanceHistoryArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  intervalSeconds?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * Address-keyed account record — wallet-level identity. Synthesized for
 * addresses that have no User row so every valid address resolves to an
 * Account; persistent rows additionally carry referral metadata.
 */
export type AccountRankingArgs = {
  filter?: InputMaybe<RankingFilter>;
  metric: LeaderboardMetric;
};

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
 * Filter input for `accounts`. Intentionally narrow — the only meaningful
 * filter dimension for an address-keyed table is substring match against
 * the address itself.
 */
export type AccountFilter = {
  /**
   * Chain to scope returned accounts to. Defaults to the deployment's chain
   * (prod → mainnet, staging → testnet) when omitted.
   */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Substring search against the wallet address (case-insensitive). */
  search?: InputMaybe<Scalars['String']['input']>;
};

export type AccountOrder = {
  direction: OrderDirection;
  field: AccountOrderField;
};

/**
 * Sort dimensions for the `accounts` connection. Intentionally kept as
 * an enum even though it currently carries one value — additional sort
 * columns (e.g. by stat-based ranking) can be added without a breaking
 * change to the `orderBy` arg shape.
 */
export type AccountOrderField = 'CREATED_AT';

/**
 * Relay-shaped connection over the interleaved Prediction + Trade feed.
 * `nodes` is omitted because unions don't share a field set; clients
 * should select through `edges { node { ... } }` with inline fragments.
 */
export type ActivityConnection = {
  __typename?: 'ActivityConnection';
  edges: Array<ActivityEdge>;
  pageInfo: PageInfo;
  /** Sum of matching predictions + trades. Two indexed COUNT(*) queries. */
  totalCount: Scalars['Int']['output'];
};

export type ActivityEdge = {
  __typename?: 'ActivityEdge';
  cursor: Scalars['String']['output'];
  node: ActivityItem;
};

export type ActivityFilter = {
  /** OR across predictor/counterparty (predictions) and buyer/seller (trades). */
  account?: InputMaybe<Scalars['Address']['input']>;
  conditionIds?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  pickConfigId?: InputMaybe<Scalars['Bytes32']['input']>;
  /** Filter by activity timestamp in epoch seconds. */
  timestamp?: InputMaybe<IntRangeFilter>;
  /** Restrict to a subset of activity types. `[]` is a zero-result query. */
  types?: InputMaybe<Array<ActivityType>>;
};

/**
 * A unified activity item — either an escrow `Prediction` or a
 * secondary-market `Trade`. v2 returns the union directly; v1 wrapped
 * each item in an `Activity` envelope, which forced clients to dereference
 * through `.source` to get the entity. Here the union is the wire shape.
 *
 * `Forecast` is intentionally not in the union — see the v1 design doc's
 * "Activity model" section. Forecasts are a separate timeline.
 */
export type ActivityItem = Prediction | Trade;

export type ActivityType = 'PREDICTION' | 'TRADE';

/**
 * Anything addressable on-chain. Both wallet-keyed accounts and
 * contract-controlled vaults expose an `address` and a Node identity, so
 * v2 unifies them under one interface.
 *
 * The interface is intentionally narrow: `id` + `address`. Account-scoped
 * analytics (`ranking`, `collateralBalance`, …) live on `Account`
 * directly rather than the interface, because the vault equivalents are
 * different metrics (a vault's balance is its on-chain `availableAssets` /
 * `deployed`, not a wallet transfer-sum). If a genuinely shared
 * address-scoped field emerges, promote it here then.
 */
export type AddressEntity = {
  address: Scalars['Address']['output'];
  /**
   * Chain this address is scoped to. An on-chain address is only meaningful
   * paired with its chain, so every address entity carries one.
   */
  chainId: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
};

/**
 * Predicted side of a binary condition — `YES` or `NO`. Picks never carry
 * `NON_DECISIVE`; that state belongs on `ConditionOutcome` (the resolved
 * result), not on what the predictor chose.
 */
export type BinaryOutcome = 'NO' | 'YES';

/**
 * A category groups prediction conditions / condition groups for the
 * UI. Backed by the Postgres `Category` table.
 */
export type Category = Node & {
  __typename?: 'Category';
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type CategoryConnection = {
  __typename?: 'CategoryConnection';
  edges: Array<CategoryEdge>;
  nodes: Array<Category>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type CategoryEdge = {
  __typename?: 'CategoryEdge';
  cursor: Scalars['String']['output'];
  node: Category;
};

export type CategoryFilter = {
  /** Case-insensitive substring match against `name`. */
  search?: InputMaybe<Scalars['String']['input']>;
};

/** Open-interest broken down by category. */
export type CategoryOpenInterest = {
  __typename?: 'CategoryOpenInterest';
  category: Category;
  openInterest: Scalars['BigInt']['output'];
};

export type CategoryOrder = {
  direction: OrderDirection;
  field: CategoryOrderField;
};

export type CategoryOrderField = 'CREATED_AT' | 'NAME';

/**
 * Token-redeem event — holder burned position tokens to redeem collateral
 * after settlement. Identified by `(chainId, txHash, logIndex)`.
 */
export type Claim = Node & {
  __typename?: 'Claim';
  chainId: Scalars['Int']['output'];
  collateralPaid: Scalars['BigInt']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  escrow: Scalars['Address']['output'];
  holder: Scalars['Address']['output'];
  id: Scalars['ID']['output'];
  logIndex: Scalars['Int']['output'];
  positionToken: Scalars['Address']['output'];
  predictionId: Scalars['Bytes32']['output'];
  redeemedAt: Scalars['UnixSeconds']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  tokensBurned: Scalars['BigInt']['output'];
  txHash: Scalars['Bytes32']['output'];
};

export type ClaimConnection = {
  __typename?: 'ClaimConnection';
  edges: Array<ClaimEdge>;
  nodes: Array<Claim>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type ClaimEdge = {
  __typename?: 'ClaimEdge';
  cursor: Scalars['String']['output'];
  node: Claim;
};

export type ClaimFilter = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  holder?: InputMaybe<Scalars['Address']['input']>;
  predictionId?: InputMaybe<Scalars['Bytes32']['input']>;
};

export type ClaimOrder = {
  direction: OrderDirection;
  field: ClaimOrderField;
};

/**
 * Sort dimensions for the `claims` connection. Intentionally kept as an
 * enum even though it currently carries one value — additional sort
 * columns (e.g. by `collateralPaid`) can be added without a breaking
 * change to the `orderBy` arg shape.
 */
export type ClaimOrderField = 'REDEEMED_AT';

/**
 * Position-close (burn) event — both sides burn their tokens after the
 * pickConfig settles and receive the proportional payout.
 */
export type Close = Node & {
  __typename?: 'Close';
  burnedAt: Scalars['UnixSeconds']['output'];
  chainId: Scalars['Int']['output'];
  counterpartyHolder: Scalars['Address']['output'];
  counterpartyPayout: Scalars['BigInt']['output'];
  counterpartyTokensBurned: Scalars['BigInt']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  escrow: Scalars['Address']['output'];
  id: Scalars['ID']['output'];
  pickConfigId: Scalars['Bytes32']['output'];
  predictorHolder: Scalars['Address']['output'];
  predictorPayout: Scalars['BigInt']['output'];
  predictorTokensBurned: Scalars['BigInt']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  txHash: Scalars['Bytes32']['output'];
};

export type CloseConnection = {
  __typename?: 'CloseConnection';
  edges: Array<CloseEdge>;
  nodes: Array<Close>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type CloseEdge = {
  __typename?: 'CloseEdge';
  cursor: Scalars['String']['output'];
  node: Close;
};

export type CloseFilter = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Restrict to closes where the address is on either side (predictor or counterparty). */
  participant?: InputMaybe<Scalars['Address']['input']>;
  pickConfigId?: InputMaybe<Scalars['Bytes32']['input']>;
};

export type CloseOrder = {
  direction: OrderDirection;
  field: CloseOrderField;
};

/**
 * Sort dimensions for the `closes` connection. Intentionally kept as an
 * enum even though it currently carries one value — additional sort
 * columns (e.g. by payout magnitude) can be added without a breaking
 * change to the `orderBy` arg shape.
 */
export type CloseOrderField = 'BURNED_AT';

/**
 * Wallet wUSDe collateral balance at a point in time. Not a Node —
 * balances are derived rather than persistent entities.
 *
 * Carries two mutually-exclusive timing axes — exactly one is populated
 * depending on which resolver produced the value:
 *
 * - `blockNumber` is set by `Account.collateralBalance`, which is keyed
 *   by block (echoes the caller's `atBlock` arg, or `null` for the head
 *   balance).
 * - `timestamp` is set by `Account.collateralBalanceHistory`, which
 *   buckets balances by `intervalSeconds`-spaced time boundaries (no
 *   block is pinned per bucket).
 */
export type CollateralBalance = {
  __typename?: 'CollateralBalance';
  address: Scalars['Address']['output'];
  amount: Scalars['BigInt']['output'];
  /**
   * Block the balance was computed against. Set by `collateralBalance`
   * point lookups; `null` for time-bucketed snapshots and for the head
   * balance.
   */
  blockNumber?: Maybe<Scalars['Int']['output']>;
  chainId: Scalars['Int']['output'];
  /**
   * Time the balance was computed at. Set by `collateralBalanceHistory`
   * bucket boundaries; `null` for point lookups.
   */
  timestamp?: Maybe<Scalars['DateTimeISO']['output']>;
};

export type CollateralBalanceConnection = {
  __typename?: 'CollateralBalanceConnection';
  edges: Array<CollateralBalanceEdge>;
  nodes: Array<CollateralBalance>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type CollateralBalanceEdge = {
  __typename?: 'CollateralBalanceEdge';
  cursor: Scalars['String']['output'];
  node: CollateralBalance;
};

/**
 * On-chain ERC-20 Transfer of the collateral token (wUSDe). The
 * `(chainId, transactionHash, logIndex)` tuple is the natural key.
 */
export type CollateralTransfer = Node & {
  __typename?: 'CollateralTransfer';
  blockNumber: Scalars['Int']['output'];
  chainId: Scalars['Int']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  from: Scalars['Address']['output'];
  id: Scalars['ID']['output'];
  logIndex: Scalars['Int']['output'];
  timestamp: Scalars['DateTimeISO']['output'];
  to: Scalars['Address']['output'];
  transactionHash: Scalars['Bytes32']['output'];
  /** Transfer amount in wei (18 decimals). */
  value: Scalars['BigInt']['output'];
};

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
  /** OR across from/to (account is on either side of the transfer). */
  account?: InputMaybe<Scalars['Address']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Exclude transfers to/from configured protocol addresses (vault, escrow). */
  excludeProtocol?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp?: InputMaybe<DateTimeRangeFilter>;
  transactionHash?: InputMaybe<Scalars['Bytes32']['input']>;
};

export type CollateralTransferOrder = {
  direction: OrderDirection;
  field: CollateralTransferOrderField;
};

export type CollateralTransferOrderField = 'BLOCK_NUMBER' | 'TIMESTAMP';

/**
 * On-chain prediction condition. v2 drops v1's legacy boolean flags
 * (`settled`, `resolvedToYes`, `nonDecisive`) in favour of the single
 * nullable `outcome` enum; clients should filter "settled" as
 * `outcome: { isNull: false }` (or `null` means not yet settled).
 *
 * Heavy `similarMarket*` fields collapse into a nested `similarMarket`
 * value type — wire-weight reduction and grouping by source.
 */
export type Condition = Node & {
  __typename?: 'Condition';
  category?: Maybe<Category>;
  chainId: Scalars['Int']['output'];
  conditionGroup?: Maybe<ConditionGroup>;
  /** CTF on-chain condition id, lowercase 0x-hex. */
  conditionId: Scalars['Bytes']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  description: Scalars['String']['output'];
  displayOrder?: Maybe<Scalars['Int']['output']>;
  endTime: Scalars['UnixSeconds']['output'];
  /** YES probability from Polymarket (0.0–1.0), null for non-Polymarket. */
  estimatedPrice?: Maybe<Scalars['Float']['output']>;
  id: Scalars['ID']['output'];
  /** Visibility — false hides this condition from public listing surfaces. */
  isPublic: Scalars['Boolean']['output'];
  /** Cumulative on-chain open interest, wei. */
  openInterest: Scalars['BigInt']['output'];
  optionName?: Maybe<Scalars['String']['output']>;
  /**
   * Resolved state — `null` until the on-chain resolver returns. `YES` /
   * `NO` are decisive resolutions of the binary outcome; `NON_DECISIVE`
   * covers voided / tied / unresolvable settlements.
   */
  outcome?: Maybe<ConditionOutcome>;
  question: Scalars['String']['output'];
  /** Resolver (oracle) contract address that settles this condition. */
  resolver: Scalars['Address']['output'];
  settledAt?: Maybe<Scalars['UnixSeconds']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
  /** Bundled similar-market signal from external sources (Polymarket). */
  similarMarket?: Maybe<SimilarMarket>;
  tags: Array<Scalars['String']['output']>;
};

export type ConditionConnection = {
  __typename?: 'ConditionConnection';
  edges: Array<ConditionEdge>;
  nodes: Array<Condition>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type ConditionEdge = {
  __typename?: 'ConditionEdge';
  cursor: Scalars['String']['output'];
  node: Condition;
};

export type ConditionFilter = {
  categorySlug?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  conditionIds?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  endTime?: InputMaybe<IntRangeFilter>;
  outcome?: InputMaybe<ConditionOutcome>;
  /**
   * Restrict to public (`true`) / hidden (`false`) conditions. Omit for
   * both; listing surfaces default to public-only when this is omitted.
   */
  public?: InputMaybe<Scalars['Boolean']['input']>;
  /** Substring search across `question` / `description`, case-insensitive. */
  search?: InputMaybe<Scalars['String']['input']>;
  /** Restrict to settled (`outcome` non-null) / unsettled (null). */
  settled?: InputMaybe<Scalars['Boolean']['input']>;
  /** Restrict to conditions tagged with at least one of these. */
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

/**
 * A named bundle of related conditions — used by the UI to group e.g.
 * "Who wins the Super Bowl" into one card with per-option conditions
 * underneath. The bundle exposes aggregated counters across its
 * constituent conditions.
 */
export type ConditionGroup = Node & {
  __typename?: 'ConditionGroup';
  category?: Maybe<Category>;
  /** Conditions in this group, ordered by `displayOrder` then `createdAt`. */
  conditions: ConditionConnection;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  /**
   * External market URLs (typically Polymarket links) associated with this
   * group, aggregated across its constituent conditions.
   */
  similarMarkets: Array<Scalars['String']['output']>;
  /** Aggregated counters across this group's public conditions. */
  totals: ConditionGroupTotals;
};

/**
 * A named bundle of related conditions — used by the UI to group e.g.
 * "Who wins the Super Bowl" into one card with per-option conditions
 * underneath. The bundle exposes aggregated counters across its
 * constituent conditions.
 */
export type ConditionGroupConditionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type ConditionGroupConnection = {
  __typename?: 'ConditionGroupConnection';
  edges: Array<ConditionGroupEdge>;
  nodes: Array<ConditionGroup>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type ConditionGroupEdge = {
  __typename?: 'ConditionGroupEdge';
  cursor: Scalars['String']['output'];
  node: ConditionGroup;
};

export type ConditionGroupFilter = {
  categorySlug?: InputMaybe<Scalars['String']['input']>;
  /** Substring search against `name`, case-insensitive. */
  search?: InputMaybe<Scalars['String']['input']>;
};

export type ConditionGroupOrder = {
  direction: OrderDirection;
  field: ConditionGroupOrderField;
};

export type ConditionGroupOrderField =
  | 'CREATED_AT'
  | 'MAX_END_TIME'
  | 'NAME'
  | 'TOTAL_OPEN_INTEREST'
  | 'TOTAL_PREDICTION_COUNT';

/**
 * Pre-computed aggregates over a ConditionGroup's public conditions.
 * Recomputed by the indexer; clients should treat the numbers as
 * near-real-time.
 */
export type ConditionGroupTotals = {
  __typename?: 'ConditionGroupTotals';
  maxCreatedAt?: Maybe<Scalars['UnixSeconds']['output']>;
  maxEndTime?: Maybe<Scalars['UnixSeconds']['output']>;
  publicConditionCount: Scalars['Int']['output'];
  totalOpenInterest: Scalars['BigInt']['output'];
  totalPredictionCount: Scalars['Int']['output'];
  totalSimilarMarketVolume1h: Scalars['Float']['output'];
  totalSimilarMarketVolume4h: Scalars['Float']['output'];
  totalSimilarMarketVolume7d: Scalars['Float']['output'];
  totalSimilarMarketVolume24h: Scalars['Float']['output'];
  totalSimilarMarketVolumeFiltered1h: Scalars['Float']['output'];
  totalSimilarMarketVolumeFiltered4h: Scalars['Float']['output'];
  totalSimilarMarketVolumeFiltered7d: Scalars['Float']['output'];
  totalSimilarMarketVolumeFiltered24h: Scalars['Float']['output'];
};

export type ConditionOrder = {
  direction: OrderDirection;
  field: ConditionOrderField;
};

export type ConditionOrderField =
  | 'CREATED_AT'
  | 'DISPLAY_ORDER'
  | 'END_TIME'
  | 'OPEN_INTEREST';

export type ConditionOutcome = 'NO' | 'NON_DECISIVE' | 'YES';

/** Date/time range filter; both bounds inclusive. */
export type DateTimeRangeFilter = {
  gte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  lte?: InputMaybe<Scalars['DateTimeISO']['input']>;
};

/**
 * Float range filter; all bounds optional. `gt` / `lt` are open-ended,
 * `gte` / `lte` inclusive. Used by `QuestionFilter.estimatedPrice` and
 * `QuestionFilter.similarMarketVolume`.
 */
export type FloatFilter = {
  equals?: InputMaybe<Scalars['Float']['input']>;
  gt?: InputMaybe<Scalars['Float']['input']>;
  gte?: InputMaybe<Scalars['Float']['input']>;
  lt?: InputMaybe<Scalars['Float']['input']>;
  lte?: InputMaybe<Scalars['Float']['input']>;
};

/** Range filter for an integer/UnixSeconds field; both bounds inclusive. */
export type IntRangeFilter = {
  gte?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * Metric an `Ranking` is sorted by.
 *
 * - `ACCURACY`: lifetime time-weighted Brier-style score; ignores the
 *   window filter (the score already weights by recency).
 * - `PNL`: net profit/loss across settled positions over the window.
 * - `VOLUME`: total trade volume over the window.
 * - `ROI`: PnL / volume ratio (`null`-safe).
 */
export type LeaderboardMetric = 'ACCURACY' | 'PNL' | 'ROI' | 'VOLUME';

/**
 * Relay `Node` interface — every persistent entity in v2 implements it.
 * The `id` is an opaque base64url-encoded `(TypeName, domainId)` pair;
 * clients should treat it as a refetch handle and read the entity's named
 * domain identifier (`address`, `predictionId`, `tradeHash`, …) for any
 * display or persistence use.
 */
export type Node = {
  id: Scalars['ID']['output'];
};

/** Order direction shared across every `*Order` input. */
export type OrderDirection = 'ASC' | 'DESC';

/** Standard Relay pagination metadata. */
export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

/**
 * A single condition + outcome pair within a PickConfiguration. Not a Node —
 * picks are only fetched in the context of their parent configuration.
 */
export type Pick = {
  __typename?: 'Pick';
  condition?: Maybe<Condition>;
  conditionId: Scalars['Bytes']['output'];
  predictedOutcome: BinaryOutcome;
  resolver: Scalars['Address']['output'];
};

/**
 * A pick configuration bundles the per-condition picks that make up a
 * single prediction. The `pickConfigId` is a deterministic 0x-hash of
 * the constituent picks — same picks produce the same pickConfigId.
 */
export type PickConfiguration = Node & {
  __typename?: 'PickConfiguration';
  chainId: Scalars['Int']['output'];
  claimedCounterpartyCollateral: Scalars['BigInt']['output'];
  claimedPredictorCollateral: Scalars['BigInt']['output'];
  counterpartyToken?: Maybe<Scalars['Address']['output']>;
  endsAt?: Maybe<Scalars['UnixSeconds']['output']>;
  /**
   * PredictionMarketEscrow contract this pick configuration lives on —
   * the core escrow that handles mint / settle / redeem / burn. Lowercase.
   */
  escrow: Scalars['Address']['output'];
  id: Scalars['ID']['output'];
  pickConfigId: Scalars['Bytes32']['output'];
  picks: Array<Pick>;
  predictorToken?: Maybe<Scalars['Address']['output']>;
  /**
   * Settlement timestamp; `null` until the underlying conditions resolve
   * and this configuration is closed out.
   */
  resolvedAt?: Maybe<Scalars['UnixSeconds']['output']>;
  result?: Maybe<SettlementResult>;
  totalCounterpartyCollateral: Scalars['BigInt']['output'];
  totalPredictorCollateral: Scalars['BigInt']['output'];
};

export type PickConfigurationConnection = {
  __typename?: 'PickConfigurationConnection';
  edges: Array<PickConfigurationEdge>;
  nodes: Array<PickConfiguration>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type PickConfigurationEdge = {
  __typename?: 'PickConfigurationEdge';
  cursor: Scalars['String']['output'];
  node: PickConfiguration;
};

export type PickConfigurationFilter = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  resolved?: InputMaybe<Scalars['Boolean']['input']>;
  results?: InputMaybe<Array<SettlementResult>>;
  /** Either predictor or counterparty token matches one of these (case-insensitive). */
  tokens?: InputMaybe<Array<Scalars['Address']['input']>>;
};

export type PickConfigurationOrder = {
  direction: OrderDirection;
  field: PickConfigurationOrderField;
};

export type PickConfigurationOrderField =
  | 'CREATED_AT'
  | 'ENDS_AT'
  | 'RESOLVED_AT';

/**
 * Position-token balance held by `holder` on a specific pick configuration.
 * The synthesized sell-event row format from v1 doesn't carry forward; v2
 * returns raw balance rows. Cost-basis / realized-PnL surfaces will land
 * behind opt-in fields in a later phase.
 */
export type Position = Node & {
  __typename?: 'Position';
  /** Number of position tokens still held, wei (18 decimals). */
  balance: Scalars['BigInt']['output'];
  chainId: Scalars['Int']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  holder: Scalars['Address']['output'];
  id: Scalars['ID']['output'];
  pickConfig?: Maybe<PickConfiguration>;
  pickConfigId: Scalars['Bytes32']['output'];
  /**
   * Which side of the pick configuration this position is on. Derived
   * from `token` against `pickConfig.predictorToken` / `counterpartyToken`,
   * exposed directly so clients don't have to reconstruct the comparison.
   */
  side: Side;
  /** ERC-20 position token contract. */
  token: Scalars['Address']['output'];
  updatedAt: Scalars['DateTimeISO']['output'];
};

export type PositionConnection = {
  __typename?: 'PositionConnection';
  edges: Array<PositionEdge>;
  nodes: Array<Position>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type PositionEdge = {
  __typename?: 'PositionEdge';
  cursor: Scalars['String']['output'];
  node: Position;
};

export type PositionFilter = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Restrict to positions on any of these conditions (via the pickConfig join). */
  conditionIds?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  /** Filter by pickConfig end epoch seconds. */
  endsAt?: InputMaybe<IntRangeFilter>;
  holder?: InputMaybe<Scalars['Address']['input']>;
  pickConfigId?: InputMaybe<Scalars['Bytes32']['input']>;
  /** Restrict to positions whose pickConfig settled with any of these results. */
  results?: InputMaybe<Array<SettlementResult>>;
  /** Restrict to positions where the pickConfig is settled / unsettled. */
  settled?: InputMaybe<Scalars['Boolean']['input']>;
};

export type PositionOrder = {
  direction: OrderDirection;
  field: PositionOrderField;
};

export type PositionOrderField = 'CREATED_AT' | 'UPDATED_AT';

/**
 * Escrow-based prediction — a two-sided bet between a predictor and a
 * counterparty, settled by the pick configuration's underlying condition(s).
 * Identified by its on-chain `predictionId`.
 */
export type Prediction = Node & {
  __typename?: 'Prediction';
  chainId: Scalars['Int']['output'];
  collateralDeposited?: Maybe<Scalars['BigInt']['output']>;
  collateralDepositedAt?: Maybe<Scalars['UnixSeconds']['output']>;
  counterparty: Scalars['Address']['output'];
  counterpartyClaimable?: Maybe<Scalars['BigInt']['output']>;
  counterpartyCollateral: Scalars['BigInt']['output'];
  counterpartyToken?: Maybe<Scalars['Address']['output']>;
  createTxHash: Scalars['Bytes32']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  escrow: Scalars['Address']['output'];
  id: Scalars['ID']['output'];
  pickConfig?: Maybe<PickConfiguration>;
  predictionId: Scalars['Bytes32']['output'];
  predictor: Scalars['Address']['output'];
  predictorClaimable?: Maybe<Scalars['BigInt']['output']>;
  predictorCollateral: Scalars['BigInt']['output'];
  /**
   * Null when the prediction has no pickConfiguration (e.g. an RPC-error row)
   * or the underlying token has not been minted yet — sourced from the
   * nullable `Picks.predictorToken` / `counterpartyToken` columns.
   */
  predictorToken?: Maybe<Scalars['Address']['output']>;
  refCode?: Maybe<Scalars['String']['output']>;
  result?: Maybe<SettlementResult>;
  settleTxHash?: Maybe<Scalars['Bytes32']['output']>;
  /** Settlement timestamp; `null` until the prediction settles on-chain. */
  settledAt?: Maybe<Scalars['UnixSeconds']['output']>;
};

export type PredictionConnection = {
  __typename?: 'PredictionConnection';
  edges: Array<PredictionEdge>;
  nodes: Array<Prediction>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type PredictionEdge = {
  __typename?: 'PredictionEdge';
  cursor: Scalars['String']['output'];
  node: Prediction;
};

export type PredictionFilter = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /** Restrict to predictions on any of these conditions (via the pickConfig join). */
  conditionIds?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  counterparty?: InputMaybe<Scalars['Address']['input']>;
  /** Filter by pickConfig end epoch seconds. */
  endsAt?: InputMaybe<IntRangeFilter>;
  /**
   * Restrict to predictions where the address is predictor or counterparty.
   * Convenience filter; mutually exclusive with `predictor` / `counterparty`.
   */
  participant?: InputMaybe<Scalars['Address']['input']>;
  pickConfigId?: InputMaybe<Scalars['Bytes32']['input']>;
  predictionId?: InputMaybe<Scalars['Bytes32']['input']>;
  predictor?: InputMaybe<Scalars['Address']['input']>;
  results?: InputMaybe<Array<SettlementResult>>;
  settled?: InputMaybe<Scalars['Boolean']['input']>;
};

export type PredictionOrder = {
  direction: OrderDirection;
  field: PredictionOrderField;
};

export type PredictionOrderField = 'CREATED_AT' | 'SETTLED_AT';

/**
 * Top-level protocol surface — aggregated cross-account metrics and the
 * breakdowns the dashboard renders. Lookup is via `protocol { … }`; no
 * arguments needed.
 */
export type Protocol = {
  __typename?: 'Protocol';
  openInterestByCategory: Array<CategoryOpenInterest>;
  /**
   * Open interest distributed across fixed time-to-resolution windows
   * (next 1d / 7d / 30d / 60d / 90d / 180d / beyond). The buckets are
   * server-defined today; the field is shaped to accept a future
   * `boundaries: [Int!]` argument (seconds-from-now cut points) without a
   * breaking change — each bucket already carries explicit
   * `minSecondsFromNow` / `maxSecondsFromNow`, so clients won't need to
   * re-key when granularity becomes configurable.
   */
  openInterestByTimeToResolution: Array<TimeToResolutionBucket>;
  /**
   * Live, current protocol-wide stats — a single `ProtocolStat` with
   * `timestamp = now`. Volume / trade-count / open-interest reflect the
   * in-progress period and `totalValueLocked` is read across every configured
   * vault at query time. Use `statsHistory` for the recorded daily series.
   */
  stats: ProtocolStat;
  /**
   * Recorded protocol-wide snapshots, oldest first — backs the analytics
   * volume / TVL / open-interest time-series charts. (Previously named
   * `stats`; renamed to `statsHistory` so `stats` can be the live singular,
   * matching the `Vault` access pattern.)
   */
  statsHistory: ProtocolStatConnection;
};

/**
 * Top-level protocol surface — aggregated cross-account metrics and the
 * breakdowns the dashboard renders. Lookup is via `protocol { … }`; no
 * arguments needed.
 */
export type ProtocolStatsHistoryArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ProtocolStatFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * Protocol-wide snapshot of cumulative + period metrics. v2 drops the
 * vault-scoped fields v1 carried (`vault*`, `periodPnL`); per-vault stat
 * breakdowns live on `Vault.stats` / `Vault.statsHistory`. Protocol-level
 * TVL is carried here as `totalValueLocked` (read live on `Protocol.stats`,
 * aggregated per snapshot on `Protocol.statsHistory`).
 */
export type ProtocolStat = {
  __typename?: 'ProtocolStat';
  cumulativeTradeCount: Scalars['Int']['output'];
  cumulativeVolume: Scalars['BigInt']['output'];
  escrowBalance: Scalars['BigInt']['output'];
  openInterest: Scalars['BigInt']['output'];
  periodTradeCount: Scalars['Int']['output'];
  periodVolume: Scalars['BigInt']['output'];
  timestamp: Scalars['UnixSeconds']['output'];
  /**
   * Total value locked across the protocol, wei: escrow collateral (which
   * includes settled-but-unclaimed winnings) plus undeployed available assets
   * summed across **every** configured vault family — not just the default
   * one (the v1 series under-counted by scoping to a single family). Computed
   * by read-time aggregation, so history and the live `Protocol.stats` agree.
   */
  totalValueLocked: Scalars['BigInt']['output'];
};

export type ProtocolStatConnection = {
  __typename?: 'ProtocolStatConnection';
  edges: Array<ProtocolStatEdge>;
  nodes: Array<ProtocolStat>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type ProtocolStatEdge = {
  __typename?: 'ProtocolStatEdge';
  cursor: Scalars['String']['output'];
  node: ProtocolStat;
};

export type ProtocolStatFilter = {
  /** Snapshot timestamp window in epoch seconds (inclusive). */
  timestamp?: InputMaybe<IntRangeFilter>;
};

export type Query = {
  __typename?: 'Query';
  /**
   * Look up a single account by canonical wallet address. Always returns
   * an Account — addresses with no User row are synthesized (`createdAt`
   * is the unix epoch, referral fields are null). `chainId` defaults to the
   * deployment's chain (prod → mainnet, staging → testnet); pass it
   * explicitly to scope the account to a non-default chain.
   */
  account: Account;
  /**
   * Relay-shaped connection over accounts (User-table rows). Single-address
   * lookups should use `account(address:)`, which synthesizes for missing
   * rows; `accounts` is for enumeration / search and only returns persisted
   * rows. Defaults to `CREATED_AT DESC`.
   */
  accounts: AccountConnection;
  /** Interleaved Prediction + Trade activity feed, sorted by timestamp DESC. */
  activity: ActivityConnection;
  /** Relay-shaped connection over categories. Defaults to `NAME ASC`. */
  categories: CategoryConnection;
  /** Look up a single category by its integer primary key. */
  category?: Maybe<Category>;
  /** Look up a single claim by its globalId-encoded row id. */
  claim?: Maybe<Claim>;
  /**
   * Relay-shaped connection over claim (redemption) records. Defaults to
   * `REDEEMED_AT DESC`.
   */
  claims: ClaimConnection;
  /** Look up a single position-close record by its globalId-encoded row id. */
  close?: Maybe<Close>;
  /**
   * Relay-shaped connection over position close (burn) records. Defaults
   * to `BURNED_AT DESC`.
   */
  closes: CloseConnection;
  /** Look up a single collateral transfer by its globalId-encoded row id. */
  collateralTransfer?: Maybe<CollateralTransfer>;
  /**
   * Relay-shaped connection over collateral-token transfers. Defaults to
   * `TIMESTAMP DESC`.
   */
  collateralTransfers: CollateralTransferConnection;
  /** Look up a single condition by its on-chain CTF condition id. */
  condition?: Maybe<Condition>;
  /** Look up a single condition group by its integer primary key. */
  conditionGroup?: Maybe<ConditionGroup>;
  /**
   * Relay-shaped connection over condition groups. Defaults to
   * `MAX_END_TIME ASC` (next-to-resolve first).
   */
  conditionGroups: ConditionGroupConnection;
  /**
   * Relay-shaped connection over conditions. Defaults to `END_TIME ASC`
   * (next-to-resolve first), but `CREATED_AT DESC` and `OPEN_INTEREST
   * DESC` are common alternates.
   */
  conditions: ConditionConnection;
  /**
   * Account leaderboard ranked by `metric`. PnL / Volume / ROI accept a
   * `filter.timestamp` window; Accuracy is lifetime-aggregated and ignores
   * the window.
   */
  leaderboard: RankingConnection;
  /**
   * Relay refetch by opaque global id. Returns `null` when the id is
   * malformed, the type is not registered against the v2 registry, or
   * the underlying entity has been deleted.
   */
  node?: Maybe<Node>;
  /**
   * Batched form of `node(id:)`. Preserves input order; each element is
   * resolved independently and may be null.
   */
  nodes: Array<Maybe<Node>>;
  /** Look up a single pick configuration by its on-chain `pickConfigId`. */
  pickConfiguration?: Maybe<PickConfiguration>;
  /**
   * Relay-shaped connection over pick configurations. Defaults to
   * `CREATED_AT DESC`.
   */
  pickConfigurations: PickConfigurationConnection;
  /** Look up a single position by its globalId-encoded row id. */
  position?: Maybe<Position>;
  /**
   * Relay-shaped connection over token positions. Defaults to
   * `UPDATED_AT DESC`.
   */
  positions: PositionConnection;
  /** Look up a single prediction by its on-chain `predictionId`. */
  prediction?: Maybe<Prediction>;
  /**
   * Relay-shaped connection over escrow predictions. Defaults to
   * `CREATED_AT DESC`.
   */
  predictions: PredictionConnection;
  /** The protocol singleton — aggregate dashboards over all accounts/conditions. */
  protocol: Protocol;
  /**
   * Interleaved Condition + ConditionGroup feed — the markets list on
   * most public surfaces. Sort by `END_TIME` (next-to-resolve first) or
   * one of the windowed-volume / open-interest columns. `totalCount` is
   * omitted on this connection (SQL UNION can't COUNT cheaply); rely on
   * `pageInfo.hasNextPage`.
   */
  questions: QuestionConnection;
  /**
   * Tags attached to public conditions, backed by the `popular_tag`
   * materialization (refreshed lazily by reads when older than ~1h).
   * Default order is `CONDITION_COUNT DESC`
   * with `first: 20` — the canonical "popular tags" feed. Sort by `NAME`
   * for an alphabetical browse.
   */
  tags: TagConnection;
  /** Look up a single trade by its on-chain `tradeHash`. */
  trade?: Maybe<Trade>;
  /**
   * Relay-shaped connection over secondary-market trades. Defaults to
   * `EXECUTED_AT DESC`.
   */
  trades: TradeConnection;
  /**
   * Look up a single vault by its canonical lowercase contract address.
   * Falls back to matching against any legacy alias the vault has been
   * deployed at. `chainId` defaults to the SDK's default chain; pass it
   * explicitly when querying a non-default chain.
   */
  vault?: Maybe<Vault>;
  /**
   * Relay-shaped connection over the configured vault set. Vaults are a
   * small statically configured catalog, so paging matters less than
   * filterability; the connection exists for completeness and symmetry
   * with the other root entities.
   */
  vaults: VaultConnection;
};

export type QueryAccountArgs = {
  address: Scalars['Address']['input'];
  chainId?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryAccountsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<AccountFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<AccountOrder>;
};

export type QueryActivityArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ActivityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryCategoriesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<CategoryFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<CategoryOrder>;
};

export type QueryCategoryArgs = {
  id: Scalars['ID']['input'];
};

export type QueryClaimArgs = {
  id: Scalars['ID']['input'];
};

export type QueryClaimsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ClaimFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ClaimOrder>;
};

export type QueryCloseArgs = {
  id: Scalars['ID']['input'];
};

export type QueryClosesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<CloseFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<CloseOrder>;
};

export type QueryCollateralTransferArgs = {
  id: Scalars['ID']['input'];
};

export type QueryCollateralTransfersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<CollateralTransferFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<CollateralTransferOrder>;
};

export type QueryConditionArgs = {
  conditionId: Scalars['Bytes']['input'];
};

export type QueryConditionGroupArgs = {
  id: Scalars['ID']['input'];
};

export type QueryConditionGroupsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ConditionGroupFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ConditionGroupOrder>;
};

export type QueryConditionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ConditionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ConditionOrder>;
};

export type QueryLeaderboardArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<RankingFilter>;
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
  pickConfigId: Scalars['Bytes32']['input'];
};

export type QueryPickConfigurationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PickConfigurationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PickConfigurationOrder>;
};

export type QueryPositionArgs = {
  id: Scalars['ID']['input'];
};

export type QueryPositionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PositionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PositionOrder>;
};

export type QueryPredictionArgs = {
  predictionId: Scalars['Bytes32']['input'];
};

export type QueryPredictionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PredictionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PredictionOrder>;
};

export type QueryQuestionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<QuestionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<QuestionOrder>;
};

export type QueryTagsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<TagOrder>;
};

export type QueryTradeArgs = {
  tradeHash: Scalars['Bytes32']['input'];
};

export type QueryTradesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<TradeFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<TradeOrder>;
};

export type QueryVaultArgs = {
  address: Scalars['Address']['input'];
  chainId?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryVaultsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<VaultFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<VaultOrder>;
};

/**
 * Relay-shaped connection over the interleaved Condition + ConditionGroup
 * feed. `nodes` is omitted because unions don't share a field set —
 * clients select through `edges { node { ... } }` with inline fragments.
 *
 * `totalCount` is intentionally omitted on this surface — the underlying
 * SQL UNION can't produce a single COUNT cheaply; `hasNextPage` from
 * `pageInfo` is the right end-of-feed signal.
 */
export type QuestionConnection = {
  __typename?: 'QuestionConnection';
  edges: Array<QuestionEdge>;
  pageInfo: PageInfo;
};

export type QuestionEdge = {
  __typename?: 'QuestionEdge';
  cursor: Scalars['String']['output'];
  node: QuestionItem;
};

/**
 * Filter input for `questions`. All fields optional. Where an aggregate
 * column drives the sort (e.g. `OPEN_INTEREST`,
 * `SIMILAR_MARKET_VOLUME_*`), the same filter dimension is exposed here.
 */
export type QuestionFilter = {
  /** Restrict to questions whose category slug is in this set. */
  categorySlugs?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Restrict to a single chain. Defaults to DEFAULT_CHAIN_ID when a resolver filter is present. */
  chainId?: InputMaybe<Scalars['Int']['input']>;
  /**
   * Range over resolution time (epoch seconds). For Conditions the
   * endpoint is `endTime`; for ConditionGroups it's `maxEndTime` across
   * the group's conditions. Inclusive on both bounds.
   */
  endsAt?: InputMaybe<IntRangeFilter>;
  /** Range over the Polymarket-derived `estimatedPrice` 0–1 probability. */
  estimatedPrice?: InputMaybe<FloatFilter>;
  /** Resolution-status filter; defaults to ALL when omitted. */
  resolutionStatus?: InputMaybe<ResolutionStatus>;
  /**
   * Match any of these resolver (oracle) contracts that own the underlying
   * condition.
   */
  resolvers?: InputMaybe<Array<Scalars['Address']['input']>>;
  /** Free-text search across the wrapped condition/group title and description (case-insensitive). */
  search?: InputMaybe<Scalars['String']['input']>;
  /** Range over similar-market volume (USD). Window selected by `similarMarketVolumeWindow`. */
  similarMarketVolume?: InputMaybe<FloatFilter>;
  /**
   * Volume window the `similarMarketVolume` filter looks at. All-time
   * when omitted. Sorting by `SIMILAR_MARKET_VOLUME_*` carries its own
   * window in the sort enum and ignores this field.
   */
  similarMarketVolumeWindow?: InputMaybe<VolumeWindow>;
  /** Restrict to questions tagged with this value. */
  tag?: InputMaybe<Scalars['String']['input']>;
};

/**
 * A question is either a single `Condition` or a `ConditionGroup`. v2
 * returns the discriminated entity directly through this union — the
 * v1 `Question` envelope (with `source`, `title`, `description`, etc.)
 * collapses away here in favour of reading those fields off the concrete
 * type via inline fragments.
 */
export type QuestionItem = Condition | ConditionGroup;

export type QuestionOrder = {
  direction: OrderDirection;
  field: QuestionOrderField;
};

/**
 * Sort fields for the `questions` connection. `OPEN_INTEREST` and the
 * windowed `SIMILAR_MARKET_VOLUME_*` variants are supported because the
 * union runner sorts via raw SQL with a numeric cast — the narrower
 * `conditions` / `conditionGroups` connections fall back to offset for
 * these columns. `_FILTERED` variants exclude pre-resolution /
 * off-platform volume.
 *
 * The volume window is packed into the enum rather than collapsed into a
 * single `SIMILAR_MARKET_VOLUME` + separate window arg. The two designs
 * were considered (see findings doc); the packed form preserves
 * independent sort and filter windows (`QuestionFilter.similarMarketVolumeWindow`
 * is a separate axis) without adding a contextual field to `QuestionOrder`,
 * which would be the only `*Order` input in v2 carrying more than
 * `{ field, direction }`.
 */
export type QuestionOrderField =
  | 'CREATED_AT'
  | 'END_TIME'
  | 'OPEN_INTEREST'
  | 'PREDICTION_COUNT'
  | 'SIMILAR_MARKET_VOLUME_1H'
  | 'SIMILAR_MARKET_VOLUME_1H_FILTERED'
  | 'SIMILAR_MARKET_VOLUME_4H'
  | 'SIMILAR_MARKET_VOLUME_4H_FILTERED'
  | 'SIMILAR_MARKET_VOLUME_7D'
  | 'SIMILAR_MARKET_VOLUME_7D_FILTERED'
  | 'SIMILAR_MARKET_VOLUME_24H'
  | 'SIMILAR_MARKET_VOLUME_24H_FILTERED';

/**
 * One row of an account ranking — the account, its rank (1-indexed), and
 * the metric value in its native type. Exactly one of the four value
 * fields is populated, matching the `metric` the ranking was queried with
 * (`RankingConnection.metric`, or the `metric:` arg on `Account.ranking`);
 * the rest are null.
 */
export type Ranking = {
  __typename?: 'Ranking';
  account: Account;
  /** Lifetime Brier-derived accuracy score (0–1). Populated for `ACCURACY`. */
  accuracy?: Maybe<Scalars['Float']['output']>;
  /** Net profit/loss in wUSDe wei (signed). Populated for `PNL`. */
  pnl?: Maybe<Scalars['BigInt']['output']>;
  rank: Scalars['Int']['output'];
  /** PnL / volume ratio. Populated for `ROI`. */
  roi?: Maybe<Scalars['Float']['output']>;
  /** Total trade volume in wUSDe wei. Populated for `VOLUME`. */
  volume?: Maybe<Scalars['BigInt']['output']>;
};

export type RankingConnection = {
  __typename?: 'RankingConnection';
  edges: Array<RankingEdge>;
  metric: LeaderboardMetric;
  nodes: Array<Ranking>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type RankingEdge = {
  __typename?: 'RankingEdge';
  cursor: Scalars['String']['output'];
  node: Ranking;
};

export type RankingFilter = {
  /** Window selector in epoch seconds (inclusive). Ignored for ACCURACY. */
  timestamp?: InputMaybe<IntRangeFilter>;
};

/**
 * Resolution-status filter for the interleaved questions feed.
 * - `ALL` (default): no filter.
 * - `RESOLVED` / `UNRESOLVED`: any decisive outcome / pending.
 * - `RESOLVED_YES` / `RESOLVED_NO`: specific decisive outcomes.
 */
export type ResolutionStatus =
  | 'ALL'
  | 'RESOLVED'
  | 'RESOLVED_NO'
  | 'RESOLVED_YES'
  | 'UNRESOLVED';

/**
 * Terminal settlement state. `null` on the parent field means not yet
 * settled; `NON_DECISIVE` is a settled-but-no-winner outcome (void, tie,
 * oracle abstain).
 */
export type SettlementResult =
  | 'COUNTERPARTY_WINS'
  | 'NON_DECISIVE'
  | 'PREDICTOR_WINS';

/**
 * Which side of a pick configuration an entity is on. Mirrors the
 * `predictor` / `counterparty` vocabulary used on `Prediction` and
 * `PickConfiguration`.
 */
export type Side = 'COUNTERPARTY' | 'PREDICTOR';

/**
 * Bundled similar-market signal for a Condition. All `volume*` fields are
 * USD trading volume on the linked external market over the listed window;
 * `volumeFiltered*` exclude pre-resolution / off-platform volume. Image
 * and `markets` carry the source-side metadata used to render an
 * attribution chip in the UI.
 */
export type SimilarMarket = {
  __typename?: 'SimilarMarket';
  image?: Maybe<Scalars['String']['output']>;
  /**
   * External market URLs (typically Polymarket links) the volume signal was
   * aggregated from. Used by the UI to render an attribution chip.
   */
  markets: Array<Scalars['String']['output']>;
  volume: Scalars['Float']['output'];
  volume1h: Scalars['Float']['output'];
  volume4h: Scalars['Float']['output'];
  volume7d: Scalars['Float']['output'];
  volume24h: Scalars['Float']['output'];
  volumeFiltered1h: Scalars['Float']['output'];
  volumeFiltered4h: Scalars['Float']['output'];
  volumeFiltered7d: Scalars['Float']['output'];
  volumeFiltered24h: Scalars['Float']['output'];
};

/**
 * A tag attached to public conditions. Not a Node — the `name` itself is
 * the natural key, so refetch by globalId would be redundant.
 *
 * `conditionCount` is the denormalized usage count from the `popular_tag`
 * materialization, which reads refresh when it goes stale (~hourly);
 * treat it as near-real-time.
 */
export type Tag = {
  __typename?: 'Tag';
  conditionCount: Scalars['Int']['output'];
  name: Scalars['String']['output'];
};

export type TagConnection = {
  __typename?: 'TagConnection';
  edges: Array<TagEdge>;
  nodes: Array<Tag>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type TagEdge = {
  __typename?: 'TagEdge';
  cursor: Scalars['String']['output'];
  node: Tag;
};

export type TagOrder = {
  direction: OrderDirection;
  field: TagOrderField;
};

export type TagOrderField = 'CONDITION_COUNT' | 'NAME';

/**
 * Open-interest bucketed by time-to-resolution. Each unsettled prediction
 * is bucketed by the latest endTime among its constituent conditions; the
 * window is `(minSecondsFromNow, maxSecondsFromNow]` — left-exclusive,
 * right-inclusive, matching the SQL `delta <= bound` ladder. Buckets come back
 * in ascending order — sort by `maxSecondsFromNow` (nulls last) to be explicit.
 */
export type TimeToResolutionBucket = {
  __typename?: 'TimeToResolutionBucket';
  /**
   * Inclusive upper bound, in seconds from now. `null` on the open-ended
   * tail bucket.
   */
  maxSecondsFromNow?: Maybe<Scalars['Int']['output']>;
  /**
   * Exclusive lower bound, in seconds from now. `null` on the first bucket,
   * which also absorbs overdue (past-endTime, not-yet-resolved) predictions.
   */
  minSecondsFromNow?: Maybe<Scalars['Int']['output']>;
  openInterest: Scalars['BigInt']['output'];
  predictionCount: Scalars['Int']['output'];
};

/**
 * Secondary-market trade — a peer-to-peer transfer of position tokens.
 * Identified by its canonical on-chain `tradeHash`. v2 wire shape uses
 * typed scalars throughout (`Address`, `Bytes32`, `BigInt`) where v1
 * returned plain `String!`.
 */
export type Trade = Node & {
  __typename?: 'Trade';
  blockNumber: Scalars['Int']['output'];
  buyer: Scalars['Address']['output'];
  chainId: Scalars['Int']['output'];
  /** Collateral asset paid by the buyer. */
  collateral: Scalars['Address']['output'];
  executedAt: Scalars['UnixSeconds']['output'];
  id: Scalars['ID']['output'];
  /**
   * The pick configuration this trade's position `token` belongs to, or
   * null if the token isn't part of any known configuration. Resolved by
   * matching `token` against the configuration's predictor / counterparty
   * tokens.
   */
  pickConfig?: Maybe<PickConfiguration>;
  /** Total collateral paid by the buyer, wei. `price / tokenAmount` is the per-share price. */
  price: Scalars['BigInt']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  seller: Scalars['Address']['output'];
  /**
   * Which side of the pick configuration was traded — `PREDICTOR` if
   * `token` is the predictor token, `COUNTERPARTY` otherwise. Null when
   * `pickConfig` is null.
   */
  side?: Maybe<Side>;
  /** Position token being transferred. */
  token: Scalars['Address']['output'];
  /** Quantity of position tokens transferred, wei (18-dec). */
  tokenAmount: Scalars['BigInt']['output'];
  tradeHash: Scalars['Bytes32']['output'];
  txHash: Scalars['Bytes32']['output'];
};

export type TradeConnection = {
  __typename?: 'TradeConnection';
  edges: Array<TradeEdge>;
  nodes: Array<Trade>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type TradeEdge = {
  __typename?: 'TradeEdge';
  cursor: Scalars['String']['output'];
  node: Trade;
};

export type TradeFilter = {
  buyer?: InputMaybe<Scalars['Address']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  executedAt?: InputMaybe<IntRangeFilter>;
  /**
   * Restrict to trades where the address is on either side (buyer or seller).
   * Convenience filter for per-account activity feeds; mutually exclusive
   * with `buyer` / `seller` (passing both wins toward `participant`).
   */
  participant?: InputMaybe<Scalars['Address']['input']>;
  seller?: InputMaybe<Scalars['Address']['input']>;
  tokens?: InputMaybe<Array<Scalars['Address']['input']>>;
  tradeHash?: InputMaybe<Scalars['Bytes32']['input']>;
};

export type TradeOrder = {
  direction: OrderDirection;
  field: TradeOrderField;
};

export type TradeOrderField = 'BLOCK_NUMBER' | 'EXECUTED_AT';

/**
 * A statically configured protocol vault. Vaults are address-keyed like
 * accounts but contract-controlled, with their own deployment kind and
 * historical legacy aliases. The small total count means the connection
 * exists primarily for enumeration; per-vault refetch goes through
 * `vault(address:)`.
 */
export type Vault = Node & {
  __typename?: 'Vault';
  /**
   * The vault's on-chain identity as an account: address, chainId, live wallet
   * balance, ranking, and balance history. A vault *is* an account (by
   * composition); its address and chain live here rather than being duplicated
   * onto `Vault`.
   */
  account: Account;
  id: Scalars['ID']['output'];
  /**
   * Latest economic snapshot for this vault (balance, deployed/undeployed
   * collateral, realized PnL, flows). `null` until the stats writer has
   * recorded a first snapshot for the vault.
   *
   * DEFERRED — not built yet: this is currently the latest *recorded*
   * snapshot. The target is a live, non-null chain read computed at query time
   * (reusing v1's live-candle helpers in `sdl/resolvers/queries/analytics.ts`)
   * so `/vaults` can drop its own `usePassiveLiquidityVault` RPC reads. Big
   * lift: needs per-request chain reads, not just a snapshot lookup.
   */
  stats?: Maybe<VaultStat>;
  /**
   * Time-series of this vault's economic snapshots, newest first. Backs the
   * vault dashboard's TVL / PnL charts. Defaults to `TIMESTAMP DESC`.
   */
  statsHistory: VaultStatConnection;
};

/**
 * A statically configured protocol vault. Vaults are address-keyed like
 * accounts but contract-controlled, with their own deployment kind and
 * historical legacy aliases. The small total count means the connection
 * exists primarily for enumeration; per-vault refetch goes through
 * `vault(address:)`.
 */
export type VaultStatsHistoryArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<VaultStatFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
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
 * Filter for the `vaults` connection. Address filter exists primarily for
 * enumeration patterns that want to scope to a known vault — single-row
 * lookup should use `vault(address:)` instead.
 */
export type VaultFilter = {
  /** Restrict to a single vault address (case-insensitive). Matches both the current primary and any legacy alias. */
  address?: InputMaybe<Scalars['Address']['input']>;
  /** Restrict to a single chain. Defaults to the SDK's default chain when omitted. */
  chainId?: InputMaybe<Scalars['Int']['input']>;
};

export type VaultOrder = {
  direction: OrderDirection;
  field: VaultOrderField;
};

/**
 * Sort dimensions for the `vaults` connection. Intentionally kept as an
 * enum even though it currently carries one value — symmetric with the
 * other plural-query `*OrderField` enums and reserves an additive seam
 * for future sort columns.
 */
export type VaultOrderField = 'ADDRESS';

/**
 * One economic snapshot of a vault, taken by the stats writer. Amounts are
 * wUSDe wei. Field names drop the leaked `vault*` Prisma column prefixes
 * (redundant under `Vault`) and use the schema's collateral vocabulary.
 */
export type VaultStat = {
  __typename?: 'VaultStat';
  /**
   * Raw wUSDe held by the vault contract (`balanceOf`), excludes deployed
   * funds.
   */
  balance: Scalars['BigInt']['output'];
  collateralLost: Scalars['BigInt']['output'];
  collateralWon: Scalars['BigInt']['output'];
  /**
   * Cumulative trading PnL the vault dashboard plots: settlement PnL, plus
   * wUSDe earmarked from resolved-but-unredeemed wins, plus net secondary-
   * market flow (`realizedPnl + unredeemedClaim + secondarySold −
   * secondaryBought`). This is the *same* numerator the account behind the
   * vault carries; the vault presents it as a return on total assets
   * (`balance + deployedCollateral`), where the account measures it against
   * deployed capital. The unredeemed term cancels the transient phantom loss
   * between a position resolving and its redeem being indexed.
   */
  cumulativePnl: Scalars['BigInt']['output'];
  /** Collateral deployed into escrow (backing open positions). */
  deployedCollateral: Scalars['BigInt']['output'];
  deposits: Scalars['BigInt']['output'];
  positionsLost: Scalars['Int']['output'];
  positionsWon: Scalars['Int']['output'];
  /** Settlement PnL: gross payouts to the vault minus its primary-creation collateral. */
  realizedPnl: Scalars['BigInt']['output'];
  timestamp: Scalars['UnixSeconds']['output'];
  /** Liquid collateral not yet deployed to escrow. `balance + deployed` is AUM. */
  undeployedCollateral: Scalars['BigInt']['output'];
  withdrawals: Scalars['BigInt']['output'];
};

export type VaultStatConnection = {
  __typename?: 'VaultStatConnection';
  edges: Array<VaultStatEdge>;
  nodes: Array<VaultStat>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type VaultStatEdge = {
  __typename?: 'VaultStatEdge';
  cursor: Scalars['String']['output'];
  node: VaultStat;
};

export type VaultStatFilter = {
  /** Snapshot timestamp window in epoch seconds (inclusive). */
  timestamp?: InputMaybe<IntRangeFilter>;
};

/**
 * Which similar-market-volume window the filter / sort looks at.
 * `*_FILTERED` variants exclude pre-resolution / off-platform volume.
 */
export type VolumeWindow =
  | 'FOUR_HOURS'
  | 'FOUR_HOURS_FILTERED'
  | 'ONE_HOUR'
  | 'ONE_HOUR_FILTERED'
  | 'SEVEN_DAYS'
  | 'SEVEN_DAYS_FILTERED'
  | 'TWENTY_FOUR_HOURS'
  | 'TWENTY_FOUR_HOURS_FILTERED';
