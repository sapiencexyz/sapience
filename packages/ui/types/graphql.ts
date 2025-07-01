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
  /** The `BigInt` scalar type represents non-fractional signed whole numeric values. */
  BigInt: { input: any; output: any; }
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar.This scalar is serialized to a string in ISO 8601 format and parsed from a string in ISO 8601 format. */
  DateTimeISO: { input: any; output: any; }
  /** GraphQL Scalar representing the Prisma.Decimal type, based on Decimal.js library. */
  Decimal: { input: any; output: any; }
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: { input: any; output: any; }
};

export type AggregateCache_Candle = {
  __typename?: 'AggregateCache_candle';
  _avg?: Maybe<Cache_CandleAvgAggregate>;
  _count?: Maybe<Cache_CandleCountAggregate>;
  _max?: Maybe<Cache_CandleMaxAggregate>;
  _min?: Maybe<Cache_CandleMinAggregate>;
  _sum?: Maybe<Cache_CandleSumAggregate>;
};

export type AggregateCategory = {
  __typename?: 'AggregateCategory';
  _avg?: Maybe<CategoryAvgAggregate>;
  _count?: Maybe<CategoryCountAggregate>;
  _max?: Maybe<CategoryMaxAggregate>;
  _min?: Maybe<CategoryMinAggregate>;
  _sum?: Maybe<CategorySumAggregate>;
};

export type AggregateCrypto_Prices = {
  __typename?: 'AggregateCrypto_prices';
  _avg?: Maybe<Crypto_PricesAvgAggregate>;
  _count?: Maybe<Crypto_PricesCountAggregate>;
  _max?: Maybe<Crypto_PricesMaxAggregate>;
  _min?: Maybe<Crypto_PricesMinAggregate>;
  _sum?: Maybe<Crypto_PricesSumAggregate>;
};

export type AggregateEvent = {
  __typename?: 'AggregateEvent';
  _avg?: Maybe<EventAvgAggregate>;
  _count?: Maybe<EventCountAggregate>;
  _max?: Maybe<EventMaxAggregate>;
  _min?: Maybe<EventMinAggregate>;
  _sum?: Maybe<EventSumAggregate>;
};

export type AggregateMarket = {
  __typename?: 'AggregateMarket';
  _avg?: Maybe<MarketAvgAggregate>;
  _count?: Maybe<MarketCountAggregate>;
  _max?: Maybe<MarketMaxAggregate>;
  _min?: Maybe<MarketMinAggregate>;
  _sum?: Maybe<MarketSumAggregate>;
};

export type AggregateMarket_Group = {
  __typename?: 'AggregateMarket_group';
  _avg?: Maybe<Market_GroupAvgAggregate>;
  _count?: Maybe<Market_GroupCountAggregate>;
  _max?: Maybe<Market_GroupMaxAggregate>;
  _min?: Maybe<Market_GroupMinAggregate>;
  _sum?: Maybe<Market_GroupSumAggregate>;
};

export type AggregatePosition = {
  __typename?: 'AggregatePosition';
  _avg?: Maybe<PositionAvgAggregate>;
  _count?: Maybe<PositionCountAggregate>;
  _max?: Maybe<PositionMaxAggregate>;
  _min?: Maybe<PositionMinAggregate>;
  _sum?: Maybe<PositionSumAggregate>;
};

export type AggregateRender_Job = {
  __typename?: 'AggregateRender_job';
  _avg?: Maybe<Render_JobAvgAggregate>;
  _count?: Maybe<Render_JobCountAggregate>;
  _max?: Maybe<Render_JobMaxAggregate>;
  _min?: Maybe<Render_JobMinAggregate>;
  _sum?: Maybe<Render_JobSumAggregate>;
};

export type AggregateResource = {
  __typename?: 'AggregateResource';
  _avg?: Maybe<ResourceAvgAggregate>;
  _count?: Maybe<ResourceCountAggregate>;
  _max?: Maybe<ResourceMaxAggregate>;
  _min?: Maybe<ResourceMinAggregate>;
  _sum?: Maybe<ResourceSumAggregate>;
};

export type AggregateResource_Price = {
  __typename?: 'AggregateResource_price';
  _avg?: Maybe<Resource_PriceAvgAggregate>;
  _count?: Maybe<Resource_PriceCountAggregate>;
  _max?: Maybe<Resource_PriceMaxAggregate>;
  _min?: Maybe<Resource_PriceMinAggregate>;
  _sum?: Maybe<Resource_PriceSumAggregate>;
};

export type AggregateTransaction = {
  __typename?: 'AggregateTransaction';
  _avg?: Maybe<TransactionAvgAggregate>;
  _count?: Maybe<TransactionCountAggregate>;
  _max?: Maybe<TransactionMaxAggregate>;
  _min?: Maybe<TransactionMinAggregate>;
  _sum?: Maybe<TransactionSumAggregate>;
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

export type BigIntWithAggregatesFilter = {
  _avg?: InputMaybe<NestedFloatFilter>;
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedBigIntFilter>;
  _min?: InputMaybe<NestedBigIntFilter>;
  _sum?: InputMaybe<NestedBigIntFilter>;
  equals?: InputMaybe<Scalars['BigInt']['input']>;
  gt?: InputMaybe<Scalars['BigInt']['input']>;
  gte?: InputMaybe<Scalars['BigInt']['input']>;
  in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  lt?: InputMaybe<Scalars['BigInt']['input']>;
  lte?: InputMaybe<Scalars['BigInt']['input']>;
  not?: InputMaybe<NestedBigIntWithAggregatesFilter>;
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

export type BoolNullableWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntNullableFilter>;
  _max?: InputMaybe<NestedBoolNullableFilter>;
  _min?: InputMaybe<NestedBoolNullableFilter>;
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolNullableWithAggregatesFilter>;
};

export type BoolWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedBoolFilter>;
  _min?: InputMaybe<NestedBoolFilter>;
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolWithAggregatesFilter>;
};

export type Cache_Candle = {
  __typename?: 'Cache_candle';
  address?: Maybe<Scalars['String']['output']>;
  candleType: Scalars['String']['output'];
  chainId?: Maybe<Scalars['Int']['output']>;
  close: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  endTimestamp: Scalars['Int']['output'];
  high: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  interval: Scalars['Int']['output'];
  lastUpdatedTimestamp: Scalars['Int']['output'];
  low: Scalars['String']['output'];
  marketId?: Maybe<Scalars['Int']['output']>;
  marketIdx?: Maybe<Scalars['Int']['output']>;
  open: Scalars['String']['output'];
  resourceSlug?: Maybe<Scalars['String']['output']>;
  sumFeePaid?: Maybe<Scalars['Decimal']['output']>;
  sumUsed?: Maybe<Scalars['Decimal']['output']>;
  timestamp: Scalars['Int']['output'];
  trailingAvgTime?: Maybe<Scalars['Int']['output']>;
  trailingStartTimestamp?: Maybe<Scalars['Int']['output']>;
};

export type Cache_CandleAvgAggregate = {
  __typename?: 'Cache_candleAvgAggregate';
  chainId?: Maybe<Scalars['Float']['output']>;
  endTimestamp?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  interval?: Maybe<Scalars['Float']['output']>;
  lastUpdatedTimestamp?: Maybe<Scalars['Float']['output']>;
  marketId?: Maybe<Scalars['Float']['output']>;
  marketIdx?: Maybe<Scalars['Float']['output']>;
  sumFeePaid?: Maybe<Scalars['Decimal']['output']>;
  sumUsed?: Maybe<Scalars['Decimal']['output']>;
  timestamp?: Maybe<Scalars['Float']['output']>;
  trailingAvgTime?: Maybe<Scalars['Float']['output']>;
  trailingStartTimestamp?: Maybe<Scalars['Float']['output']>;
};

export type Cache_CandleCountAggregate = {
  __typename?: 'Cache_candleCountAggregate';
  _all: Scalars['Int']['output'];
  address: Scalars['Int']['output'];
  candleType: Scalars['Int']['output'];
  chainId: Scalars['Int']['output'];
  close: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  endTimestamp: Scalars['Int']['output'];
  high: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  interval: Scalars['Int']['output'];
  lastUpdatedTimestamp: Scalars['Int']['output'];
  low: Scalars['Int']['output'];
  marketId: Scalars['Int']['output'];
  marketIdx: Scalars['Int']['output'];
  open: Scalars['Int']['output'];
  resourceSlug: Scalars['Int']['output'];
  sumFeePaid: Scalars['Int']['output'];
  sumUsed: Scalars['Int']['output'];
  timestamp: Scalars['Int']['output'];
  trailingAvgTime: Scalars['Int']['output'];
  trailingStartTimestamp: Scalars['Int']['output'];
};

export type Cache_CandleMaxAggregate = {
  __typename?: 'Cache_candleMaxAggregate';
  address?: Maybe<Scalars['String']['output']>;
  candleType?: Maybe<Scalars['String']['output']>;
  chainId?: Maybe<Scalars['Int']['output']>;
  close?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  high?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  interval?: Maybe<Scalars['Int']['output']>;
  lastUpdatedTimestamp?: Maybe<Scalars['Int']['output']>;
  low?: Maybe<Scalars['String']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  marketIdx?: Maybe<Scalars['Int']['output']>;
  open?: Maybe<Scalars['String']['output']>;
  resourceSlug?: Maybe<Scalars['String']['output']>;
  sumFeePaid?: Maybe<Scalars['Decimal']['output']>;
  sumUsed?: Maybe<Scalars['Decimal']['output']>;
  timestamp?: Maybe<Scalars['Int']['output']>;
  trailingAvgTime?: Maybe<Scalars['Int']['output']>;
  trailingStartTimestamp?: Maybe<Scalars['Int']['output']>;
};

export type Cache_CandleMinAggregate = {
  __typename?: 'Cache_candleMinAggregate';
  address?: Maybe<Scalars['String']['output']>;
  candleType?: Maybe<Scalars['String']['output']>;
  chainId?: Maybe<Scalars['Int']['output']>;
  close?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  high?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  interval?: Maybe<Scalars['Int']['output']>;
  lastUpdatedTimestamp?: Maybe<Scalars['Int']['output']>;
  low?: Maybe<Scalars['String']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  marketIdx?: Maybe<Scalars['Int']['output']>;
  open?: Maybe<Scalars['String']['output']>;
  resourceSlug?: Maybe<Scalars['String']['output']>;
  sumFeePaid?: Maybe<Scalars['Decimal']['output']>;
  sumUsed?: Maybe<Scalars['Decimal']['output']>;
  timestamp?: Maybe<Scalars['Int']['output']>;
  trailingAvgTime?: Maybe<Scalars['Int']['output']>;
  trailingStartTimestamp?: Maybe<Scalars['Int']['output']>;
};

export type Cache_CandleOrderByWithRelationInput = {
  address?: InputMaybe<SortOrderInput>;
  candleType?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrderInput>;
  close?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrder>;
  high?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  interval?: InputMaybe<SortOrder>;
  lastUpdatedTimestamp?: InputMaybe<SortOrder>;
  low?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrderInput>;
  marketIdx?: InputMaybe<SortOrderInput>;
  open?: InputMaybe<SortOrder>;
  resourceSlug?: InputMaybe<SortOrderInput>;
  sumFeePaid?: InputMaybe<SortOrderInput>;
  sumUsed?: InputMaybe<SortOrderInput>;
  timestamp?: InputMaybe<SortOrder>;
  trailingAvgTime?: InputMaybe<SortOrderInput>;
  trailingStartTimestamp?: InputMaybe<SortOrderInput>;
};

export type Cache_CandleScalarFieldEnum =
  | 'address'
  | 'candleType'
  | 'chainId'
  | 'close'
  | 'createdAt'
  | 'endTimestamp'
  | 'high'
  | 'id'
  | 'interval'
  | 'lastUpdatedTimestamp'
  | 'low'
  | 'marketId'
  | 'marketIdx'
  | 'open'
  | 'resourceSlug'
  | 'sumFeePaid'
  | 'sumUsed'
  | 'timestamp'
  | 'trailingAvgTime'
  | 'trailingStartTimestamp';

export type Cache_CandleSumAggregate = {
  __typename?: 'Cache_candleSumAggregate';
  chainId?: Maybe<Scalars['Int']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  interval?: Maybe<Scalars['Int']['output']>;
  lastUpdatedTimestamp?: Maybe<Scalars['Int']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  marketIdx?: Maybe<Scalars['Int']['output']>;
  sumFeePaid?: Maybe<Scalars['Decimal']['output']>;
  sumUsed?: Maybe<Scalars['Decimal']['output']>;
  timestamp?: Maybe<Scalars['Int']['output']>;
  trailingAvgTime?: Maybe<Scalars['Int']['output']>;
  trailingStartTimestamp?: Maybe<Scalars['Int']['output']>;
};

export type Cache_CandleWhereInput = {
  AND?: InputMaybe<Array<Cache_CandleWhereInput>>;
  NOT?: InputMaybe<Array<Cache_CandleWhereInput>>;
  OR?: InputMaybe<Array<Cache_CandleWhereInput>>;
  address?: InputMaybe<StringNullableFilter>;
  candleType?: InputMaybe<StringFilter>;
  chainId?: InputMaybe<IntNullableFilter>;
  close?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  endTimestamp?: InputMaybe<IntFilter>;
  high?: InputMaybe<StringFilter>;
  id?: InputMaybe<IntFilter>;
  interval?: InputMaybe<IntFilter>;
  lastUpdatedTimestamp?: InputMaybe<IntFilter>;
  low?: InputMaybe<StringFilter>;
  marketId?: InputMaybe<IntNullableFilter>;
  marketIdx?: InputMaybe<IntNullableFilter>;
  open?: InputMaybe<StringFilter>;
  resourceSlug?: InputMaybe<StringNullableFilter>;
  sumFeePaid?: InputMaybe<DecimalNullableFilter>;
  sumUsed?: InputMaybe<DecimalNullableFilter>;
  timestamp?: InputMaybe<IntFilter>;
  trailingAvgTime?: InputMaybe<IntNullableFilter>;
  trailingStartTimestamp?: InputMaybe<IntNullableFilter>;
};

export type Cache_CandleWhereUniqueInput = {
  AND?: InputMaybe<Array<Cache_CandleWhereInput>>;
  NOT?: InputMaybe<Array<Cache_CandleWhereInput>>;
  OR?: InputMaybe<Array<Cache_CandleWhereInput>>;
  address?: InputMaybe<StringNullableFilter>;
  candleType?: InputMaybe<StringFilter>;
  candleType_interval_timestamp_resourceSlug_marketIdx_trailingAvgTime?: InputMaybe<Cache_CandleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput>;
  chainId?: InputMaybe<IntNullableFilter>;
  close?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  endTimestamp?: InputMaybe<IntFilter>;
  high?: InputMaybe<StringFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  interval?: InputMaybe<IntFilter>;
  lastUpdatedTimestamp?: InputMaybe<IntFilter>;
  low?: InputMaybe<StringFilter>;
  marketId?: InputMaybe<IntNullableFilter>;
  marketIdx?: InputMaybe<IntNullableFilter>;
  open?: InputMaybe<StringFilter>;
  resourceSlug?: InputMaybe<StringNullableFilter>;
  sumFeePaid?: InputMaybe<DecimalNullableFilter>;
  sumUsed?: InputMaybe<DecimalNullableFilter>;
  timestamp?: InputMaybe<IntFilter>;
  trailingAvgTime?: InputMaybe<IntNullableFilter>;
  trailingStartTimestamp?: InputMaybe<IntNullableFilter>;
};

export type CandleAndTimestampType = {
  __typename?: 'CandleAndTimestampType';
  data: Array<CandleType>;
  lastUpdateTimestamp: Scalars['Int']['output'];
};

export type CandleType = {
  __typename?: 'CandleType';
  close: Scalars['String']['output'];
  high: Scalars['String']['output'];
  low: Scalars['String']['output'];
  open: Scalars['String']['output'];
  timestamp: Scalars['Int']['output'];
};

export type Category = {
  __typename?: 'Category';
  _count?: Maybe<CategoryCount>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type CategoryAvgAggregate = {
  __typename?: 'CategoryAvgAggregate';
  id?: Maybe<Scalars['Float']['output']>;
};

export type CategoryAvgOrderByAggregateInput = {
  id?: InputMaybe<SortOrder>;
};

export type CategoryCount = {
  __typename?: 'CategoryCount';
  market_group: Scalars['Int']['output'];
  resource: Scalars['Int']['output'];
};


export type CategoryCountMarket_GroupArgs = {
  where?: InputMaybe<Market_GroupWhereInput>;
};


export type CategoryCountResourceArgs = {
  where?: InputMaybe<ResourceWhereInput>;
};

export type CategoryCountAggregate = {
  __typename?: 'CategoryCountAggregate';
  _all: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['Int']['output'];
  slug: Scalars['Int']['output'];
};

export type CategoryCountOrderByAggregateInput = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
};

export type CategoryGroupBy = {
  __typename?: 'CategoryGroupBy';
  _avg?: Maybe<CategoryAvgAggregate>;
  _count?: Maybe<CategoryCountAggregate>;
  _max?: Maybe<CategoryMaxAggregate>;
  _min?: Maybe<CategoryMinAggregate>;
  _sum?: Maybe<CategorySumAggregate>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type CategoryMaxAggregate = {
  __typename?: 'CategoryMaxAggregate';
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  slug?: Maybe<Scalars['String']['output']>;
};

export type CategoryMaxOrderByAggregateInput = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
};

export type CategoryMinAggregate = {
  __typename?: 'CategoryMinAggregate';
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  slug?: Maybe<Scalars['String']['output']>;
};

export type CategoryMinOrderByAggregateInput = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
};

export type CategoryNullableRelationFilter = {
  is?: InputMaybe<CategoryWhereInput>;
  isNot?: InputMaybe<CategoryWhereInput>;
};

export type CategoryOrderByWithAggregationInput = {
  _avg?: InputMaybe<CategoryAvgOrderByAggregateInput>;
  _count?: InputMaybe<CategoryCountOrderByAggregateInput>;
  _max?: InputMaybe<CategoryMaxOrderByAggregateInput>;
  _min?: InputMaybe<CategoryMinOrderByAggregateInput>;
  _sum?: InputMaybe<CategorySumOrderByAggregateInput>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
};

export type CategoryOrderByWithRelationInput = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  market_group?: InputMaybe<Market_GroupOrderByRelationAggregateInput>;
  name?: InputMaybe<SortOrder>;
  resource?: InputMaybe<ResourceOrderByRelationAggregateInput>;
  slug?: InputMaybe<SortOrder>;
};

export type CategoryScalarFieldEnum =
  | 'createdAt'
  | 'id'
  | 'name'
  | 'slug';

export type CategoryScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<CategoryScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<CategoryScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<CategoryScalarWhereWithAggregatesInput>>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  name?: InputMaybe<StringWithAggregatesFilter>;
  slug?: InputMaybe<StringWithAggregatesFilter>;
};

export type CategorySumAggregate = {
  __typename?: 'CategorySumAggregate';
  id?: Maybe<Scalars['Int']['output']>;
};

export type CategorySumOrderByAggregateInput = {
  id?: InputMaybe<SortOrder>;
};

export type CategoryWhereInput = {
  AND?: InputMaybe<Array<CategoryWhereInput>>;
  NOT?: InputMaybe<Array<CategoryWhereInput>>;
  OR?: InputMaybe<Array<CategoryWhereInput>>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  market_group?: InputMaybe<Market_GroupListRelationFilter>;
  name?: InputMaybe<StringFilter>;
  resource?: InputMaybe<ResourceListRelationFilter>;
  slug?: InputMaybe<StringFilter>;
};

export type CategoryWhereUniqueInput = {
  AND?: InputMaybe<Array<CategoryWhereInput>>;
  NOT?: InputMaybe<Array<CategoryWhereInput>>;
  OR?: InputMaybe<Array<CategoryWhereInput>>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  market_group?: InputMaybe<Market_GroupListRelationFilter>;
  name?: InputMaybe<Scalars['String']['input']>;
  resource?: InputMaybe<ResourceListRelationFilter>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type Collateral_TransferNullableRelationFilter = {
  is?: InputMaybe<Collateral_TransferWhereInput>;
  isNot?: InputMaybe<Collateral_TransferWhereInput>;
};

export type Collateral_TransferOrderByWithRelationInput = {
  collateral?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  owner?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  transaction?: InputMaybe<TransactionOrderByWithRelationInput>;
  transactionHash?: InputMaybe<SortOrder>;
};

export type Collateral_TransferWhereInput = {
  AND?: InputMaybe<Array<Collateral_TransferWhereInput>>;
  NOT?: InputMaybe<Array<Collateral_TransferWhereInput>>;
  OR?: InputMaybe<Array<Collateral_TransferWhereInput>>;
  collateral?: InputMaybe<DecimalFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  owner?: InputMaybe<StringFilter>;
  timestamp?: InputMaybe<IntFilter>;
  transaction?: InputMaybe<TransactionNullableRelationFilter>;
  transactionHash?: InputMaybe<StringFilter>;
};

export type Crypto_Prices = {
  __typename?: 'Crypto_prices';
  id: Scalars['Int']['output'];
  price: Scalars['Float']['output'];
  ticker?: Maybe<Scalars['String']['output']>;
  timestamp: Scalars['DateTimeISO']['output'];
};

export type Crypto_PricesAvgAggregate = {
  __typename?: 'Crypto_pricesAvgAggregate';
  id?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

export type Crypto_PricesCountAggregate = {
  __typename?: 'Crypto_pricesCountAggregate';
  _all: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  price: Scalars['Int']['output'];
  ticker: Scalars['Int']['output'];
  timestamp: Scalars['Int']['output'];
};

export type Crypto_PricesMaxAggregate = {
  __typename?: 'Crypto_pricesMaxAggregate';
  id?: Maybe<Scalars['Int']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
  ticker?: Maybe<Scalars['String']['output']>;
  timestamp?: Maybe<Scalars['DateTimeISO']['output']>;
};

export type Crypto_PricesMinAggregate = {
  __typename?: 'Crypto_pricesMinAggregate';
  id?: Maybe<Scalars['Int']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
  ticker?: Maybe<Scalars['String']['output']>;
  timestamp?: Maybe<Scalars['DateTimeISO']['output']>;
};

export type Crypto_PricesOrderByWithRelationInput = {
  id?: InputMaybe<SortOrder>;
  price?: InputMaybe<SortOrder>;
  ticker?: InputMaybe<SortOrderInput>;
  timestamp?: InputMaybe<SortOrder>;
};

export type Crypto_PricesScalarFieldEnum =
  | 'id'
  | 'price'
  | 'ticker'
  | 'timestamp';

export type Crypto_PricesSumAggregate = {
  __typename?: 'Crypto_pricesSumAggregate';
  id?: Maybe<Scalars['Int']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

export type Crypto_PricesWhereInput = {
  AND?: InputMaybe<Array<Crypto_PricesWhereInput>>;
  NOT?: InputMaybe<Array<Crypto_PricesWhereInput>>;
  OR?: InputMaybe<Array<Crypto_PricesWhereInput>>;
  id?: InputMaybe<IntFilter>;
  price?: InputMaybe<FloatFilter>;
  ticker?: InputMaybe<StringNullableFilter>;
  timestamp?: InputMaybe<DateTimeFilter>;
};

export type Crypto_PricesWhereUniqueInput = {
  AND?: InputMaybe<Array<Crypto_PricesWhereInput>>;
  NOT?: InputMaybe<Array<Crypto_PricesWhereInput>>;
  OR?: InputMaybe<Array<Crypto_PricesWhereInput>>;
  id?: InputMaybe<Scalars['Int']['input']>;
  price?: InputMaybe<FloatFilter>;
  ticker?: InputMaybe<StringNullableFilter>;
  timestamp?: InputMaybe<DateTimeFilter>;
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

export type DateTimeWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedDateTimeFilter>;
  _min?: InputMaybe<NestedDateTimeFilter>;
  equals?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  in?: InputMaybe<Array<Scalars['DateTimeISO']['input']>>;
  lt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  lte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  not?: InputMaybe<NestedDateTimeWithAggregatesFilter>;
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

export type DecimalNullableFilter = {
  equals?: InputMaybe<Scalars['Decimal']['input']>;
  gt?: InputMaybe<Scalars['Decimal']['input']>;
  gte?: InputMaybe<Scalars['Decimal']['input']>;
  in?: InputMaybe<Array<Scalars['Decimal']['input']>>;
  lt?: InputMaybe<Scalars['Decimal']['input']>;
  lte?: InputMaybe<Scalars['Decimal']['input']>;
  not?: InputMaybe<NestedDecimalNullableFilter>;
  notIn?: InputMaybe<Array<Scalars['Decimal']['input']>>;
};

export type DecimalNullableWithAggregatesFilter = {
  _avg?: InputMaybe<NestedDecimalNullableFilter>;
  _count?: InputMaybe<NestedIntNullableFilter>;
  _max?: InputMaybe<NestedDecimalNullableFilter>;
  _min?: InputMaybe<NestedDecimalNullableFilter>;
  _sum?: InputMaybe<NestedDecimalNullableFilter>;
  equals?: InputMaybe<Scalars['Decimal']['input']>;
  gt?: InputMaybe<Scalars['Decimal']['input']>;
  gte?: InputMaybe<Scalars['Decimal']['input']>;
  in?: InputMaybe<Array<Scalars['Decimal']['input']>>;
  lt?: InputMaybe<Scalars['Decimal']['input']>;
  lte?: InputMaybe<Scalars['Decimal']['input']>;
  not?: InputMaybe<NestedDecimalNullableWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['Decimal']['input']>>;
};

export type DecimalWithAggregatesFilter = {
  _avg?: InputMaybe<NestedDecimalFilter>;
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedDecimalFilter>;
  _min?: InputMaybe<NestedDecimalFilter>;
  _sum?: InputMaybe<NestedDecimalFilter>;
  equals?: InputMaybe<Scalars['Decimal']['input']>;
  gt?: InputMaybe<Scalars['Decimal']['input']>;
  gte?: InputMaybe<Scalars['Decimal']['input']>;
  in?: InputMaybe<Array<Scalars['Decimal']['input']>>;
  lt?: InputMaybe<Scalars['Decimal']['input']>;
  lte?: InputMaybe<Scalars['Decimal']['input']>;
  not?: InputMaybe<NestedDecimalWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['Decimal']['input']>>;
};

export type Enumtransaction_Type_EnumFilter = {
  equals?: InputMaybe<Transaction_Type_Enum>;
  in?: InputMaybe<Array<Transaction_Type_Enum>>;
  not?: InputMaybe<NestedEnumtransaction_Type_EnumFilter>;
  notIn?: InputMaybe<Array<Transaction_Type_Enum>>;
};

export type Enumtransaction_Type_EnumWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedEnumtransaction_Type_EnumFilter>;
  _min?: InputMaybe<NestedEnumtransaction_Type_EnumFilter>;
  equals?: InputMaybe<Transaction_Type_Enum>;
  in?: InputMaybe<Array<Transaction_Type_Enum>>;
  not?: InputMaybe<NestedEnumtransaction_Type_EnumWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Transaction_Type_Enum>>;
};

export type Event = {
  __typename?: 'Event';
  blockNumber: Scalars['Int']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  logData: Scalars['JSON']['output'];
  logIndex: Scalars['Int']['output'];
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  timestamp: Scalars['BigInt']['output'];
  transactionHash: Scalars['String']['output'];
};

export type EventAvgAggregate = {
  __typename?: 'EventAvgAggregate';
  blockNumber?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  logIndex?: Maybe<Scalars['Float']['output']>;
  marketGroupId?: Maybe<Scalars['Float']['output']>;
  timestamp?: Maybe<Scalars['Float']['output']>;
};

export type EventAvgOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  logIndex?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
};

export type EventCountAggregate = {
  __typename?: 'EventCountAggregate';
  _all: Scalars['Int']['output'];
  blockNumber: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  logData: Scalars['Int']['output'];
  logIndex: Scalars['Int']['output'];
  marketGroupId: Scalars['Int']['output'];
  timestamp: Scalars['Int']['output'];
  transactionHash: Scalars['Int']['output'];
};

export type EventCountOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  logData?: InputMaybe<SortOrder>;
  logIndex?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  transactionHash?: InputMaybe<SortOrder>;
};

export type EventGroupBy = {
  __typename?: 'EventGroupBy';
  _avg?: Maybe<EventAvgAggregate>;
  _count?: Maybe<EventCountAggregate>;
  _max?: Maybe<EventMaxAggregate>;
  _min?: Maybe<EventMinAggregate>;
  _sum?: Maybe<EventSumAggregate>;
  blockNumber: Scalars['Int']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  logData: Scalars['JSON']['output'];
  logIndex: Scalars['Int']['output'];
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  timestamp: Scalars['BigInt']['output'];
  transactionHash: Scalars['String']['output'];
};

export type EventListRelationFilter = {
  every?: InputMaybe<EventWhereInput>;
  none?: InputMaybe<EventWhereInput>;
  some?: InputMaybe<EventWhereInput>;
};

export type EventMaxAggregate = {
  __typename?: 'EventMaxAggregate';
  blockNumber?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  logIndex?: Maybe<Scalars['Int']['output']>;
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['BigInt']['output']>;
  transactionHash?: Maybe<Scalars['String']['output']>;
};

export type EventMaxOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  logIndex?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  transactionHash?: InputMaybe<SortOrder>;
};

export type EventMinAggregate = {
  __typename?: 'EventMinAggregate';
  blockNumber?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  logIndex?: Maybe<Scalars['Int']['output']>;
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['BigInt']['output']>;
  transactionHash?: Maybe<Scalars['String']['output']>;
};

export type EventMinOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  logIndex?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  transactionHash?: InputMaybe<SortOrder>;
};

export type EventNullableRelationFilter = {
  is?: InputMaybe<EventWhereInput>;
  isNot?: InputMaybe<EventWhereInput>;
};

export type EventOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type EventOrderByWithAggregationInput = {
  _avg?: InputMaybe<EventAvgOrderByAggregateInput>;
  _count?: InputMaybe<EventCountOrderByAggregateInput>;
  _max?: InputMaybe<EventMaxOrderByAggregateInput>;
  _min?: InputMaybe<EventMinOrderByAggregateInput>;
  _sum?: InputMaybe<EventSumOrderByAggregateInput>;
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  logData?: InputMaybe<SortOrder>;
  logIndex?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrderInput>;
  timestamp?: InputMaybe<SortOrder>;
  transactionHash?: InputMaybe<SortOrder>;
};

export type EventOrderByWithRelationInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  logData?: InputMaybe<SortOrder>;
  logIndex?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrderInput>;
  market_group?: InputMaybe<Market_GroupOrderByWithRelationInput>;
  timestamp?: InputMaybe<SortOrder>;
  transaction?: InputMaybe<TransactionOrderByWithRelationInput>;
  transactionHash?: InputMaybe<SortOrder>;
};

export type EventScalarFieldEnum =
  | 'blockNumber'
  | 'createdAt'
  | 'id'
  | 'logData'
  | 'logIndex'
  | 'marketGroupId'
  | 'timestamp'
  | 'transactionHash';

export type EventScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<EventScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<EventScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<EventScalarWhereWithAggregatesInput>>;
  blockNumber?: InputMaybe<IntWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  logData?: InputMaybe<JsonWithAggregatesFilter>;
  logIndex?: InputMaybe<IntWithAggregatesFilter>;
  marketGroupId?: InputMaybe<IntNullableWithAggregatesFilter>;
  timestamp?: InputMaybe<BigIntWithAggregatesFilter>;
  transactionHash?: InputMaybe<StringWithAggregatesFilter>;
};

export type EventSumAggregate = {
  __typename?: 'EventSumAggregate';
  blockNumber?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  logIndex?: Maybe<Scalars['Int']['output']>;
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['BigInt']['output']>;
};

export type EventSumOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  logIndex?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
};

export type EventWhereInput = {
  AND?: InputMaybe<Array<EventWhereInput>>;
  NOT?: InputMaybe<Array<EventWhereInput>>;
  OR?: InputMaybe<Array<EventWhereInput>>;
  blockNumber?: InputMaybe<IntFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  logData?: InputMaybe<JsonFilter>;
  logIndex?: InputMaybe<IntFilter>;
  marketGroupId?: InputMaybe<IntNullableFilter>;
  market_group?: InputMaybe<Market_GroupNullableRelationFilter>;
  timestamp?: InputMaybe<BigIntFilter>;
  transaction?: InputMaybe<TransactionNullableRelationFilter>;
  transactionHash?: InputMaybe<StringFilter>;
};

export type EventWhereUniqueInput = {
  AND?: InputMaybe<Array<EventWhereInput>>;
  NOT?: InputMaybe<Array<EventWhereInput>>;
  OR?: InputMaybe<Array<EventWhereInput>>;
  blockNumber?: InputMaybe<IntFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  logData?: InputMaybe<JsonFilter>;
  logIndex?: InputMaybe<IntFilter>;
  marketGroupId?: InputMaybe<IntNullableFilter>;
  market_group?: InputMaybe<Market_GroupNullableRelationFilter>;
  timestamp?: InputMaybe<BigIntFilter>;
  transaction?: InputMaybe<TransactionNullableRelationFilter>;
  transactionHash?: InputMaybe<StringFilter>;
  transactionHash_marketGroupId_blockNumber_logIndex?: InputMaybe<EventTransactionHashMarketGroupIdBlockNumberLogIndexCompoundUniqueInput>;
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

export type IntNullableWithAggregatesFilter = {
  _avg?: InputMaybe<NestedFloatNullableFilter>;
  _count?: InputMaybe<NestedIntNullableFilter>;
  _max?: InputMaybe<NestedIntNullableFilter>;
  _min?: InputMaybe<NestedIntNullableFilter>;
  _sum?: InputMaybe<NestedIntNullableFilter>;
  equals?: InputMaybe<Scalars['Int']['input']>;
  gt?: InputMaybe<Scalars['Int']['input']>;
  gte?: InputMaybe<Scalars['Int']['input']>;
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lt?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
  not?: InputMaybe<NestedIntNullableWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type IntWithAggregatesFilter = {
  _avg?: InputMaybe<NestedFloatFilter>;
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedIntFilter>;
  _min?: InputMaybe<NestedIntFilter>;
  _sum?: InputMaybe<NestedIntFilter>;
  equals?: InputMaybe<Scalars['Int']['input']>;
  gt?: InputMaybe<Scalars['Int']['input']>;
  gte?: InputMaybe<Scalars['Int']['input']>;
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lt?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
  not?: InputMaybe<NestedIntWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type JsonFilter = {
  array_contains?: InputMaybe<Scalars['JSON']['input']>;
  array_ends_with?: InputMaybe<Scalars['JSON']['input']>;
  array_starts_with?: InputMaybe<Scalars['JSON']['input']>;
  equals?: InputMaybe<Scalars['JSON']['input']>;
  gt?: InputMaybe<Scalars['JSON']['input']>;
  gte?: InputMaybe<Scalars['JSON']['input']>;
  lt?: InputMaybe<Scalars['JSON']['input']>;
  lte?: InputMaybe<Scalars['JSON']['input']>;
  not?: InputMaybe<Scalars['JSON']['input']>;
  path?: InputMaybe<Array<Scalars['String']['input']>>;
  string_contains?: InputMaybe<Scalars['String']['input']>;
  string_ends_with?: InputMaybe<Scalars['String']['input']>;
  string_starts_with?: InputMaybe<Scalars['String']['input']>;
};

export type JsonWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedJsonFilter>;
  _min?: InputMaybe<NestedJsonFilter>;
  array_contains?: InputMaybe<Scalars['JSON']['input']>;
  array_ends_with?: InputMaybe<Scalars['JSON']['input']>;
  array_starts_with?: InputMaybe<Scalars['JSON']['input']>;
  equals?: InputMaybe<Scalars['JSON']['input']>;
  gt?: InputMaybe<Scalars['JSON']['input']>;
  gte?: InputMaybe<Scalars['JSON']['input']>;
  lt?: InputMaybe<Scalars['JSON']['input']>;
  lte?: InputMaybe<Scalars['JSON']['input']>;
  not?: InputMaybe<Scalars['JSON']['input']>;
  path?: InputMaybe<Array<Scalars['String']['input']>>;
  string_contains?: InputMaybe<Scalars['String']['input']>;
  string_ends_with?: InputMaybe<Scalars['String']['input']>;
  string_starts_with?: InputMaybe<Scalars['String']['input']>;
};

export type Market = {
  __typename?: 'Market';
  _count?: Maybe<MarketCount>;
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  currentPrice?: Maybe<Scalars['String']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  marketId: Scalars['Int']['output'];
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsClaimstatement?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  maxPriceD18?: Maybe<Scalars['Decimal']['output']>;
  minPriceD18?: Maybe<Scalars['Decimal']['output']>;
  optionName?: Maybe<Scalars['String']['output']>;
  poolAddress?: Maybe<Scalars['String']['output']>;
  public: Scalars['Boolean']['output'];
  question?: Maybe<Scalars['String']['output']>;
  rules?: Maybe<Scalars['String']['output']>;
  settled?: Maybe<Scalars['Boolean']['output']>;
  settlementPriceD18?: Maybe<Scalars['Decimal']['output']>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['Decimal']['output']>;
};

export type MarketAvgAggregate = {
  __typename?: 'MarketAvgAggregate';
  baseAssetMaxPriceTick?: Maybe<Scalars['Float']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Float']['output']>;
  endTimestamp?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  marketGroupId?: Maybe<Scalars['Float']['output']>;
  marketId?: Maybe<Scalars['Float']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Float']['output']>;
  maxPriceD18?: Maybe<Scalars['Decimal']['output']>;
  minPriceD18?: Maybe<Scalars['Decimal']['output']>;
  settlementPriceD18?: Maybe<Scalars['Decimal']['output']>;
  startTimestamp?: Maybe<Scalars['Float']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['Decimal']['output']>;
};

export type MarketAvgOrderByAggregateInput = {
  baseAssetMaxPriceTick?: InputMaybe<SortOrder>;
  baseAssetMinPriceTick?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsFeerate?: InputMaybe<SortOrder>;
  maxPriceD18?: InputMaybe<SortOrder>;
  minPriceD18?: InputMaybe<SortOrder>;
  settlementPriceD18?: InputMaybe<SortOrder>;
  startTimestamp?: InputMaybe<SortOrder>;
  startingSqrtPriceX96?: InputMaybe<SortOrder>;
};

export type MarketCount = {
  __typename?: 'MarketCount';
  position: Scalars['Int']['output'];
};


export type MarketCountPositionArgs = {
  where?: InputMaybe<PositionWhereInput>;
};

export type MarketCountAggregate = {
  __typename?: 'MarketCountAggregate';
  _all: Scalars['Int']['output'];
  baseAssetMaxPriceTick: Scalars['Int']['output'];
  baseAssetMinPriceTick: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  endTimestamp: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  marketGroupId: Scalars['Int']['output'];
  marketId: Scalars['Int']['output'];
  marketParamsAssertionliveness: Scalars['Int']['output'];
  marketParamsBondamount: Scalars['Int']['output'];
  marketParamsBondcurrency: Scalars['Int']['output'];
  marketParamsClaimstatement: Scalars['Int']['output'];
  marketParamsFeerate: Scalars['Int']['output'];
  marketParamsOptimisticoraclev3: Scalars['Int']['output'];
  marketParamsUniswappositionmanager: Scalars['Int']['output'];
  marketParamsUniswapquoter: Scalars['Int']['output'];
  marketParamsUniswapswaprouter: Scalars['Int']['output'];
  maxPriceD18: Scalars['Int']['output'];
  minPriceD18: Scalars['Int']['output'];
  optionName: Scalars['Int']['output'];
  poolAddress: Scalars['Int']['output'];
  public: Scalars['Int']['output'];
  question: Scalars['Int']['output'];
  rules: Scalars['Int']['output'];
  settled: Scalars['Int']['output'];
  settlementPriceD18: Scalars['Int']['output'];
  startTimestamp: Scalars['Int']['output'];
  startingSqrtPriceX96: Scalars['Int']['output'];
};

export type MarketCountOrderByAggregateInput = {
  baseAssetMaxPriceTick?: InputMaybe<SortOrder>;
  baseAssetMinPriceTick?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
  marketParamsClaimstatement?: InputMaybe<SortOrder>;
  marketParamsFeerate?: InputMaybe<SortOrder>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrder>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrder>;
  marketParamsUniswapquoter?: InputMaybe<SortOrder>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrder>;
  maxPriceD18?: InputMaybe<SortOrder>;
  minPriceD18?: InputMaybe<SortOrder>;
  optionName?: InputMaybe<SortOrder>;
  poolAddress?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  rules?: InputMaybe<SortOrder>;
  settled?: InputMaybe<SortOrder>;
  settlementPriceD18?: InputMaybe<SortOrder>;
  startTimestamp?: InputMaybe<SortOrder>;
  startingSqrtPriceX96?: InputMaybe<SortOrder>;
};

export type MarketFilterInput = {
  endTimestamp_gt?: InputMaybe<Scalars['String']['input']>;
};

export type MarketGroupBy = {
  __typename?: 'MarketGroupBy';
  _avg?: Maybe<MarketAvgAggregate>;
  _count?: Maybe<MarketCountAggregate>;
  _max?: Maybe<MarketMaxAggregate>;
  _min?: Maybe<MarketMinAggregate>;
  _sum?: Maybe<MarketSumAggregate>;
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  marketId: Scalars['Int']['output'];
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsClaimstatement?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  maxPriceD18?: Maybe<Scalars['Decimal']['output']>;
  minPriceD18?: Maybe<Scalars['Decimal']['output']>;
  optionName?: Maybe<Scalars['String']['output']>;
  poolAddress?: Maybe<Scalars['String']['output']>;
  public: Scalars['Boolean']['output'];
  question?: Maybe<Scalars['String']['output']>;
  rules?: Maybe<Scalars['String']['output']>;
  settled?: Maybe<Scalars['Boolean']['output']>;
  settlementPriceD18?: Maybe<Scalars['Decimal']['output']>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['Decimal']['output']>;
};

export type MarketListRelationFilter = {
  every?: InputMaybe<MarketWhereInput>;
  none?: InputMaybe<MarketWhereInput>;
  some?: InputMaybe<MarketWhereInput>;
};

export type MarketMaxAggregate = {
  __typename?: 'MarketMaxAggregate';
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsClaimstatement?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  maxPriceD18?: Maybe<Scalars['Decimal']['output']>;
  minPriceD18?: Maybe<Scalars['Decimal']['output']>;
  optionName?: Maybe<Scalars['String']['output']>;
  poolAddress?: Maybe<Scalars['String']['output']>;
  public?: Maybe<Scalars['Boolean']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  rules?: Maybe<Scalars['String']['output']>;
  settled?: Maybe<Scalars['Boolean']['output']>;
  settlementPriceD18?: Maybe<Scalars['Decimal']['output']>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['Decimal']['output']>;
};

export type MarketMaxOrderByAggregateInput = {
  baseAssetMaxPriceTick?: InputMaybe<SortOrder>;
  baseAssetMinPriceTick?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
  marketParamsClaimstatement?: InputMaybe<SortOrder>;
  marketParamsFeerate?: InputMaybe<SortOrder>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrder>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrder>;
  marketParamsUniswapquoter?: InputMaybe<SortOrder>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrder>;
  maxPriceD18?: InputMaybe<SortOrder>;
  minPriceD18?: InputMaybe<SortOrder>;
  optionName?: InputMaybe<SortOrder>;
  poolAddress?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  rules?: InputMaybe<SortOrder>;
  settled?: InputMaybe<SortOrder>;
  settlementPriceD18?: InputMaybe<SortOrder>;
  startTimestamp?: InputMaybe<SortOrder>;
  startingSqrtPriceX96?: InputMaybe<SortOrder>;
};

export type MarketMinAggregate = {
  __typename?: 'MarketMinAggregate';
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsClaimstatement?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  maxPriceD18?: Maybe<Scalars['Decimal']['output']>;
  minPriceD18?: Maybe<Scalars['Decimal']['output']>;
  optionName?: Maybe<Scalars['String']['output']>;
  poolAddress?: Maybe<Scalars['String']['output']>;
  public?: Maybe<Scalars['Boolean']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  rules?: Maybe<Scalars['String']['output']>;
  settled?: Maybe<Scalars['Boolean']['output']>;
  settlementPriceD18?: Maybe<Scalars['Decimal']['output']>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['Decimal']['output']>;
};

export type MarketMinOrderByAggregateInput = {
  baseAssetMaxPriceTick?: InputMaybe<SortOrder>;
  baseAssetMinPriceTick?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
  marketParamsClaimstatement?: InputMaybe<SortOrder>;
  marketParamsFeerate?: InputMaybe<SortOrder>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrder>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrder>;
  marketParamsUniswapquoter?: InputMaybe<SortOrder>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrder>;
  maxPriceD18?: InputMaybe<SortOrder>;
  minPriceD18?: InputMaybe<SortOrder>;
  optionName?: InputMaybe<SortOrder>;
  poolAddress?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  rules?: InputMaybe<SortOrder>;
  settled?: InputMaybe<SortOrder>;
  settlementPriceD18?: InputMaybe<SortOrder>;
  startTimestamp?: InputMaybe<SortOrder>;
  startingSqrtPriceX96?: InputMaybe<SortOrder>;
};

export type MarketNullableRelationFilter = {
  is?: InputMaybe<MarketWhereInput>;
  isNot?: InputMaybe<MarketWhereInput>;
};

export type MarketOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type MarketOrderByWithAggregationInput = {
  _avg?: InputMaybe<MarketAvgOrderByAggregateInput>;
  _count?: InputMaybe<MarketCountOrderByAggregateInput>;
  _max?: InputMaybe<MarketMaxOrderByAggregateInput>;
  _min?: InputMaybe<MarketMinOrderByAggregateInput>;
  _sum?: InputMaybe<MarketSumOrderByAggregateInput>;
  baseAssetMaxPriceTick?: InputMaybe<SortOrderInput>;
  baseAssetMinPriceTick?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrderInput>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrderInput>;
  marketParamsBondamount?: InputMaybe<SortOrderInput>;
  marketParamsBondcurrency?: InputMaybe<SortOrderInput>;
  marketParamsClaimstatement?: InputMaybe<SortOrderInput>;
  marketParamsFeerate?: InputMaybe<SortOrderInput>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrderInput>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrderInput>;
  marketParamsUniswapquoter?: InputMaybe<SortOrderInput>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrderInput>;
  maxPriceD18?: InputMaybe<SortOrderInput>;
  minPriceD18?: InputMaybe<SortOrderInput>;
  optionName?: InputMaybe<SortOrderInput>;
  poolAddress?: InputMaybe<SortOrderInput>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrderInput>;
  rules?: InputMaybe<SortOrderInput>;
  settled?: InputMaybe<SortOrderInput>;
  settlementPriceD18?: InputMaybe<SortOrderInput>;
  startTimestamp?: InputMaybe<SortOrderInput>;
  startingSqrtPriceX96?: InputMaybe<SortOrderInput>;
};

export type MarketOrderByWithRelationInput = {
  baseAssetMaxPriceTick?: InputMaybe<SortOrderInput>;
  baseAssetMinPriceTick?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrderInput>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrderInput>;
  marketParamsBondamount?: InputMaybe<SortOrderInput>;
  marketParamsBondcurrency?: InputMaybe<SortOrderInput>;
  marketParamsClaimstatement?: InputMaybe<SortOrderInput>;
  marketParamsFeerate?: InputMaybe<SortOrderInput>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrderInput>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrderInput>;
  marketParamsUniswapquoter?: InputMaybe<SortOrderInput>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrderInput>;
  market_group?: InputMaybe<Market_GroupOrderByWithRelationInput>;
  maxPriceD18?: InputMaybe<SortOrderInput>;
  minPriceD18?: InputMaybe<SortOrderInput>;
  optionName?: InputMaybe<SortOrderInput>;
  poolAddress?: InputMaybe<SortOrderInput>;
  position?: InputMaybe<PositionOrderByRelationAggregateInput>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrderInput>;
  rules?: InputMaybe<SortOrderInput>;
  settled?: InputMaybe<SortOrderInput>;
  settlementPriceD18?: InputMaybe<SortOrderInput>;
  startTimestamp?: InputMaybe<SortOrderInput>;
  startingSqrtPriceX96?: InputMaybe<SortOrderInput>;
};

export type MarketOrderInput = {
  direction: Scalars['String']['input'];
  field: Scalars['String']['input'];
};

export type MarketScalarFieldEnum =
  | 'baseAssetMaxPriceTick'
  | 'baseAssetMinPriceTick'
  | 'createdAt'
  | 'endTimestamp'
  | 'id'
  | 'marketGroupId'
  | 'marketId'
  | 'marketParamsAssertionliveness'
  | 'marketParamsBondamount'
  | 'marketParamsBondcurrency'
  | 'marketParamsClaimstatement'
  | 'marketParamsFeerate'
  | 'marketParamsOptimisticoraclev3'
  | 'marketParamsUniswappositionmanager'
  | 'marketParamsUniswapquoter'
  | 'marketParamsUniswapswaprouter'
  | 'maxPriceD18'
  | 'minPriceD18'
  | 'optionName'
  | 'poolAddress'
  | 'public'
  | 'question'
  | 'rules'
  | 'settled'
  | 'settlementPriceD18'
  | 'startTimestamp'
  | 'startingSqrtPriceX96';

export type MarketScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<MarketScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<MarketScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<MarketScalarWhereWithAggregatesInput>>;
  baseAssetMaxPriceTick?: InputMaybe<IntNullableWithAggregatesFilter>;
  baseAssetMinPriceTick?: InputMaybe<IntNullableWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  endTimestamp?: InputMaybe<IntNullableWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  marketGroupId?: InputMaybe<IntNullableWithAggregatesFilter>;
  marketId?: InputMaybe<IntWithAggregatesFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketParamsClaimstatement?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketParamsFeerate?: InputMaybe<IntNullableWithAggregatesFilter>;
  marketParamsOptimisticoraclev3?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketParamsUniswappositionmanager?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketParamsUniswapquoter?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketParamsUniswapswaprouter?: InputMaybe<StringNullableWithAggregatesFilter>;
  maxPriceD18?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  minPriceD18?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  optionName?: InputMaybe<StringNullableWithAggregatesFilter>;
  poolAddress?: InputMaybe<StringNullableWithAggregatesFilter>;
  public?: InputMaybe<BoolWithAggregatesFilter>;
  question?: InputMaybe<StringNullableWithAggregatesFilter>;
  rules?: InputMaybe<StringNullableWithAggregatesFilter>;
  settled?: InputMaybe<BoolNullableWithAggregatesFilter>;
  settlementPriceD18?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  startTimestamp?: InputMaybe<IntNullableWithAggregatesFilter>;
  startingSqrtPriceX96?: InputMaybe<DecimalNullableWithAggregatesFilter>;
};

export type MarketSumAggregate = {
  __typename?: 'MarketSumAggregate';
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  maxPriceD18?: Maybe<Scalars['Decimal']['output']>;
  minPriceD18?: Maybe<Scalars['Decimal']['output']>;
  settlementPriceD18?: Maybe<Scalars['Decimal']['output']>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['Decimal']['output']>;
};

export type MarketSumOrderByAggregateInput = {
  baseAssetMaxPriceTick?: InputMaybe<SortOrder>;
  baseAssetMinPriceTick?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsFeerate?: InputMaybe<SortOrder>;
  maxPriceD18?: InputMaybe<SortOrder>;
  minPriceD18?: InputMaybe<SortOrder>;
  settlementPriceD18?: InputMaybe<SortOrder>;
  startTimestamp?: InputMaybe<SortOrder>;
  startingSqrtPriceX96?: InputMaybe<SortOrder>;
};

export type MarketWhereInput = {
  AND?: InputMaybe<Array<MarketWhereInput>>;
  NOT?: InputMaybe<Array<MarketWhereInput>>;
  OR?: InputMaybe<Array<MarketWhereInput>>;
  baseAssetMaxPriceTick?: InputMaybe<IntNullableFilter>;
  baseAssetMinPriceTick?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  endTimestamp?: InputMaybe<IntNullableFilter>;
  id?: InputMaybe<IntFilter>;
  marketGroupId?: InputMaybe<IntNullableFilter>;
  marketId?: InputMaybe<IntFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableFilter>;
  marketParamsClaimstatement?: InputMaybe<StringNullableFilter>;
  marketParamsFeerate?: InputMaybe<IntNullableFilter>;
  marketParamsOptimisticoraclev3?: InputMaybe<StringNullableFilter>;
  marketParamsUniswappositionmanager?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapquoter?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapswaprouter?: InputMaybe<StringNullableFilter>;
  market_group?: InputMaybe<Market_GroupNullableRelationFilter>;
  maxPriceD18?: InputMaybe<DecimalNullableFilter>;
  minPriceD18?: InputMaybe<DecimalNullableFilter>;
  optionName?: InputMaybe<StringNullableFilter>;
  poolAddress?: InputMaybe<StringNullableFilter>;
  position?: InputMaybe<PositionListRelationFilter>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringNullableFilter>;
  rules?: InputMaybe<StringNullableFilter>;
  settled?: InputMaybe<BoolNullableFilter>;
  settlementPriceD18?: InputMaybe<DecimalNullableFilter>;
  startTimestamp?: InputMaybe<IntNullableFilter>;
  startingSqrtPriceX96?: InputMaybe<DecimalNullableFilter>;
};

export type MarketWhereUniqueInput = {
  AND?: InputMaybe<Array<MarketWhereInput>>;
  NOT?: InputMaybe<Array<MarketWhereInput>>;
  OR?: InputMaybe<Array<MarketWhereInput>>;
  baseAssetMaxPriceTick?: InputMaybe<IntNullableFilter>;
  baseAssetMinPriceTick?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  endTimestamp?: InputMaybe<IntNullableFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  marketGroupId?: InputMaybe<IntNullableFilter>;
  marketGroupId_marketId?: InputMaybe<MarketMarketGroupIdMarketIdCompoundUniqueInput>;
  marketId?: InputMaybe<IntFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableFilter>;
  marketParamsClaimstatement?: InputMaybe<StringNullableFilter>;
  marketParamsFeerate?: InputMaybe<IntNullableFilter>;
  marketParamsOptimisticoraclev3?: InputMaybe<StringNullableFilter>;
  marketParamsUniswappositionmanager?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapquoter?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapswaprouter?: InputMaybe<StringNullableFilter>;
  market_group?: InputMaybe<Market_GroupNullableRelationFilter>;
  maxPriceD18?: InputMaybe<DecimalNullableFilter>;
  minPriceD18?: InputMaybe<DecimalNullableFilter>;
  optionName?: InputMaybe<StringNullableFilter>;
  poolAddress?: InputMaybe<StringNullableFilter>;
  position?: InputMaybe<PositionListRelationFilter>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringNullableFilter>;
  rules?: InputMaybe<StringNullableFilter>;
  settled?: InputMaybe<BoolNullableFilter>;
  settlementPriceD18?: InputMaybe<DecimalNullableFilter>;
  startTimestamp?: InputMaybe<IntNullableFilter>;
  startingSqrtPriceX96?: InputMaybe<DecimalNullableFilter>;
};

export type Market_Group = {
  __typename?: 'Market_group';
  _count?: Maybe<Market_GroupCount>;
  address?: Maybe<Scalars['String']['output']>;
  baseTokenName?: Maybe<Scalars['String']['output']>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId: Scalars['Int']['output'];
  collateralAsset?: Maybe<Scalars['String']['output']>;
  collateralDecimals?: Maybe<Scalars['Int']['output']>;
  collateralSymbol?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  deployTimestamp?: Maybe<Scalars['Int']['output']>;
  deployTxnBlockNumber?: Maybe<Scalars['Int']['output']>;
  factoryAddress?: Maybe<Scalars['String']['output']>;
  id: Scalars['Int']['output'];
  initializationNonce?: Maybe<Scalars['String']['output']>;
  isCumulative: Scalars['Boolean']['output'];
  isYin: Scalars['Boolean']['output'];
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsClaimstatement?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  markets: Array<Market>;
  minTradeSize?: Maybe<Scalars['Decimal']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  quoteTokenName?: Maybe<Scalars['String']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  vaultAddress?: Maybe<Scalars['String']['output']>;
};


export type Market_GroupMarketsArgs = {
  filter?: InputMaybe<MarketFilterInput>;
  orderBy?: InputMaybe<MarketOrderInput>;
};

export type Market_GroupAvgAggregate = {
  __typename?: 'Market_groupAvgAggregate';
  categoryId?: Maybe<Scalars['Float']['output']>;
  chainId?: Maybe<Scalars['Float']['output']>;
  collateralDecimals?: Maybe<Scalars['Float']['output']>;
  deployTimestamp?: Maybe<Scalars['Float']['output']>;
  deployTxnBlockNumber?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Float']['output']>;
  minTradeSize?: Maybe<Scalars['Decimal']['output']>;
  resourceId?: Maybe<Scalars['Float']['output']>;
};

export type Market_GroupAvgOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrder>;
  collateralDecimals?: InputMaybe<SortOrder>;
  deployTimestamp?: InputMaybe<SortOrder>;
  deployTxnBlockNumber?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsFeerate?: InputMaybe<SortOrder>;
  minTradeSize?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
};

export type Market_GroupCount = {
  __typename?: 'Market_groupCount';
  event: Scalars['Int']['output'];
  market: Scalars['Int']['output'];
};


export type Market_GroupCountEventArgs = {
  where?: InputMaybe<EventWhereInput>;
};


export type Market_GroupCountMarketArgs = {
  where?: InputMaybe<MarketWhereInput>;
};

export type Market_GroupCountAggregate = {
  __typename?: 'Market_groupCountAggregate';
  _all: Scalars['Int']['output'];
  address: Scalars['Int']['output'];
  baseTokenName: Scalars['Int']['output'];
  categoryId: Scalars['Int']['output'];
  chainId: Scalars['Int']['output'];
  collateralAsset: Scalars['Int']['output'];
  collateralDecimals: Scalars['Int']['output'];
  collateralSymbol: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  deployTimestamp: Scalars['Int']['output'];
  deployTxnBlockNumber: Scalars['Int']['output'];
  factoryAddress: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  initializationNonce: Scalars['Int']['output'];
  isCumulative: Scalars['Int']['output'];
  isYin: Scalars['Int']['output'];
  marketParamsAssertionliveness: Scalars['Int']['output'];
  marketParamsBondamount: Scalars['Int']['output'];
  marketParamsBondcurrency: Scalars['Int']['output'];
  marketParamsClaimstatement: Scalars['Int']['output'];
  marketParamsFeerate: Scalars['Int']['output'];
  marketParamsOptimisticoraclev3: Scalars['Int']['output'];
  marketParamsUniswappositionmanager: Scalars['Int']['output'];
  marketParamsUniswapquoter: Scalars['Int']['output'];
  marketParamsUniswapswaprouter: Scalars['Int']['output'];
  minTradeSize: Scalars['Int']['output'];
  owner: Scalars['Int']['output'];
  question: Scalars['Int']['output'];
  quoteTokenName: Scalars['Int']['output'];
  resourceId: Scalars['Int']['output'];
  vaultAddress: Scalars['Int']['output'];
};

export type Market_GroupCountOrderByAggregateInput = {
  address?: InputMaybe<SortOrder>;
  baseTokenName?: InputMaybe<SortOrder>;
  categoryId?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrder>;
  collateralAsset?: InputMaybe<SortOrder>;
  collateralDecimals?: InputMaybe<SortOrder>;
  collateralSymbol?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  deployTimestamp?: InputMaybe<SortOrder>;
  deployTxnBlockNumber?: InputMaybe<SortOrder>;
  factoryAddress?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  initializationNonce?: InputMaybe<SortOrder>;
  isCumulative?: InputMaybe<SortOrder>;
  isYin?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
  marketParamsClaimstatement?: InputMaybe<SortOrder>;
  marketParamsFeerate?: InputMaybe<SortOrder>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrder>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrder>;
  marketParamsUniswapquoter?: InputMaybe<SortOrder>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrder>;
  minTradeSize?: InputMaybe<SortOrder>;
  owner?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  quoteTokenName?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  vaultAddress?: InputMaybe<SortOrder>;
};

export type Market_GroupGroupBy = {
  __typename?: 'Market_groupGroupBy';
  _avg?: Maybe<Market_GroupAvgAggregate>;
  _count?: Maybe<Market_GroupCountAggregate>;
  _max?: Maybe<Market_GroupMaxAggregate>;
  _min?: Maybe<Market_GroupMinAggregate>;
  _sum?: Maybe<Market_GroupSumAggregate>;
  address?: Maybe<Scalars['String']['output']>;
  baseTokenName?: Maybe<Scalars['String']['output']>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId: Scalars['Int']['output'];
  collateralAsset?: Maybe<Scalars['String']['output']>;
  collateralDecimals?: Maybe<Scalars['Int']['output']>;
  collateralSymbol?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  deployTimestamp?: Maybe<Scalars['Int']['output']>;
  deployTxnBlockNumber?: Maybe<Scalars['Int']['output']>;
  factoryAddress?: Maybe<Scalars['String']['output']>;
  id: Scalars['Int']['output'];
  initializationNonce?: Maybe<Scalars['String']['output']>;
  isCumulative: Scalars['Boolean']['output'];
  isYin: Scalars['Boolean']['output'];
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsClaimstatement?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  minTradeSize?: Maybe<Scalars['Decimal']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  quoteTokenName?: Maybe<Scalars['String']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  vaultAddress?: Maybe<Scalars['String']['output']>;
};

export type Market_GroupListRelationFilter = {
  every?: InputMaybe<Market_GroupWhereInput>;
  none?: InputMaybe<Market_GroupWhereInput>;
  some?: InputMaybe<Market_GroupWhereInput>;
};

export type Market_GroupMaxAggregate = {
  __typename?: 'Market_groupMaxAggregate';
  address?: Maybe<Scalars['String']['output']>;
  baseTokenName?: Maybe<Scalars['String']['output']>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId?: Maybe<Scalars['Int']['output']>;
  collateralAsset?: Maybe<Scalars['String']['output']>;
  collateralDecimals?: Maybe<Scalars['Int']['output']>;
  collateralSymbol?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  deployTimestamp?: Maybe<Scalars['Int']['output']>;
  deployTxnBlockNumber?: Maybe<Scalars['Int']['output']>;
  factoryAddress?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  initializationNonce?: Maybe<Scalars['String']['output']>;
  isCumulative?: Maybe<Scalars['Boolean']['output']>;
  isYin?: Maybe<Scalars['Boolean']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsClaimstatement?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  minTradeSize?: Maybe<Scalars['Decimal']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  quoteTokenName?: Maybe<Scalars['String']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  vaultAddress?: Maybe<Scalars['String']['output']>;
};

export type Market_GroupMaxOrderByAggregateInput = {
  address?: InputMaybe<SortOrder>;
  baseTokenName?: InputMaybe<SortOrder>;
  categoryId?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrder>;
  collateralAsset?: InputMaybe<SortOrder>;
  collateralDecimals?: InputMaybe<SortOrder>;
  collateralSymbol?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  deployTimestamp?: InputMaybe<SortOrder>;
  deployTxnBlockNumber?: InputMaybe<SortOrder>;
  factoryAddress?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  initializationNonce?: InputMaybe<SortOrder>;
  isCumulative?: InputMaybe<SortOrder>;
  isYin?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
  marketParamsClaimstatement?: InputMaybe<SortOrder>;
  marketParamsFeerate?: InputMaybe<SortOrder>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrder>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrder>;
  marketParamsUniswapquoter?: InputMaybe<SortOrder>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrder>;
  minTradeSize?: InputMaybe<SortOrder>;
  owner?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  quoteTokenName?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  vaultAddress?: InputMaybe<SortOrder>;
};

export type Market_GroupMinAggregate = {
  __typename?: 'Market_groupMinAggregate';
  address?: Maybe<Scalars['String']['output']>;
  baseTokenName?: Maybe<Scalars['String']['output']>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId?: Maybe<Scalars['Int']['output']>;
  collateralAsset?: Maybe<Scalars['String']['output']>;
  collateralDecimals?: Maybe<Scalars['Int']['output']>;
  collateralSymbol?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  deployTimestamp?: Maybe<Scalars['Int']['output']>;
  deployTxnBlockNumber?: Maybe<Scalars['Int']['output']>;
  factoryAddress?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  initializationNonce?: Maybe<Scalars['String']['output']>;
  isCumulative?: Maybe<Scalars['Boolean']['output']>;
  isYin?: Maybe<Scalars['Boolean']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsClaimstatement?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  minTradeSize?: Maybe<Scalars['Decimal']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  quoteTokenName?: Maybe<Scalars['String']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  vaultAddress?: Maybe<Scalars['String']['output']>;
};

export type Market_GroupMinOrderByAggregateInput = {
  address?: InputMaybe<SortOrder>;
  baseTokenName?: InputMaybe<SortOrder>;
  categoryId?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrder>;
  collateralAsset?: InputMaybe<SortOrder>;
  collateralDecimals?: InputMaybe<SortOrder>;
  collateralSymbol?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  deployTimestamp?: InputMaybe<SortOrder>;
  deployTxnBlockNumber?: InputMaybe<SortOrder>;
  factoryAddress?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  initializationNonce?: InputMaybe<SortOrder>;
  isCumulative?: InputMaybe<SortOrder>;
  isYin?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
  marketParamsClaimstatement?: InputMaybe<SortOrder>;
  marketParamsFeerate?: InputMaybe<SortOrder>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrder>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrder>;
  marketParamsUniswapquoter?: InputMaybe<SortOrder>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrder>;
  minTradeSize?: InputMaybe<SortOrder>;
  owner?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  quoteTokenName?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  vaultAddress?: InputMaybe<SortOrder>;
};

export type Market_GroupNullableRelationFilter = {
  is?: InputMaybe<Market_GroupWhereInput>;
  isNot?: InputMaybe<Market_GroupWhereInput>;
};

export type Market_GroupOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type Market_GroupOrderByWithAggregationInput = {
  _avg?: InputMaybe<Market_GroupAvgOrderByAggregateInput>;
  _count?: InputMaybe<Market_GroupCountOrderByAggregateInput>;
  _max?: InputMaybe<Market_GroupMaxOrderByAggregateInput>;
  _min?: InputMaybe<Market_GroupMinOrderByAggregateInput>;
  _sum?: InputMaybe<Market_GroupSumOrderByAggregateInput>;
  address?: InputMaybe<SortOrderInput>;
  baseTokenName?: InputMaybe<SortOrderInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  chainId?: InputMaybe<SortOrder>;
  collateralAsset?: InputMaybe<SortOrderInput>;
  collateralDecimals?: InputMaybe<SortOrderInput>;
  collateralSymbol?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  deployTimestamp?: InputMaybe<SortOrderInput>;
  deployTxnBlockNumber?: InputMaybe<SortOrderInput>;
  factoryAddress?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  initializationNonce?: InputMaybe<SortOrderInput>;
  isCumulative?: InputMaybe<SortOrder>;
  isYin?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrderInput>;
  marketParamsBondamount?: InputMaybe<SortOrderInput>;
  marketParamsBondcurrency?: InputMaybe<SortOrderInput>;
  marketParamsClaimstatement?: InputMaybe<SortOrderInput>;
  marketParamsFeerate?: InputMaybe<SortOrderInput>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrderInput>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrderInput>;
  marketParamsUniswapquoter?: InputMaybe<SortOrderInput>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrderInput>;
  minTradeSize?: InputMaybe<SortOrderInput>;
  owner?: InputMaybe<SortOrderInput>;
  question?: InputMaybe<SortOrderInput>;
  quoteTokenName?: InputMaybe<SortOrderInput>;
  resourceId?: InputMaybe<SortOrderInput>;
  vaultAddress?: InputMaybe<SortOrderInput>;
};

export type Market_GroupOrderByWithRelationInput = {
  address?: InputMaybe<SortOrderInput>;
  baseTokenName?: InputMaybe<SortOrderInput>;
  category?: InputMaybe<CategoryOrderByWithRelationInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  chainId?: InputMaybe<SortOrder>;
  collateralAsset?: InputMaybe<SortOrderInput>;
  collateralDecimals?: InputMaybe<SortOrderInput>;
  collateralSymbol?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  deployTimestamp?: InputMaybe<SortOrderInput>;
  deployTxnBlockNumber?: InputMaybe<SortOrderInput>;
  event?: InputMaybe<EventOrderByRelationAggregateInput>;
  factoryAddress?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  initializationNonce?: InputMaybe<SortOrderInput>;
  isCumulative?: InputMaybe<SortOrder>;
  isYin?: InputMaybe<SortOrder>;
  market?: InputMaybe<MarketOrderByRelationAggregateInput>;
  marketParamsAssertionliveness?: InputMaybe<SortOrderInput>;
  marketParamsBondamount?: InputMaybe<SortOrderInput>;
  marketParamsBondcurrency?: InputMaybe<SortOrderInput>;
  marketParamsClaimstatement?: InputMaybe<SortOrderInput>;
  marketParamsFeerate?: InputMaybe<SortOrderInput>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrderInput>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrderInput>;
  marketParamsUniswapquoter?: InputMaybe<SortOrderInput>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrderInput>;
  minTradeSize?: InputMaybe<SortOrderInput>;
  owner?: InputMaybe<SortOrderInput>;
  question?: InputMaybe<SortOrderInput>;
  quoteTokenName?: InputMaybe<SortOrderInput>;
  resource?: InputMaybe<ResourceOrderByWithRelationInput>;
  resourceId?: InputMaybe<SortOrderInput>;
  vaultAddress?: InputMaybe<SortOrderInput>;
};

export type Market_GroupScalarFieldEnum =
  | 'address'
  | 'baseTokenName'
  | 'categoryId'
  | 'chainId'
  | 'collateralAsset'
  | 'collateralDecimals'
  | 'collateralSymbol'
  | 'createdAt'
  | 'deployTimestamp'
  | 'deployTxnBlockNumber'
  | 'factoryAddress'
  | 'id'
  | 'initializationNonce'
  | 'isCumulative'
  | 'isYin'
  | 'marketParamsAssertionliveness'
  | 'marketParamsBondamount'
  | 'marketParamsBondcurrency'
  | 'marketParamsClaimstatement'
  | 'marketParamsFeerate'
  | 'marketParamsOptimisticoraclev3'
  | 'marketParamsUniswappositionmanager'
  | 'marketParamsUniswapquoter'
  | 'marketParamsUniswapswaprouter'
  | 'minTradeSize'
  | 'owner'
  | 'question'
  | 'quoteTokenName'
  | 'resourceId'
  | 'vaultAddress';

export type Market_GroupScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<Market_GroupScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<Market_GroupScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<Market_GroupScalarWhereWithAggregatesInput>>;
  address?: InputMaybe<StringNullableWithAggregatesFilter>;
  baseTokenName?: InputMaybe<StringNullableWithAggregatesFilter>;
  categoryId?: InputMaybe<IntNullableWithAggregatesFilter>;
  chainId?: InputMaybe<IntWithAggregatesFilter>;
  collateralAsset?: InputMaybe<StringNullableWithAggregatesFilter>;
  collateralDecimals?: InputMaybe<IntNullableWithAggregatesFilter>;
  collateralSymbol?: InputMaybe<StringNullableWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  deployTimestamp?: InputMaybe<IntNullableWithAggregatesFilter>;
  deployTxnBlockNumber?: InputMaybe<IntNullableWithAggregatesFilter>;
  factoryAddress?: InputMaybe<StringNullableWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  initializationNonce?: InputMaybe<StringNullableWithAggregatesFilter>;
  isCumulative?: InputMaybe<BoolWithAggregatesFilter>;
  isYin?: InputMaybe<BoolWithAggregatesFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketParamsClaimstatement?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketParamsFeerate?: InputMaybe<IntNullableWithAggregatesFilter>;
  marketParamsOptimisticoraclev3?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketParamsUniswappositionmanager?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketParamsUniswapquoter?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketParamsUniswapswaprouter?: InputMaybe<StringNullableWithAggregatesFilter>;
  minTradeSize?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  owner?: InputMaybe<StringNullableWithAggregatesFilter>;
  question?: InputMaybe<StringNullableWithAggregatesFilter>;
  quoteTokenName?: InputMaybe<StringNullableWithAggregatesFilter>;
  resourceId?: InputMaybe<IntNullableWithAggregatesFilter>;
  vaultAddress?: InputMaybe<StringNullableWithAggregatesFilter>;
};

export type Market_GroupSumAggregate = {
  __typename?: 'Market_groupSumAggregate';
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId?: Maybe<Scalars['Int']['output']>;
  collateralDecimals?: Maybe<Scalars['Int']['output']>;
  deployTimestamp?: Maybe<Scalars['Int']['output']>;
  deployTxnBlockNumber?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  minTradeSize?: Maybe<Scalars['Decimal']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
};

export type Market_GroupSumOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrder>;
  collateralDecimals?: InputMaybe<SortOrder>;
  deployTimestamp?: InputMaybe<SortOrder>;
  deployTxnBlockNumber?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsFeerate?: InputMaybe<SortOrder>;
  minTradeSize?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
};

export type Market_GroupWhereInput = {
  AND?: InputMaybe<Array<Market_GroupWhereInput>>;
  NOT?: InputMaybe<Array<Market_GroupWhereInput>>;
  OR?: InputMaybe<Array<Market_GroupWhereInput>>;
  address?: InputMaybe<StringNullableFilter>;
  baseTokenName?: InputMaybe<StringNullableFilter>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  chainId?: InputMaybe<IntFilter>;
  collateralAsset?: InputMaybe<StringNullableFilter>;
  collateralDecimals?: InputMaybe<IntNullableFilter>;
  collateralSymbol?: InputMaybe<StringNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  deployTimestamp?: InputMaybe<IntNullableFilter>;
  deployTxnBlockNumber?: InputMaybe<IntNullableFilter>;
  event?: InputMaybe<EventListRelationFilter>;
  factoryAddress?: InputMaybe<StringNullableFilter>;
  id?: InputMaybe<IntFilter>;
  initializationNonce?: InputMaybe<StringNullableFilter>;
  isCumulative?: InputMaybe<BoolFilter>;
  isYin?: InputMaybe<BoolFilter>;
  market?: InputMaybe<MarketListRelationFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableFilter>;
  marketParamsClaimstatement?: InputMaybe<StringNullableFilter>;
  marketParamsFeerate?: InputMaybe<IntNullableFilter>;
  marketParamsOptimisticoraclev3?: InputMaybe<StringNullableFilter>;
  marketParamsUniswappositionmanager?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapquoter?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapswaprouter?: InputMaybe<StringNullableFilter>;
  minTradeSize?: InputMaybe<DecimalNullableFilter>;
  owner?: InputMaybe<StringNullableFilter>;
  question?: InputMaybe<StringNullableFilter>;
  quoteTokenName?: InputMaybe<StringNullableFilter>;
  resource?: InputMaybe<ResourceNullableRelationFilter>;
  resourceId?: InputMaybe<IntNullableFilter>;
  vaultAddress?: InputMaybe<StringNullableFilter>;
};

export type Market_GroupWhereUniqueInput = {
  AND?: InputMaybe<Array<Market_GroupWhereInput>>;
  NOT?: InputMaybe<Array<Market_GroupWhereInput>>;
  OR?: InputMaybe<Array<Market_GroupWhereInput>>;
  address?: InputMaybe<StringNullableFilter>;
  address_chainId?: InputMaybe<Market_GroupAddressChainIdCompoundUniqueInput>;
  baseTokenName?: InputMaybe<StringNullableFilter>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  chainId?: InputMaybe<IntFilter>;
  collateralAsset?: InputMaybe<StringNullableFilter>;
  collateralDecimals?: InputMaybe<IntNullableFilter>;
  collateralSymbol?: InputMaybe<StringNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  deployTimestamp?: InputMaybe<IntNullableFilter>;
  deployTxnBlockNumber?: InputMaybe<IntNullableFilter>;
  event?: InputMaybe<EventListRelationFilter>;
  factoryAddress?: InputMaybe<StringNullableFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  initializationNonce?: InputMaybe<StringNullableFilter>;
  isCumulative?: InputMaybe<BoolFilter>;
  isYin?: InputMaybe<BoolFilter>;
  market?: InputMaybe<MarketListRelationFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableFilter>;
  marketParamsClaimstatement?: InputMaybe<StringNullableFilter>;
  marketParamsFeerate?: InputMaybe<IntNullableFilter>;
  marketParamsOptimisticoraclev3?: InputMaybe<StringNullableFilter>;
  marketParamsUniswappositionmanager?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapquoter?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapswaprouter?: InputMaybe<StringNullableFilter>;
  minTradeSize?: InputMaybe<DecimalNullableFilter>;
  owner?: InputMaybe<StringNullableFilter>;
  question?: InputMaybe<StringNullableFilter>;
  quoteTokenName?: InputMaybe<StringNullableFilter>;
  resource?: InputMaybe<ResourceNullableRelationFilter>;
  resourceId?: InputMaybe<IntNullableFilter>;
  vaultAddress?: InputMaybe<StringNullableFilter>;
};

export type Market_PriceNullableRelationFilter = {
  is?: InputMaybe<Market_PriceWhereInput>;
  isNot?: InputMaybe<Market_PriceWhereInput>;
};

export type Market_PriceOrderByWithRelationInput = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  transaction?: InputMaybe<TransactionOrderByWithRelationInput>;
  value?: InputMaybe<SortOrder>;
};

export type Market_PriceWhereInput = {
  AND?: InputMaybe<Array<Market_PriceWhereInput>>;
  NOT?: InputMaybe<Array<Market_PriceWhereInput>>;
  OR?: InputMaybe<Array<Market_PriceWhereInput>>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  timestamp?: InputMaybe<BigIntFilter>;
  transaction?: InputMaybe<TransactionNullableRelationFilter>;
  value?: InputMaybe<DecimalFilter>;
};

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

export type NestedBigIntWithAggregatesFilter = {
  _avg?: InputMaybe<NestedFloatFilter>;
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedBigIntFilter>;
  _min?: InputMaybe<NestedBigIntFilter>;
  _sum?: InputMaybe<NestedBigIntFilter>;
  equals?: InputMaybe<Scalars['BigInt']['input']>;
  gt?: InputMaybe<Scalars['BigInt']['input']>;
  gte?: InputMaybe<Scalars['BigInt']['input']>;
  in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  lt?: InputMaybe<Scalars['BigInt']['input']>;
  lte?: InputMaybe<Scalars['BigInt']['input']>;
  not?: InputMaybe<NestedBigIntWithAggregatesFilter>;
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

export type NestedBoolNullableWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntNullableFilter>;
  _max?: InputMaybe<NestedBoolNullableFilter>;
  _min?: InputMaybe<NestedBoolNullableFilter>;
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolNullableWithAggregatesFilter>;
};

export type NestedBoolWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedBoolFilter>;
  _min?: InputMaybe<NestedBoolFilter>;
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolWithAggregatesFilter>;
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

export type NestedDateTimeWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedDateTimeFilter>;
  _min?: InputMaybe<NestedDateTimeFilter>;
  equals?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  gte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  in?: InputMaybe<Array<Scalars['DateTimeISO']['input']>>;
  lt?: InputMaybe<Scalars['DateTimeISO']['input']>;
  lte?: InputMaybe<Scalars['DateTimeISO']['input']>;
  not?: InputMaybe<NestedDateTimeWithAggregatesFilter>;
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

export type NestedDecimalNullableFilter = {
  equals?: InputMaybe<Scalars['Decimal']['input']>;
  gt?: InputMaybe<Scalars['Decimal']['input']>;
  gte?: InputMaybe<Scalars['Decimal']['input']>;
  in?: InputMaybe<Array<Scalars['Decimal']['input']>>;
  lt?: InputMaybe<Scalars['Decimal']['input']>;
  lte?: InputMaybe<Scalars['Decimal']['input']>;
  not?: InputMaybe<NestedDecimalNullableFilter>;
  notIn?: InputMaybe<Array<Scalars['Decimal']['input']>>;
};

export type NestedDecimalNullableWithAggregatesFilter = {
  _avg?: InputMaybe<NestedDecimalNullableFilter>;
  _count?: InputMaybe<NestedIntNullableFilter>;
  _max?: InputMaybe<NestedDecimalNullableFilter>;
  _min?: InputMaybe<NestedDecimalNullableFilter>;
  _sum?: InputMaybe<NestedDecimalNullableFilter>;
  equals?: InputMaybe<Scalars['Decimal']['input']>;
  gt?: InputMaybe<Scalars['Decimal']['input']>;
  gte?: InputMaybe<Scalars['Decimal']['input']>;
  in?: InputMaybe<Array<Scalars['Decimal']['input']>>;
  lt?: InputMaybe<Scalars['Decimal']['input']>;
  lte?: InputMaybe<Scalars['Decimal']['input']>;
  not?: InputMaybe<NestedDecimalNullableWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['Decimal']['input']>>;
};

export type NestedDecimalWithAggregatesFilter = {
  _avg?: InputMaybe<NestedDecimalFilter>;
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedDecimalFilter>;
  _min?: InputMaybe<NestedDecimalFilter>;
  _sum?: InputMaybe<NestedDecimalFilter>;
  equals?: InputMaybe<Scalars['Decimal']['input']>;
  gt?: InputMaybe<Scalars['Decimal']['input']>;
  gte?: InputMaybe<Scalars['Decimal']['input']>;
  in?: InputMaybe<Array<Scalars['Decimal']['input']>>;
  lt?: InputMaybe<Scalars['Decimal']['input']>;
  lte?: InputMaybe<Scalars['Decimal']['input']>;
  not?: InputMaybe<NestedDecimalWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['Decimal']['input']>>;
};

export type NestedEnumtransaction_Type_EnumFilter = {
  equals?: InputMaybe<Transaction_Type_Enum>;
  in?: InputMaybe<Array<Transaction_Type_Enum>>;
  not?: InputMaybe<NestedEnumtransaction_Type_EnumFilter>;
  notIn?: InputMaybe<Array<Transaction_Type_Enum>>;
};

export type NestedEnumtransaction_Type_EnumWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedEnumtransaction_Type_EnumFilter>;
  _min?: InputMaybe<NestedEnumtransaction_Type_EnumFilter>;
  equals?: InputMaybe<Transaction_Type_Enum>;
  in?: InputMaybe<Array<Transaction_Type_Enum>>;
  not?: InputMaybe<NestedEnumtransaction_Type_EnumWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Transaction_Type_Enum>>;
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

export type NestedIntNullableWithAggregatesFilter = {
  _avg?: InputMaybe<NestedFloatNullableFilter>;
  _count?: InputMaybe<NestedIntNullableFilter>;
  _max?: InputMaybe<NestedIntNullableFilter>;
  _min?: InputMaybe<NestedIntNullableFilter>;
  _sum?: InputMaybe<NestedIntNullableFilter>;
  equals?: InputMaybe<Scalars['Int']['input']>;
  gt?: InputMaybe<Scalars['Int']['input']>;
  gte?: InputMaybe<Scalars['Int']['input']>;
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lt?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
  not?: InputMaybe<NestedIntNullableWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type NestedIntWithAggregatesFilter = {
  _avg?: InputMaybe<NestedFloatFilter>;
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedIntFilter>;
  _min?: InputMaybe<NestedIntFilter>;
  _sum?: InputMaybe<NestedIntFilter>;
  equals?: InputMaybe<Scalars['Int']['input']>;
  gt?: InputMaybe<Scalars['Int']['input']>;
  gte?: InputMaybe<Scalars['Int']['input']>;
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lt?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
  not?: InputMaybe<NestedIntWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type NestedJsonFilter = {
  array_contains?: InputMaybe<Scalars['JSON']['input']>;
  array_ends_with?: InputMaybe<Scalars['JSON']['input']>;
  array_starts_with?: InputMaybe<Scalars['JSON']['input']>;
  equals?: InputMaybe<Scalars['JSON']['input']>;
  gt?: InputMaybe<Scalars['JSON']['input']>;
  gte?: InputMaybe<Scalars['JSON']['input']>;
  lt?: InputMaybe<Scalars['JSON']['input']>;
  lte?: InputMaybe<Scalars['JSON']['input']>;
  not?: InputMaybe<Scalars['JSON']['input']>;
  path?: InputMaybe<Array<Scalars['String']['input']>>;
  string_contains?: InputMaybe<Scalars['String']['input']>;
  string_ends_with?: InputMaybe<Scalars['String']['input']>;
  string_starts_with?: InputMaybe<Scalars['String']['input']>;
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

export type NestedStringNullableWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntNullableFilter>;
  _max?: InputMaybe<NestedStringNullableFilter>;
  _min?: InputMaybe<NestedStringNullableFilter>;
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  equals?: InputMaybe<Scalars['String']['input']>;
  gt?: InputMaybe<Scalars['String']['input']>;
  gte?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  lt?: InputMaybe<Scalars['String']['input']>;
  lte?: InputMaybe<Scalars['String']['input']>;
  not?: InputMaybe<NestedStringNullableWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type NestedStringWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedStringFilter>;
  _min?: InputMaybe<NestedStringFilter>;
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  equals?: InputMaybe<Scalars['String']['input']>;
  gt?: InputMaybe<Scalars['String']['input']>;
  gte?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  lt?: InputMaybe<Scalars['String']['input']>;
  lte?: InputMaybe<Scalars['String']['input']>;
  not?: InputMaybe<NestedStringWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type NullsOrder =
  | 'first'
  | 'last';

export type PnLType = {
  __typename?: 'PnLType';
  marketId: Scalars['Int']['output'];
  openPositionsPnL: Scalars['String']['output'];
  owner: Scalars['String']['output'];
  positionCount: Scalars['Int']['output'];
  positions: Array<Scalars['Int']['output']>;
  totalDeposits: Scalars['String']['output'];
  totalPnL: Scalars['String']['output'];
  totalWithdrawals: Scalars['String']['output'];
};

export type Position = {
  __typename?: 'Position';
  _count?: Maybe<PositionCount>;
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral: Scalars['Decimal']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id: Scalars['Int']['output'];
  isLP: Scalars['Boolean']['output'];
  isSettled?: Maybe<Scalars['Boolean']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  lpBaseToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  positionId: Scalars['Int']['output'];
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
};

export type PositionAvgAggregate = {
  __typename?: 'PositionAvgAggregate';
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral?: Maybe<Scalars['Decimal']['output']>;
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  lpBaseToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  marketId?: Maybe<Scalars['Float']['output']>;
  positionId?: Maybe<Scalars['Float']['output']>;
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
};

export type PositionAvgOrderByAggregateInput = {
  baseToken?: InputMaybe<SortOrder>;
  borrowedBaseToken?: InputMaybe<SortOrder>;
  borrowedQuoteToken?: InputMaybe<SortOrder>;
  collateral?: InputMaybe<SortOrder>;
  highPriceTick?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lowPriceTick?: InputMaybe<SortOrder>;
  lpBaseToken?: InputMaybe<SortOrder>;
  lpQuoteToken?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrder>;
};

export type PositionCount = {
  __typename?: 'PositionCount';
  transaction: Scalars['Int']['output'];
};


export type PositionCountTransactionArgs = {
  where?: InputMaybe<TransactionWhereInput>;
};

export type PositionCountAggregate = {
  __typename?: 'PositionCountAggregate';
  _all: Scalars['Int']['output'];
  baseToken: Scalars['Int']['output'];
  borrowedBaseToken: Scalars['Int']['output'];
  borrowedQuoteToken: Scalars['Int']['output'];
  collateral: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  highPriceTick: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  isLP: Scalars['Int']['output'];
  isSettled: Scalars['Int']['output'];
  lowPriceTick: Scalars['Int']['output'];
  lpBaseToken: Scalars['Int']['output'];
  lpQuoteToken: Scalars['Int']['output'];
  marketId: Scalars['Int']['output'];
  owner: Scalars['Int']['output'];
  positionId: Scalars['Int']['output'];
  quoteToken: Scalars['Int']['output'];
};

export type PositionCountOrderByAggregateInput = {
  baseToken?: InputMaybe<SortOrder>;
  borrowedBaseToken?: InputMaybe<SortOrder>;
  borrowedQuoteToken?: InputMaybe<SortOrder>;
  collateral?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  highPriceTick?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  isLP?: InputMaybe<SortOrder>;
  isSettled?: InputMaybe<SortOrder>;
  lowPriceTick?: InputMaybe<SortOrder>;
  lpBaseToken?: InputMaybe<SortOrder>;
  lpQuoteToken?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  owner?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrder>;
};

export type PositionGroupBy = {
  __typename?: 'PositionGroupBy';
  _avg?: Maybe<PositionAvgAggregate>;
  _count?: Maybe<PositionCountAggregate>;
  _max?: Maybe<PositionMaxAggregate>;
  _min?: Maybe<PositionMinAggregate>;
  _sum?: Maybe<PositionSumAggregate>;
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral: Scalars['Decimal']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id: Scalars['Int']['output'];
  isLP: Scalars['Boolean']['output'];
  isSettled?: Maybe<Scalars['Boolean']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  lpBaseToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  positionId: Scalars['Int']['output'];
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
};

export type PositionListRelationFilter = {
  every?: InputMaybe<PositionWhereInput>;
  none?: InputMaybe<PositionWhereInput>;
  some?: InputMaybe<PositionWhereInput>;
};

export type PositionMaxAggregate = {
  __typename?: 'PositionMaxAggregate';
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral?: Maybe<Scalars['Decimal']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isLP?: Maybe<Scalars['Boolean']['output']>;
  isSettled?: Maybe<Scalars['Boolean']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  lpBaseToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
};

export type PositionMaxOrderByAggregateInput = {
  baseToken?: InputMaybe<SortOrder>;
  borrowedBaseToken?: InputMaybe<SortOrder>;
  borrowedQuoteToken?: InputMaybe<SortOrder>;
  collateral?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  highPriceTick?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  isLP?: InputMaybe<SortOrder>;
  isSettled?: InputMaybe<SortOrder>;
  lowPriceTick?: InputMaybe<SortOrder>;
  lpBaseToken?: InputMaybe<SortOrder>;
  lpQuoteToken?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  owner?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrder>;
};

export type PositionMinAggregate = {
  __typename?: 'PositionMinAggregate';
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral?: Maybe<Scalars['Decimal']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isLP?: Maybe<Scalars['Boolean']['output']>;
  isSettled?: Maybe<Scalars['Boolean']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  lpBaseToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
};

export type PositionMinOrderByAggregateInput = {
  baseToken?: InputMaybe<SortOrder>;
  borrowedBaseToken?: InputMaybe<SortOrder>;
  borrowedQuoteToken?: InputMaybe<SortOrder>;
  collateral?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  highPriceTick?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  isLP?: InputMaybe<SortOrder>;
  isSettled?: InputMaybe<SortOrder>;
  lowPriceTick?: InputMaybe<SortOrder>;
  lpBaseToken?: InputMaybe<SortOrder>;
  lpQuoteToken?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  owner?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrder>;
};

export type PositionNullableRelationFilter = {
  is?: InputMaybe<PositionWhereInput>;
  isNot?: InputMaybe<PositionWhereInput>;
};

export type PositionOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type PositionOrderByWithAggregationInput = {
  _avg?: InputMaybe<PositionAvgOrderByAggregateInput>;
  _count?: InputMaybe<PositionCountOrderByAggregateInput>;
  _max?: InputMaybe<PositionMaxOrderByAggregateInput>;
  _min?: InputMaybe<PositionMinOrderByAggregateInput>;
  _sum?: InputMaybe<PositionSumOrderByAggregateInput>;
  baseToken?: InputMaybe<SortOrderInput>;
  borrowedBaseToken?: InputMaybe<SortOrderInput>;
  borrowedQuoteToken?: InputMaybe<SortOrderInput>;
  collateral?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  highPriceTick?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  isLP?: InputMaybe<SortOrder>;
  isSettled?: InputMaybe<SortOrderInput>;
  lowPriceTick?: InputMaybe<SortOrderInput>;
  lpBaseToken?: InputMaybe<SortOrderInput>;
  lpQuoteToken?: InputMaybe<SortOrderInput>;
  marketId?: InputMaybe<SortOrderInput>;
  owner?: InputMaybe<SortOrderInput>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrderInput>;
};

export type PositionOrderByWithRelationInput = {
  baseToken?: InputMaybe<SortOrderInput>;
  borrowedBaseToken?: InputMaybe<SortOrderInput>;
  borrowedQuoteToken?: InputMaybe<SortOrderInput>;
  collateral?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  highPriceTick?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  isLP?: InputMaybe<SortOrder>;
  isSettled?: InputMaybe<SortOrderInput>;
  lowPriceTick?: InputMaybe<SortOrderInput>;
  lpBaseToken?: InputMaybe<SortOrderInput>;
  lpQuoteToken?: InputMaybe<SortOrderInput>;
  market?: InputMaybe<MarketOrderByWithRelationInput>;
  marketId?: InputMaybe<SortOrderInput>;
  owner?: InputMaybe<SortOrderInput>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrderInput>;
  transaction?: InputMaybe<TransactionOrderByRelationAggregateInput>;
};

export type PositionScalarFieldEnum =
  | 'baseToken'
  | 'borrowedBaseToken'
  | 'borrowedQuoteToken'
  | 'collateral'
  | 'createdAt'
  | 'highPriceTick'
  | 'id'
  | 'isLP'
  | 'isSettled'
  | 'lowPriceTick'
  | 'lpBaseToken'
  | 'lpQuoteToken'
  | 'marketId'
  | 'owner'
  | 'positionId'
  | 'quoteToken';

export type PositionScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<PositionScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<PositionScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<PositionScalarWhereWithAggregatesInput>>;
  baseToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  borrowedBaseToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  borrowedQuoteToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  collateral?: InputMaybe<DecimalWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  highPriceTick?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  isLP?: InputMaybe<BoolWithAggregatesFilter>;
  isSettled?: InputMaybe<BoolNullableWithAggregatesFilter>;
  lowPriceTick?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  lpBaseToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  lpQuoteToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  marketId?: InputMaybe<IntNullableWithAggregatesFilter>;
  owner?: InputMaybe<StringNullableWithAggregatesFilter>;
  positionId?: InputMaybe<IntWithAggregatesFilter>;
  quoteToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
};

export type PositionSumAggregate = {
  __typename?: 'PositionSumAggregate';
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral?: Maybe<Scalars['Decimal']['output']>;
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  lpBaseToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
};

export type PositionSumOrderByAggregateInput = {
  baseToken?: InputMaybe<SortOrder>;
  borrowedBaseToken?: InputMaybe<SortOrder>;
  borrowedQuoteToken?: InputMaybe<SortOrder>;
  collateral?: InputMaybe<SortOrder>;
  highPriceTick?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lowPriceTick?: InputMaybe<SortOrder>;
  lpBaseToken?: InputMaybe<SortOrder>;
  lpQuoteToken?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrder>;
};

export type PositionWhereInput = {
  AND?: InputMaybe<Array<PositionWhereInput>>;
  NOT?: InputMaybe<Array<PositionWhereInput>>;
  OR?: InputMaybe<Array<PositionWhereInput>>;
  baseToken?: InputMaybe<DecimalNullableFilter>;
  borrowedBaseToken?: InputMaybe<DecimalNullableFilter>;
  borrowedQuoteToken?: InputMaybe<DecimalNullableFilter>;
  collateral?: InputMaybe<DecimalFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  highPriceTick?: InputMaybe<DecimalNullableFilter>;
  id?: InputMaybe<IntFilter>;
  isLP?: InputMaybe<BoolFilter>;
  isSettled?: InputMaybe<BoolNullableFilter>;
  lowPriceTick?: InputMaybe<DecimalNullableFilter>;
  lpBaseToken?: InputMaybe<DecimalNullableFilter>;
  lpQuoteToken?: InputMaybe<DecimalNullableFilter>;
  market?: InputMaybe<MarketNullableRelationFilter>;
  marketId?: InputMaybe<IntNullableFilter>;
  owner?: InputMaybe<StringNullableFilter>;
  positionId?: InputMaybe<IntFilter>;
  quoteToken?: InputMaybe<DecimalNullableFilter>;
  transaction?: InputMaybe<TransactionListRelationFilter>;
};

export type PositionWhereUniqueInput = {
  AND?: InputMaybe<Array<PositionWhereInput>>;
  NOT?: InputMaybe<Array<PositionWhereInput>>;
  OR?: InputMaybe<Array<PositionWhereInput>>;
  baseToken?: InputMaybe<DecimalNullableFilter>;
  borrowedBaseToken?: InputMaybe<DecimalNullableFilter>;
  borrowedQuoteToken?: InputMaybe<DecimalNullableFilter>;
  collateral?: InputMaybe<DecimalFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  highPriceTick?: InputMaybe<DecimalNullableFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  isLP?: InputMaybe<BoolFilter>;
  isSettled?: InputMaybe<BoolNullableFilter>;
  lowPriceTick?: InputMaybe<DecimalNullableFilter>;
  lpBaseToken?: InputMaybe<DecimalNullableFilter>;
  lpQuoteToken?: InputMaybe<DecimalNullableFilter>;
  market?: InputMaybe<MarketNullableRelationFilter>;
  marketId?: InputMaybe<IntNullableFilter>;
  owner?: InputMaybe<StringNullableFilter>;
  positionId?: InputMaybe<IntFilter>;
  positionId_marketId?: InputMaybe<PositionPositionIdMarketIdCompoundUniqueInput>;
  quoteToken?: InputMaybe<DecimalNullableFilter>;
  transaction?: InputMaybe<TransactionListRelationFilter>;
};

export type Query = {
  __typename?: 'Query';
  aggregateCache_candle: AggregateCache_Candle;
  aggregateCategory: AggregateCategory;
  aggregateCrypto_prices: AggregateCrypto_Prices;
  aggregateEvent: AggregateEvent;
  aggregateMarket: AggregateMarket;
  aggregateMarket_group: AggregateMarket_Group;
  aggregatePosition: AggregatePosition;
  aggregateRender_job: AggregateRender_Job;
  aggregateResource: AggregateResource;
  aggregateResource_price: AggregateResource_Price;
  aggregateTransaction: AggregateTransaction;
  cache_candle?: Maybe<Cache_Candle>;
  cache_candles: Array<Cache_Candle>;
  categories: Array<Category>;
  category?: Maybe<Category>;
  event?: Maybe<Event>;
  events: Array<Event>;
  findFirstCache_candle?: Maybe<Cache_Candle>;
  findFirstCategory?: Maybe<Category>;
  findFirstCategoryOrThrow?: Maybe<Category>;
  findFirstCrypto_prices?: Maybe<Crypto_Prices>;
  findFirstEvent?: Maybe<Event>;
  findFirstEventOrThrow?: Maybe<Event>;
  findFirstMarket?: Maybe<Market>;
  findFirstMarketOrThrow?: Maybe<Market>;
  findFirstMarket_group?: Maybe<Market_Group>;
  findFirstMarket_groupOrThrow?: Maybe<Market_Group>;
  findFirstPosition?: Maybe<Position>;
  findFirstPositionOrThrow?: Maybe<Position>;
  findFirstRender_job?: Maybe<Render_Job>;
  findFirstResource?: Maybe<Resource>;
  findFirstResourceOrThrow?: Maybe<Resource>;
  findFirstResource_price?: Maybe<Resource_Price>;
  findFirstResource_priceOrThrow?: Maybe<Resource_Price>;
  findFirstTransaction?: Maybe<Transaction>;
  findFirstTransactionOrThrow?: Maybe<Transaction>;
  findManyCrypto_prices: Array<Crypto_Prices>;
  findUniqueCrypto_prices?: Maybe<Crypto_Prices>;
  getCategory?: Maybe<Category>;
  getEvent?: Maybe<Event>;
  getMarket?: Maybe<Market>;
  getMarketLeaderboard: Array<PnLType>;
  getMarket_group?: Maybe<Market_Group>;
  getPosition?: Maybe<Position>;
  getResource?: Maybe<Resource>;
  getResource_price?: Maybe<Resource_Price>;
  getTransaction?: Maybe<Transaction>;
  groupByCategory: Array<CategoryGroupBy>;
  groupByEvent: Array<EventGroupBy>;
  groupByMarket: Array<MarketGroupBy>;
  groupByMarket_group: Array<Market_GroupGroupBy>;
  groupByPosition: Array<PositionGroupBy>;
  groupByResource: Array<ResourceGroupBy>;
  groupByResource_price: Array<Resource_PriceGroupBy>;
  groupByTransaction: Array<TransactionGroupBy>;
  indexCandlesFromCache: CandleAndTimestampType;
  indexPriceAtTime?: Maybe<CandleType>;
  legacyMarketCandles: Array<CandleType>;
  market?: Maybe<Market>;
  marketCandlesFromCache: CandleAndTimestampType;
  marketGroup?: Maybe<Market_Group>;
  marketGroups: Array<Market_Group>;
  market_group?: Maybe<Market_Group>;
  market_groups: Array<Market_Group>;
  markets: Array<Market>;
  position?: Maybe<Position>;
  positions: Array<Position>;
  render_job?: Maybe<Render_Job>;
  render_jobs: Array<Render_Job>;
  resource?: Maybe<Resource>;
  resourceCandlesFromCache: CandleAndTimestampType;
  resourcePrices: Array<Resource_Price>;
  resourceTrailingAverageCandlesFromCache: CandleAndTimestampType;
  resource_price?: Maybe<Resource_Price>;
  resource_prices: Array<Resource_Price>;
  resources: Array<Resource>;
  totalVolumeByMarket: Scalars['Float']['output'];
  transaction?: Maybe<Transaction>;
  transactions: Array<Transaction>;
};


export type QueryAggregateCache_CandleArgs = {
  cursor?: InputMaybe<Cache_CandleWhereUniqueInput>;
  orderBy?: InputMaybe<Array<Cache_CandleOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Cache_CandleWhereInput>;
};


export type QueryAggregateCategoryArgs = {
  cursor?: InputMaybe<CategoryWhereUniqueInput>;
  orderBy?: InputMaybe<Array<CategoryOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryAggregateCrypto_PricesArgs = {
  cursor?: InputMaybe<Crypto_PricesWhereUniqueInput>;
  orderBy?: InputMaybe<Array<Crypto_PricesOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Crypto_PricesWhereInput>;
};


export type QueryAggregateEventArgs = {
  cursor?: InputMaybe<EventWhereUniqueInput>;
  orderBy?: InputMaybe<Array<EventOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<EventWhereInput>;
};


export type QueryAggregateMarketArgs = {
  cursor?: InputMaybe<MarketWhereUniqueInput>;
  orderBy?: InputMaybe<Array<MarketOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketWhereInput>;
};


export type QueryAggregateMarket_GroupArgs = {
  cursor?: InputMaybe<Market_GroupWhereUniqueInput>;
  orderBy?: InputMaybe<Array<Market_GroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Market_GroupWhereInput>;
};


export type QueryAggregatePositionArgs = {
  cursor?: InputMaybe<PositionWhereUniqueInput>;
  orderBy?: InputMaybe<Array<PositionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PositionWhereInput>;
};


export type QueryAggregateRender_JobArgs = {
  cursor?: InputMaybe<Render_JobWhereUniqueInput>;
  orderBy?: InputMaybe<Array<Render_JobOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Render_JobWhereInput>;
};


export type QueryAggregateResourceArgs = {
  cursor?: InputMaybe<ResourceWhereUniqueInput>;
  orderBy?: InputMaybe<Array<ResourceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourceWhereInput>;
};


export type QueryAggregateResource_PriceArgs = {
  cursor?: InputMaybe<Resource_PriceWhereUniqueInput>;
  orderBy?: InputMaybe<Array<Resource_PriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Resource_PriceWhereInput>;
};


export type QueryAggregateTransactionArgs = {
  cursor?: InputMaybe<TransactionWhereUniqueInput>;
  orderBy?: InputMaybe<Array<TransactionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<TransactionWhereInput>;
};


export type QueryCache_CandleArgs = {
  where: Cache_CandleWhereUniqueInput;
};


export type QueryCache_CandlesArgs = {
  cursor?: InputMaybe<Cache_CandleWhereUniqueInput>;
  distinct?: InputMaybe<Array<Cache_CandleScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Cache_CandleOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Cache_CandleWhereInput>;
};


export type QueryCategoriesArgs = {
  cursor?: InputMaybe<CategoryWhereUniqueInput>;
  distinct?: InputMaybe<Array<CategoryScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<CategoryOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryCategoryArgs = {
  where: CategoryWhereUniqueInput;
};


export type QueryEventArgs = {
  where: EventWhereUniqueInput;
};


export type QueryEventsArgs = {
  cursor?: InputMaybe<EventWhereUniqueInput>;
  distinct?: InputMaybe<Array<EventScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<EventOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<EventWhereInput>;
};


export type QueryFindFirstCache_CandleArgs = {
  cursor?: InputMaybe<Cache_CandleWhereUniqueInput>;
  distinct?: InputMaybe<Array<Cache_CandleScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Cache_CandleOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Cache_CandleWhereInput>;
};


export type QueryFindFirstCategoryArgs = {
  cursor?: InputMaybe<CategoryWhereUniqueInput>;
  distinct?: InputMaybe<Array<CategoryScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<CategoryOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryFindFirstCategoryOrThrowArgs = {
  cursor?: InputMaybe<CategoryWhereUniqueInput>;
  distinct?: InputMaybe<Array<CategoryScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<CategoryOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryFindFirstCrypto_PricesArgs = {
  cursor?: InputMaybe<Crypto_PricesWhereUniqueInput>;
  distinct?: InputMaybe<Array<Crypto_PricesScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Crypto_PricesOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Crypto_PricesWhereInput>;
};


export type QueryFindFirstEventArgs = {
  cursor?: InputMaybe<EventWhereUniqueInput>;
  distinct?: InputMaybe<Array<EventScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<EventOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<EventWhereInput>;
};


export type QueryFindFirstEventOrThrowArgs = {
  cursor?: InputMaybe<EventWhereUniqueInput>;
  distinct?: InputMaybe<Array<EventScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<EventOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<EventWhereInput>;
};


export type QueryFindFirstMarketArgs = {
  cursor?: InputMaybe<MarketWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketWhereInput>;
};


export type QueryFindFirstMarketOrThrowArgs = {
  cursor?: InputMaybe<MarketWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketWhereInput>;
};


export type QueryFindFirstMarket_GroupArgs = {
  cursor?: InputMaybe<Market_GroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<Market_GroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Market_GroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Market_GroupWhereInput>;
};


export type QueryFindFirstMarket_GroupOrThrowArgs = {
  cursor?: InputMaybe<Market_GroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<Market_GroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Market_GroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Market_GroupWhereInput>;
};


export type QueryFindFirstPositionArgs = {
  cursor?: InputMaybe<PositionWhereUniqueInput>;
  distinct?: InputMaybe<Array<PositionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<PositionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PositionWhereInput>;
};


export type QueryFindFirstPositionOrThrowArgs = {
  cursor?: InputMaybe<PositionWhereUniqueInput>;
  distinct?: InputMaybe<Array<PositionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<PositionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PositionWhereInput>;
};


export type QueryFindFirstRender_JobArgs = {
  cursor?: InputMaybe<Render_JobWhereUniqueInput>;
  distinct?: InputMaybe<Array<Render_JobScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Render_JobOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Render_JobWhereInput>;
};


export type QueryFindFirstResourceArgs = {
  cursor?: InputMaybe<ResourceWhereUniqueInput>;
  distinct?: InputMaybe<Array<ResourceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ResourceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourceWhereInput>;
};


export type QueryFindFirstResourceOrThrowArgs = {
  cursor?: InputMaybe<ResourceWhereUniqueInput>;
  distinct?: InputMaybe<Array<ResourceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ResourceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourceWhereInput>;
};


export type QueryFindFirstResource_PriceArgs = {
  cursor?: InputMaybe<Resource_PriceWhereUniqueInput>;
  distinct?: InputMaybe<Array<Resource_PriceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Resource_PriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Resource_PriceWhereInput>;
};


export type QueryFindFirstResource_PriceOrThrowArgs = {
  cursor?: InputMaybe<Resource_PriceWhereUniqueInput>;
  distinct?: InputMaybe<Array<Resource_PriceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Resource_PriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Resource_PriceWhereInput>;
};


export type QueryFindFirstTransactionArgs = {
  cursor?: InputMaybe<TransactionWhereUniqueInput>;
  distinct?: InputMaybe<Array<TransactionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<TransactionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<TransactionWhereInput>;
};


export type QueryFindFirstTransactionOrThrowArgs = {
  cursor?: InputMaybe<TransactionWhereUniqueInput>;
  distinct?: InputMaybe<Array<TransactionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<TransactionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<TransactionWhereInput>;
};


export type QueryFindManyCrypto_PricesArgs = {
  cursor?: InputMaybe<Crypto_PricesWhereUniqueInput>;
  distinct?: InputMaybe<Array<Crypto_PricesScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Crypto_PricesOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Crypto_PricesWhereInput>;
};


export type QueryFindUniqueCrypto_PricesArgs = {
  where: Crypto_PricesWhereUniqueInput;
};


export type QueryGetCategoryArgs = {
  where: CategoryWhereUniqueInput;
};


export type QueryGetEventArgs = {
  where: EventWhereUniqueInput;
};


export type QueryGetMarketArgs = {
  where: MarketWhereUniqueInput;
};


export type QueryGetMarketLeaderboardArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  marketId: Scalars['String']['input'];
};


export type QueryGetMarket_GroupArgs = {
  where: Market_GroupWhereUniqueInput;
};


export type QueryGetPositionArgs = {
  where: PositionWhereUniqueInput;
};


export type QueryGetResourceArgs = {
  where: ResourceWhereUniqueInput;
};


export type QueryGetResource_PriceArgs = {
  where: Resource_PriceWhereUniqueInput;
};


export type QueryGetTransactionArgs = {
  where: TransactionWhereUniqueInput;
};


export type QueryGroupByCategoryArgs = {
  by: Array<CategoryScalarFieldEnum>;
  having?: InputMaybe<CategoryScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<CategoryOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryGroupByEventArgs = {
  by: Array<EventScalarFieldEnum>;
  having?: InputMaybe<EventScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<EventOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<EventWhereInput>;
};


export type QueryGroupByMarketArgs = {
  by: Array<MarketScalarFieldEnum>;
  having?: InputMaybe<MarketScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<MarketOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketWhereInput>;
};


export type QueryGroupByMarket_GroupArgs = {
  by: Array<Market_GroupScalarFieldEnum>;
  having?: InputMaybe<Market_GroupScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<Market_GroupOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Market_GroupWhereInput>;
};


export type QueryGroupByPositionArgs = {
  by: Array<PositionScalarFieldEnum>;
  having?: InputMaybe<PositionScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<PositionOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PositionWhereInput>;
};


export type QueryGroupByResourceArgs = {
  by: Array<ResourceScalarFieldEnum>;
  having?: InputMaybe<ResourceScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<ResourceOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourceWhereInput>;
};


export type QueryGroupByResource_PriceArgs = {
  by: Array<Resource_PriceScalarFieldEnum>;
  having?: InputMaybe<Resource_PriceScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<Resource_PriceOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Resource_PriceWhereInput>;
};


export type QueryGroupByTransactionArgs = {
  by: Array<TransactionScalarFieldEnum>;
  having?: InputMaybe<TransactionScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<TransactionOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<TransactionWhereInput>;
};


export type QueryIndexCandlesFromCacheArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  marketId: Scalars['String']['input'];
  to: Scalars['Int']['input'];
};


export type QueryIndexPriceAtTimeArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  marketId: Scalars['String']['input'];
  timestamp: Scalars['Int']['input'];
};


export type QueryLegacyMarketCandlesArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  marketId: Scalars['String']['input'];
  to: Scalars['Int']['input'];
};


export type QueryMarketArgs = {
  where: MarketWhereUniqueInput;
};


export type QueryMarketCandlesFromCacheArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  marketId: Scalars['String']['input'];
  to: Scalars['Int']['input'];
};


export type QueryMarketGroupArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
};


export type QueryMarketGroupsArgs = {
  baseTokenName?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  collateralAsset?: InputMaybe<Scalars['String']['input']>;
};


export type QueryMarket_GroupArgs = {
  where: Market_GroupWhereUniqueInput;
};


export type QueryMarket_GroupsArgs = {
  cursor?: InputMaybe<Market_GroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<Market_GroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Market_GroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Market_GroupWhereInput>;
};


export type QueryMarketsArgs = {
  chainId: Scalars['Int']['input'];
  marketAddress: Scalars['String']['input'];
  marketId: Scalars['Int']['input'];
};


export type QueryPositionArgs = {
  where: PositionWhereUniqueInput;
};


export type QueryPositionsArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  marketAddress?: InputMaybe<Scalars['String']['input']>;
  owner?: InputMaybe<Scalars['String']['input']>;
};


export type QueryRender_JobArgs = {
  where: Render_JobWhereUniqueInput;
};


export type QueryRender_JobsArgs = {
  cursor?: InputMaybe<Render_JobWhereUniqueInput>;
  distinct?: InputMaybe<Array<Render_JobScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Render_JobOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Render_JobWhereInput>;
};


export type QueryResourceArgs = {
  slug: Scalars['String']['input'];
};


export type QueryResourceCandlesFromCacheArgs = {
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  slug: Scalars['String']['input'];
  to: Scalars['Int']['input'];
};


export type QueryResourceTrailingAverageCandlesFromCacheArgs = {
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  slug: Scalars['String']['input'];
  to: Scalars['Int']['input'];
  trailingAvgTime: Scalars['Int']['input'];
};


export type QueryResource_PriceArgs = {
  where: Resource_PriceWhereUniqueInput;
};


export type QueryResource_PricesArgs = {
  cursor?: InputMaybe<Resource_PriceWhereUniqueInput>;
  distinct?: InputMaybe<Array<Resource_PriceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<Resource_PriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Resource_PriceWhereInput>;
};


export type QueryResourcesArgs = {
  categorySlug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTotalVolumeByMarketArgs = {
  chainId: Scalars['Int']['input'];
  marketAddress: Scalars['String']['input'];
  marketId: Scalars['Int']['input'];
};


export type QueryTransactionArgs = {
  where: TransactionWhereUniqueInput;
};


export type QueryTransactionsArgs = {
  positionId?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryMode =
  | 'default'
  | 'insensitive';

export type Render_Job = {
  __typename?: 'Render_job';
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  jobId: Scalars['String']['output'];
  serviceId: Scalars['String']['output'];
};

export type Render_JobAvgAggregate = {
  __typename?: 'Render_jobAvgAggregate';
  id?: Maybe<Scalars['Float']['output']>;
};

export type Render_JobCountAggregate = {
  __typename?: 'Render_jobCountAggregate';
  _all: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  jobId: Scalars['Int']['output'];
  serviceId: Scalars['Int']['output'];
};

export type Render_JobMaxAggregate = {
  __typename?: 'Render_jobMaxAggregate';
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  jobId?: Maybe<Scalars['String']['output']>;
  serviceId?: Maybe<Scalars['String']['output']>;
};

export type Render_JobMinAggregate = {
  __typename?: 'Render_jobMinAggregate';
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  jobId?: Maybe<Scalars['String']['output']>;
  serviceId?: Maybe<Scalars['String']['output']>;
};

export type Render_JobOrderByWithRelationInput = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  jobId?: InputMaybe<SortOrder>;
  serviceId?: InputMaybe<SortOrder>;
};

export type Render_JobScalarFieldEnum =
  | 'createdAt'
  | 'id'
  | 'jobId'
  | 'serviceId';

export type Render_JobSumAggregate = {
  __typename?: 'Render_jobSumAggregate';
  id?: Maybe<Scalars['Int']['output']>;
};

export type Render_JobWhereInput = {
  AND?: InputMaybe<Array<Render_JobWhereInput>>;
  NOT?: InputMaybe<Array<Render_JobWhereInput>>;
  OR?: InputMaybe<Array<Render_JobWhereInput>>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  jobId?: InputMaybe<StringFilter>;
  serviceId?: InputMaybe<StringFilter>;
};

export type Render_JobWhereUniqueInput = {
  AND?: InputMaybe<Array<Render_JobWhereInput>>;
  NOT?: InputMaybe<Array<Render_JobWhereInput>>;
  OR?: InputMaybe<Array<Render_JobWhereInput>>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  jobId?: InputMaybe<StringFilter>;
  serviceId?: InputMaybe<StringFilter>;
};

export type Resource = {
  __typename?: 'Resource';
  _count?: Maybe<ResourceCount>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type ResourceAvgAggregate = {
  __typename?: 'ResourceAvgAggregate';
  categoryId?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
};

export type ResourceAvgOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
};

export type ResourceCount = {
  __typename?: 'ResourceCount';
  market_group: Scalars['Int']['output'];
  resource_price: Scalars['Int']['output'];
};


export type ResourceCountMarket_GroupArgs = {
  where?: InputMaybe<Market_GroupWhereInput>;
};


export type ResourceCountResource_PriceArgs = {
  where?: InputMaybe<Resource_PriceWhereInput>;
};

export type ResourceCountAggregate = {
  __typename?: 'ResourceCountAggregate';
  _all: Scalars['Int']['output'];
  categoryId: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['Int']['output'];
  slug: Scalars['Int']['output'];
};

export type ResourceCountOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
};

export type ResourceGroupBy = {
  __typename?: 'ResourceGroupBy';
  _avg?: Maybe<ResourceAvgAggregate>;
  _count?: Maybe<ResourceCountAggregate>;
  _max?: Maybe<ResourceMaxAggregate>;
  _min?: Maybe<ResourceMinAggregate>;
  _sum?: Maybe<ResourceSumAggregate>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type ResourceListRelationFilter = {
  every?: InputMaybe<ResourceWhereInput>;
  none?: InputMaybe<ResourceWhereInput>;
  some?: InputMaybe<ResourceWhereInput>;
};

export type ResourceMaxAggregate = {
  __typename?: 'ResourceMaxAggregate';
  categoryId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  slug?: Maybe<Scalars['String']['output']>;
};

export type ResourceMaxOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
};

export type ResourceMinAggregate = {
  __typename?: 'ResourceMinAggregate';
  categoryId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  slug?: Maybe<Scalars['String']['output']>;
};

export type ResourceMinOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
};

export type ResourceNullableRelationFilter = {
  is?: InputMaybe<ResourceWhereInput>;
  isNot?: InputMaybe<ResourceWhereInput>;
};

export type ResourceOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type ResourceOrderByWithAggregationInput = {
  _avg?: InputMaybe<ResourceAvgOrderByAggregateInput>;
  _count?: InputMaybe<ResourceCountOrderByAggregateInput>;
  _max?: InputMaybe<ResourceMaxOrderByAggregateInput>;
  _min?: InputMaybe<ResourceMinOrderByAggregateInput>;
  _sum?: InputMaybe<ResourceSumOrderByAggregateInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
};

export type ResourceOrderByWithRelationInput = {
  category?: InputMaybe<CategoryOrderByWithRelationInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  market_group?: InputMaybe<Market_GroupOrderByRelationAggregateInput>;
  name?: InputMaybe<SortOrder>;
  resource_price?: InputMaybe<Resource_PriceOrderByRelationAggregateInput>;
  slug?: InputMaybe<SortOrder>;
};

export type ResourceScalarFieldEnum =
  | 'categoryId'
  | 'createdAt'
  | 'id'
  | 'name'
  | 'slug';

export type ResourceScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<ResourceScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<ResourceScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<ResourceScalarWhereWithAggregatesInput>>;
  categoryId?: InputMaybe<IntNullableWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  name?: InputMaybe<StringWithAggregatesFilter>;
  slug?: InputMaybe<StringWithAggregatesFilter>;
};

export type ResourceSumAggregate = {
  __typename?: 'ResourceSumAggregate';
  categoryId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
};

export type ResourceSumOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
};

export type ResourceWhereInput = {
  AND?: InputMaybe<Array<ResourceWhereInput>>;
  NOT?: InputMaybe<Array<ResourceWhereInput>>;
  OR?: InputMaybe<Array<ResourceWhereInput>>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  market_group?: InputMaybe<Market_GroupListRelationFilter>;
  name?: InputMaybe<StringFilter>;
  resource_price?: InputMaybe<Resource_PriceListRelationFilter>;
  slug?: InputMaybe<StringFilter>;
};

export type ResourceWhereUniqueInput = {
  AND?: InputMaybe<Array<ResourceWhereInput>>;
  NOT?: InputMaybe<Array<ResourceWhereInput>>;
  OR?: InputMaybe<Array<ResourceWhereInput>>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  market_group?: InputMaybe<Market_GroupListRelationFilter>;
  name?: InputMaybe<Scalars['String']['input']>;
  resource_price?: InputMaybe<Resource_PriceListRelationFilter>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type Resource_Price = {
  __typename?: 'Resource_price';
  blockNumber: Scalars['Int']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  feePaid: Scalars['Decimal']['output'];
  id: Scalars['Int']['output'];
  resourceId?: Maybe<Scalars['Int']['output']>;
  timestamp: Scalars['Int']['output'];
  used: Scalars['Decimal']['output'];
  value: Scalars['Decimal']['output'];
};

export type Resource_PriceAvgAggregate = {
  __typename?: 'Resource_priceAvgAggregate';
  blockNumber?: Maybe<Scalars['Float']['output']>;
  feePaid?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  resourceId?: Maybe<Scalars['Float']['output']>;
  timestamp?: Maybe<Scalars['Float']['output']>;
  used?: Maybe<Scalars['Decimal']['output']>;
  value?: Maybe<Scalars['Decimal']['output']>;
};

export type Resource_PriceAvgOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type Resource_PriceCountAggregate = {
  __typename?: 'Resource_priceCountAggregate';
  _all: Scalars['Int']['output'];
  blockNumber: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  feePaid: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  resourceId: Scalars['Int']['output'];
  timestamp: Scalars['Int']['output'];
  used: Scalars['Int']['output'];
  value: Scalars['Int']['output'];
};

export type Resource_PriceCountOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type Resource_PriceGroupBy = {
  __typename?: 'Resource_priceGroupBy';
  _avg?: Maybe<Resource_PriceAvgAggregate>;
  _count?: Maybe<Resource_PriceCountAggregate>;
  _max?: Maybe<Resource_PriceMaxAggregate>;
  _min?: Maybe<Resource_PriceMinAggregate>;
  _sum?: Maybe<Resource_PriceSumAggregate>;
  blockNumber: Scalars['Int']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  feePaid: Scalars['Decimal']['output'];
  id: Scalars['Int']['output'];
  resourceId?: Maybe<Scalars['Int']['output']>;
  timestamp: Scalars['Int']['output'];
  used: Scalars['Decimal']['output'];
  value: Scalars['Decimal']['output'];
};

export type Resource_PriceListRelationFilter = {
  every?: InputMaybe<Resource_PriceWhereInput>;
  none?: InputMaybe<Resource_PriceWhereInput>;
  some?: InputMaybe<Resource_PriceWhereInput>;
};

export type Resource_PriceMaxAggregate = {
  __typename?: 'Resource_priceMaxAggregate';
  blockNumber?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  feePaid?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['Int']['output']>;
  used?: Maybe<Scalars['Decimal']['output']>;
  value?: Maybe<Scalars['Decimal']['output']>;
};

export type Resource_PriceMaxOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type Resource_PriceMinAggregate = {
  __typename?: 'Resource_priceMinAggregate';
  blockNumber?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  feePaid?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['Int']['output']>;
  used?: Maybe<Scalars['Decimal']['output']>;
  value?: Maybe<Scalars['Decimal']['output']>;
};

export type Resource_PriceMinOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type Resource_PriceOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type Resource_PriceOrderByWithAggregationInput = {
  _avg?: InputMaybe<Resource_PriceAvgOrderByAggregateInput>;
  _count?: InputMaybe<Resource_PriceCountOrderByAggregateInput>;
  _max?: InputMaybe<Resource_PriceMaxOrderByAggregateInput>;
  _min?: InputMaybe<Resource_PriceMinOrderByAggregateInput>;
  _sum?: InputMaybe<Resource_PriceSumOrderByAggregateInput>;
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrderInput>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type Resource_PriceOrderByWithRelationInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resource?: InputMaybe<ResourceOrderByWithRelationInput>;
  resourceId?: InputMaybe<SortOrderInput>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type Resource_PriceScalarFieldEnum =
  | 'blockNumber'
  | 'createdAt'
  | 'feePaid'
  | 'id'
  | 'resourceId'
  | 'timestamp'
  | 'used'
  | 'value';

export type Resource_PriceScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<Resource_PriceScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<Resource_PriceScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<Resource_PriceScalarWhereWithAggregatesInput>>;
  blockNumber?: InputMaybe<IntWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  feePaid?: InputMaybe<DecimalWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  resourceId?: InputMaybe<IntNullableWithAggregatesFilter>;
  timestamp?: InputMaybe<IntWithAggregatesFilter>;
  used?: InputMaybe<DecimalWithAggregatesFilter>;
  value?: InputMaybe<DecimalWithAggregatesFilter>;
};

export type Resource_PriceSumAggregate = {
  __typename?: 'Resource_priceSumAggregate';
  blockNumber?: Maybe<Scalars['Int']['output']>;
  feePaid?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['Int']['output']>;
  used?: Maybe<Scalars['Decimal']['output']>;
  value?: Maybe<Scalars['Decimal']['output']>;
};

export type Resource_PriceSumOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type Resource_PriceWhereInput = {
  AND?: InputMaybe<Array<Resource_PriceWhereInput>>;
  NOT?: InputMaybe<Array<Resource_PriceWhereInput>>;
  OR?: InputMaybe<Array<Resource_PriceWhereInput>>;
  blockNumber?: InputMaybe<IntFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  feePaid?: InputMaybe<DecimalFilter>;
  id?: InputMaybe<IntFilter>;
  resource?: InputMaybe<ResourceNullableRelationFilter>;
  resourceId?: InputMaybe<IntNullableFilter>;
  timestamp?: InputMaybe<IntFilter>;
  used?: InputMaybe<DecimalFilter>;
  value?: InputMaybe<DecimalFilter>;
};

export type Resource_PriceWhereUniqueInput = {
  AND?: InputMaybe<Array<Resource_PriceWhereInput>>;
  NOT?: InputMaybe<Array<Resource_PriceWhereInput>>;
  OR?: InputMaybe<Array<Resource_PriceWhereInput>>;
  blockNumber?: InputMaybe<IntFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  feePaid?: InputMaybe<DecimalFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  resource?: InputMaybe<ResourceNullableRelationFilter>;
  resourceId?: InputMaybe<IntNullableFilter>;
  resourceId_timestamp?: InputMaybe<Resource_PriceResourceIdTimestampCompoundUniqueInput>;
  timestamp?: InputMaybe<IntFilter>;
  used?: InputMaybe<DecimalFilter>;
  value?: InputMaybe<DecimalFilter>;
};

export type SortOrder =
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

export type StringNullableWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntNullableFilter>;
  _max?: InputMaybe<NestedStringNullableFilter>;
  _min?: InputMaybe<NestedStringNullableFilter>;
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  equals?: InputMaybe<Scalars['String']['input']>;
  gt?: InputMaybe<Scalars['String']['input']>;
  gte?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  lt?: InputMaybe<Scalars['String']['input']>;
  lte?: InputMaybe<Scalars['String']['input']>;
  mode?: InputMaybe<QueryMode>;
  not?: InputMaybe<NestedStringNullableWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type StringWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedStringFilter>;
  _min?: InputMaybe<NestedStringFilter>;
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  equals?: InputMaybe<Scalars['String']['input']>;
  gt?: InputMaybe<Scalars['String']['input']>;
  gte?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  lt?: InputMaybe<Scalars['String']['input']>;
  lte?: InputMaybe<Scalars['String']['input']>;
  mode?: InputMaybe<QueryMode>;
  not?: InputMaybe<NestedStringWithAggregatesFilter>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type Transaction = {
  __typename?: 'Transaction';
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral: Scalars['Decimal']['output'];
  collateralTransferId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  eventId?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  lpBaseDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  marketPriceId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
  tradeRatioD18?: Maybe<Scalars['Decimal']['output']>;
  type: Transaction_Type_Enum;
};

export type TransactionAvgAggregate = {
  __typename?: 'TransactionAvgAggregate';
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral?: Maybe<Scalars['Decimal']['output']>;
  collateralTransferId?: Maybe<Scalars['Float']['output']>;
  eventId?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  lpBaseDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  marketPriceId?: Maybe<Scalars['Float']['output']>;
  positionId?: Maybe<Scalars['Float']['output']>;
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
  tradeRatioD18?: Maybe<Scalars['Decimal']['output']>;
};

export type TransactionAvgOrderByAggregateInput = {
  baseToken?: InputMaybe<SortOrder>;
  borrowedBaseToken?: InputMaybe<SortOrder>;
  borrowedQuoteToken?: InputMaybe<SortOrder>;
  collateral?: InputMaybe<SortOrder>;
  collateralTransferId?: InputMaybe<SortOrder>;
  eventId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lpBaseDeltaToken?: InputMaybe<SortOrder>;
  lpQuoteDeltaToken?: InputMaybe<SortOrder>;
  marketPriceId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrder>;
  tradeRatioD18?: InputMaybe<SortOrder>;
};

export type TransactionCountAggregate = {
  __typename?: 'TransactionCountAggregate';
  _all: Scalars['Int']['output'];
  baseToken: Scalars['Int']['output'];
  borrowedBaseToken: Scalars['Int']['output'];
  borrowedQuoteToken: Scalars['Int']['output'];
  collateral: Scalars['Int']['output'];
  collateralTransferId: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  eventId: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  lpBaseDeltaToken: Scalars['Int']['output'];
  lpQuoteDeltaToken: Scalars['Int']['output'];
  marketPriceId: Scalars['Int']['output'];
  positionId: Scalars['Int']['output'];
  quoteToken: Scalars['Int']['output'];
  tradeRatioD18: Scalars['Int']['output'];
  type: Scalars['Int']['output'];
};

export type TransactionCountOrderByAggregateInput = {
  baseToken?: InputMaybe<SortOrder>;
  borrowedBaseToken?: InputMaybe<SortOrder>;
  borrowedQuoteToken?: InputMaybe<SortOrder>;
  collateral?: InputMaybe<SortOrder>;
  collateralTransferId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  eventId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lpBaseDeltaToken?: InputMaybe<SortOrder>;
  lpQuoteDeltaToken?: InputMaybe<SortOrder>;
  marketPriceId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrder>;
  tradeRatioD18?: InputMaybe<SortOrder>;
  type?: InputMaybe<SortOrder>;
};

export type TransactionGroupBy = {
  __typename?: 'TransactionGroupBy';
  _avg?: Maybe<TransactionAvgAggregate>;
  _count?: Maybe<TransactionCountAggregate>;
  _max?: Maybe<TransactionMaxAggregate>;
  _min?: Maybe<TransactionMinAggregate>;
  _sum?: Maybe<TransactionSumAggregate>;
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral: Scalars['Decimal']['output'];
  collateralTransferId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  eventId?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  lpBaseDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  marketPriceId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
  tradeRatioD18?: Maybe<Scalars['Decimal']['output']>;
  type: Transaction_Type_Enum;
};

export type TransactionListRelationFilter = {
  every?: InputMaybe<TransactionWhereInput>;
  none?: InputMaybe<TransactionWhereInput>;
  some?: InputMaybe<TransactionWhereInput>;
};

export type TransactionMaxAggregate = {
  __typename?: 'TransactionMaxAggregate';
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral?: Maybe<Scalars['Decimal']['output']>;
  collateralTransferId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  eventId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lpBaseDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  marketPriceId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
  tradeRatioD18?: Maybe<Scalars['Decimal']['output']>;
  type?: Maybe<Transaction_Type_Enum>;
};

export type TransactionMaxOrderByAggregateInput = {
  baseToken?: InputMaybe<SortOrder>;
  borrowedBaseToken?: InputMaybe<SortOrder>;
  borrowedQuoteToken?: InputMaybe<SortOrder>;
  collateral?: InputMaybe<SortOrder>;
  collateralTransferId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  eventId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lpBaseDeltaToken?: InputMaybe<SortOrder>;
  lpQuoteDeltaToken?: InputMaybe<SortOrder>;
  marketPriceId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrder>;
  tradeRatioD18?: InputMaybe<SortOrder>;
  type?: InputMaybe<SortOrder>;
};

export type TransactionMinAggregate = {
  __typename?: 'TransactionMinAggregate';
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral?: Maybe<Scalars['Decimal']['output']>;
  collateralTransferId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  eventId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lpBaseDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  marketPriceId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
  tradeRatioD18?: Maybe<Scalars['Decimal']['output']>;
  type?: Maybe<Transaction_Type_Enum>;
};

export type TransactionMinOrderByAggregateInput = {
  baseToken?: InputMaybe<SortOrder>;
  borrowedBaseToken?: InputMaybe<SortOrder>;
  borrowedQuoteToken?: InputMaybe<SortOrder>;
  collateral?: InputMaybe<SortOrder>;
  collateralTransferId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  eventId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lpBaseDeltaToken?: InputMaybe<SortOrder>;
  lpQuoteDeltaToken?: InputMaybe<SortOrder>;
  marketPriceId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrder>;
  tradeRatioD18?: InputMaybe<SortOrder>;
  type?: InputMaybe<SortOrder>;
};

export type TransactionNullableRelationFilter = {
  is?: InputMaybe<TransactionWhereInput>;
  isNot?: InputMaybe<TransactionWhereInput>;
};

export type TransactionOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type TransactionOrderByWithAggregationInput = {
  _avg?: InputMaybe<TransactionAvgOrderByAggregateInput>;
  _count?: InputMaybe<TransactionCountOrderByAggregateInput>;
  _max?: InputMaybe<TransactionMaxOrderByAggregateInput>;
  _min?: InputMaybe<TransactionMinOrderByAggregateInput>;
  _sum?: InputMaybe<TransactionSumOrderByAggregateInput>;
  baseToken?: InputMaybe<SortOrderInput>;
  borrowedBaseToken?: InputMaybe<SortOrderInput>;
  borrowedQuoteToken?: InputMaybe<SortOrderInput>;
  collateral?: InputMaybe<SortOrder>;
  collateralTransferId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  eventId?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  lpBaseDeltaToken?: InputMaybe<SortOrderInput>;
  lpQuoteDeltaToken?: InputMaybe<SortOrderInput>;
  marketPriceId?: InputMaybe<SortOrderInput>;
  positionId?: InputMaybe<SortOrderInput>;
  quoteToken?: InputMaybe<SortOrderInput>;
  tradeRatioD18?: InputMaybe<SortOrderInput>;
  type?: InputMaybe<SortOrder>;
};

export type TransactionOrderByWithRelationInput = {
  baseToken?: InputMaybe<SortOrderInput>;
  borrowedBaseToken?: InputMaybe<SortOrderInput>;
  borrowedQuoteToken?: InputMaybe<SortOrderInput>;
  collateral?: InputMaybe<SortOrder>;
  collateralTransferId?: InputMaybe<SortOrderInput>;
  collateral_transfer?: InputMaybe<Collateral_TransferOrderByWithRelationInput>;
  createdAt?: InputMaybe<SortOrder>;
  event?: InputMaybe<EventOrderByWithRelationInput>;
  eventId?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  lpBaseDeltaToken?: InputMaybe<SortOrderInput>;
  lpQuoteDeltaToken?: InputMaybe<SortOrderInput>;
  marketPriceId?: InputMaybe<SortOrderInput>;
  market_price?: InputMaybe<Market_PriceOrderByWithRelationInput>;
  position?: InputMaybe<PositionOrderByWithRelationInput>;
  positionId?: InputMaybe<SortOrderInput>;
  quoteToken?: InputMaybe<SortOrderInput>;
  tradeRatioD18?: InputMaybe<SortOrderInput>;
  type?: InputMaybe<SortOrder>;
};

export type TransactionScalarFieldEnum =
  | 'baseToken'
  | 'borrowedBaseToken'
  | 'borrowedQuoteToken'
  | 'collateral'
  | 'collateralTransferId'
  | 'createdAt'
  | 'eventId'
  | 'id'
  | 'lpBaseDeltaToken'
  | 'lpQuoteDeltaToken'
  | 'marketPriceId'
  | 'positionId'
  | 'quoteToken'
  | 'tradeRatioD18'
  | 'type';

export type TransactionScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<TransactionScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<TransactionScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<TransactionScalarWhereWithAggregatesInput>>;
  baseToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  borrowedBaseToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  borrowedQuoteToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  collateral?: InputMaybe<DecimalWithAggregatesFilter>;
  collateralTransferId?: InputMaybe<IntNullableWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  eventId?: InputMaybe<IntNullableWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  lpBaseDeltaToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  lpQuoteDeltaToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  marketPriceId?: InputMaybe<IntNullableWithAggregatesFilter>;
  positionId?: InputMaybe<IntNullableWithAggregatesFilter>;
  quoteToken?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  tradeRatioD18?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  type?: InputMaybe<Enumtransaction_Type_EnumWithAggregatesFilter>;
};

export type TransactionSumAggregate = {
  __typename?: 'TransactionSumAggregate';
  baseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedBaseToken?: Maybe<Scalars['Decimal']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['Decimal']['output']>;
  collateral?: Maybe<Scalars['Decimal']['output']>;
  collateralTransferId?: Maybe<Scalars['Int']['output']>;
  eventId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lpBaseDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['Decimal']['output']>;
  marketPriceId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['Decimal']['output']>;
  tradeRatioD18?: Maybe<Scalars['Decimal']['output']>;
};

export type TransactionSumOrderByAggregateInput = {
  baseToken?: InputMaybe<SortOrder>;
  borrowedBaseToken?: InputMaybe<SortOrder>;
  borrowedQuoteToken?: InputMaybe<SortOrder>;
  collateral?: InputMaybe<SortOrder>;
  collateralTransferId?: InputMaybe<SortOrder>;
  eventId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lpBaseDeltaToken?: InputMaybe<SortOrder>;
  lpQuoteDeltaToken?: InputMaybe<SortOrder>;
  marketPriceId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
  quoteToken?: InputMaybe<SortOrder>;
  tradeRatioD18?: InputMaybe<SortOrder>;
};

export type TransactionWhereInput = {
  AND?: InputMaybe<Array<TransactionWhereInput>>;
  NOT?: InputMaybe<Array<TransactionWhereInput>>;
  OR?: InputMaybe<Array<TransactionWhereInput>>;
  baseToken?: InputMaybe<DecimalNullableFilter>;
  borrowedBaseToken?: InputMaybe<DecimalNullableFilter>;
  borrowedQuoteToken?: InputMaybe<DecimalNullableFilter>;
  collateral?: InputMaybe<DecimalFilter>;
  collateralTransferId?: InputMaybe<IntNullableFilter>;
  collateral_transfer?: InputMaybe<Collateral_TransferNullableRelationFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  event?: InputMaybe<EventNullableRelationFilter>;
  eventId?: InputMaybe<IntNullableFilter>;
  id?: InputMaybe<IntFilter>;
  lpBaseDeltaToken?: InputMaybe<DecimalNullableFilter>;
  lpQuoteDeltaToken?: InputMaybe<DecimalNullableFilter>;
  marketPriceId?: InputMaybe<IntNullableFilter>;
  market_price?: InputMaybe<Market_PriceNullableRelationFilter>;
  position?: InputMaybe<PositionNullableRelationFilter>;
  positionId?: InputMaybe<IntNullableFilter>;
  quoteToken?: InputMaybe<DecimalNullableFilter>;
  tradeRatioD18?: InputMaybe<DecimalNullableFilter>;
  type?: InputMaybe<Enumtransaction_Type_EnumFilter>;
};

export type TransactionWhereUniqueInput = {
  AND?: InputMaybe<Array<TransactionWhereInput>>;
  NOT?: InputMaybe<Array<TransactionWhereInput>>;
  OR?: InputMaybe<Array<TransactionWhereInput>>;
  baseToken?: InputMaybe<DecimalNullableFilter>;
  borrowedBaseToken?: InputMaybe<DecimalNullableFilter>;
  borrowedQuoteToken?: InputMaybe<DecimalNullableFilter>;
  collateral?: InputMaybe<DecimalFilter>;
  collateralTransferId?: InputMaybe<Scalars['Int']['input']>;
  collateral_transfer?: InputMaybe<Collateral_TransferNullableRelationFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  event?: InputMaybe<EventNullableRelationFilter>;
  eventId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  lpBaseDeltaToken?: InputMaybe<DecimalNullableFilter>;
  lpQuoteDeltaToken?: InputMaybe<DecimalNullableFilter>;
  marketPriceId?: InputMaybe<Scalars['Int']['input']>;
  market_price?: InputMaybe<Market_PriceNullableRelationFilter>;
  position?: InputMaybe<PositionNullableRelationFilter>;
  positionId?: InputMaybe<IntNullableFilter>;
  quoteToken?: InputMaybe<DecimalNullableFilter>;
  tradeRatioD18?: InputMaybe<DecimalNullableFilter>;
  type?: InputMaybe<Enumtransaction_Type_EnumFilter>;
};

export type Cache_CandleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput = {
  candleType: Scalars['String']['input'];
  interval: Scalars['Int']['input'];
  marketIdx: Scalars['Int']['input'];
  resourceSlug: Scalars['String']['input'];
  timestamp: Scalars['Int']['input'];
  trailingAvgTime: Scalars['Int']['input'];
};

export type EventTransactionHashMarketGroupIdBlockNumberLogIndexCompoundUniqueInput = {
  blockNumber: Scalars['Int']['input'];
  logIndex: Scalars['Int']['input'];
  marketGroupId: Scalars['Int']['input'];
  transactionHash: Scalars['String']['input'];
};

export type MarketMarketGroupIdMarketIdCompoundUniqueInput = {
  marketGroupId: Scalars['Int']['input'];
  marketId: Scalars['Int']['input'];
};

export type Market_GroupAddressChainIdCompoundUniqueInput = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
};

export type PositionPositionIdMarketIdCompoundUniqueInput = {
  marketId: Scalars['Int']['input'];
  positionId: Scalars['Int']['input'];
};

export type Resource_PriceResourceIdTimestampCompoundUniqueInput = {
  resourceId: Scalars['Int']['input'];
  timestamp: Scalars['Int']['input'];
};

export type Transaction_Type_Enum =
  | 'addLiquidity'
  | 'long'
  | 'removeLiquidity'
  | 'settledPosition'
  | 'short';
