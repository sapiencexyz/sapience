import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { Market } from '../../models/Market';
import { MarketGroup } from '../../models/MarketGroup';
import { Resource } from '../../models/Resource';
import { Category } from '../../models/Category';
import { Position } from '../../models/Position';
import { Transaction } from '../../models/Transaction';
import { ResourcePrice } from '../../models/ResourcePrice';
import { ApolloContext } from '../startApolloServer';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
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

export enum Cache_CandleScalarFieldEnum {
  Address = 'address',
  CandleType = 'candleType',
  ChainId = 'chainId',
  Close = 'close',
  CreatedAt = 'createdAt',
  EndTimestamp = 'endTimestamp',
  High = 'high',
  Id = 'id',
  Interval = 'interval',
  LastUpdatedTimestamp = 'lastUpdatedTimestamp',
  Low = 'low',
  MarketId = 'marketId',
  MarketIdx = 'marketIdx',
  Open = 'open',
  ResourceSlug = 'resourceSlug',
  SumFeePaid = 'sumFeePaid',
  SumUsed = 'sumUsed',
  Timestamp = 'timestamp',
  TrailingAvgTime = 'trailingAvgTime',
  TrailingStartTimestamp = 'trailingStartTimestamp'
}

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

export enum CategoryScalarFieldEnum {
  CreatedAt = 'createdAt',
  Id = 'id',
  Name = 'name',
  Slug = 'slug'
}

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

export enum Crypto_PricesScalarFieldEnum {
  Id = 'id',
  Price = 'price',
  Ticker = 'ticker',
  Timestamp = 'timestamp'
}

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

export enum EventScalarFieldEnum {
  BlockNumber = 'blockNumber',
  CreatedAt = 'createdAt',
  Id = 'id',
  LogData = 'logData',
  LogIndex = 'logIndex',
  MarketGroupId = 'marketGroupId',
  Timestamp = 'timestamp',
  TransactionHash = 'transactionHash'
}

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

export enum MarketScalarFieldEnum {
  BaseAssetMaxPriceTick = 'baseAssetMaxPriceTick',
  BaseAssetMinPriceTick = 'baseAssetMinPriceTick',
  CreatedAt = 'createdAt',
  EndTimestamp = 'endTimestamp',
  Id = 'id',
  MarketGroupId = 'marketGroupId',
  MarketId = 'marketId',
  MarketParamsAssertionliveness = 'marketParamsAssertionliveness',
  MarketParamsBondamount = 'marketParamsBondamount',
  MarketParamsBondcurrency = 'marketParamsBondcurrency',
  MarketParamsClaimstatement = 'marketParamsClaimstatement',
  MarketParamsFeerate = 'marketParamsFeerate',
  MarketParamsOptimisticoraclev3 = 'marketParamsOptimisticoraclev3',
  MarketParamsUniswappositionmanager = 'marketParamsUniswappositionmanager',
  MarketParamsUniswapquoter = 'marketParamsUniswapquoter',
  MarketParamsUniswapswaprouter = 'marketParamsUniswapswaprouter',
  MaxPriceD18 = 'maxPriceD18',
  MinPriceD18 = 'minPriceD18',
  OptionName = 'optionName',
  PoolAddress = 'poolAddress',
  Public = 'public',
  Question = 'question',
  Rules = 'rules',
  Settled = 'settled',
  SettlementPriceD18 = 'settlementPriceD18',
  StartTimestamp = 'startTimestamp',
  StartingSqrtPriceX96 = 'startingSqrtPriceX96'
}

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

export enum Market_GroupScalarFieldEnum {
  Address = 'address',
  BaseTokenName = 'baseTokenName',
  CategoryId = 'categoryId',
  ChainId = 'chainId',
  CollateralAsset = 'collateralAsset',
  CollateralDecimals = 'collateralDecimals',
  CollateralSymbol = 'collateralSymbol',
  CreatedAt = 'createdAt',
  DeployTimestamp = 'deployTimestamp',
  DeployTxnBlockNumber = 'deployTxnBlockNumber',
  FactoryAddress = 'factoryAddress',
  Id = 'id',
  InitializationNonce = 'initializationNonce',
  IsCumulative = 'isCumulative',
  IsYin = 'isYin',
  MarketParamsAssertionliveness = 'marketParamsAssertionliveness',
  MarketParamsBondamount = 'marketParamsBondamount',
  MarketParamsBondcurrency = 'marketParamsBondcurrency',
  MarketParamsClaimstatement = 'marketParamsClaimstatement',
  MarketParamsFeerate = 'marketParamsFeerate',
  MarketParamsOptimisticoraclev3 = 'marketParamsOptimisticoraclev3',
  MarketParamsUniswappositionmanager = 'marketParamsUniswappositionmanager',
  MarketParamsUniswapquoter = 'marketParamsUniswapquoter',
  MarketParamsUniswapswaprouter = 'marketParamsUniswapswaprouter',
  MinTradeSize = 'minTradeSize',
  Owner = 'owner',
  Question = 'question',
  QuoteTokenName = 'quoteTokenName',
  ResourceId = 'resourceId',
  VaultAddress = 'vaultAddress'
}

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

export enum NullsOrder {
  First = 'first',
  Last = 'last'
}

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

export enum PositionScalarFieldEnum {
  BaseToken = 'baseToken',
  BorrowedBaseToken = 'borrowedBaseToken',
  BorrowedQuoteToken = 'borrowedQuoteToken',
  Collateral = 'collateral',
  CreatedAt = 'createdAt',
  HighPriceTick = 'highPriceTick',
  Id = 'id',
  IsLp = 'isLP',
  IsSettled = 'isSettled',
  LowPriceTick = 'lowPriceTick',
  LpBaseToken = 'lpBaseToken',
  LpQuoteToken = 'lpQuoteToken',
  MarketId = 'marketId',
  Owner = 'owner',
  PositionId = 'positionId',
  QuoteToken = 'quoteToken'
}

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

export enum QueryMode {
  Default = 'default',
  Insensitive = 'insensitive'
}

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

export enum Render_JobScalarFieldEnum {
  CreatedAt = 'createdAt',
  Id = 'id',
  JobId = 'jobId',
  ServiceId = 'serviceId'
}

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

export enum ResourceScalarFieldEnum {
  CategoryId = 'categoryId',
  CreatedAt = 'createdAt',
  Id = 'id',
  Name = 'name',
  Slug = 'slug'
}

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

export enum Resource_PriceScalarFieldEnum {
  BlockNumber = 'blockNumber',
  CreatedAt = 'createdAt',
  FeePaid = 'feePaid',
  Id = 'id',
  ResourceId = 'resourceId',
  Timestamp = 'timestamp',
  Used = 'used',
  Value = 'value'
}

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

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc'
}

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

export enum TransactionScalarFieldEnum {
  BaseToken = 'baseToken',
  BorrowedBaseToken = 'borrowedBaseToken',
  BorrowedQuoteToken = 'borrowedQuoteToken',
  Collateral = 'collateral',
  CollateralTransferId = 'collateralTransferId',
  CreatedAt = 'createdAt',
  EventId = 'eventId',
  Id = 'id',
  LpBaseDeltaToken = 'lpBaseDeltaToken',
  LpQuoteDeltaToken = 'lpQuoteDeltaToken',
  MarketPriceId = 'marketPriceId',
  PositionId = 'positionId',
  QuoteToken = 'quoteToken',
  TradeRatioD18 = 'tradeRatioD18',
  Type = 'type'
}

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

export enum Transaction_Type_Enum {
  AddLiquidity = 'addLiquidity',
  Long = 'long',
  RemoveLiquidity = 'removeLiquidity',
  SettledPosition = 'settledPosition',
  Short = 'short'
}

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  AggregateCache_candle: ResolverTypeWrapper<AggregateCache_Candle>;
  AggregateCategory: ResolverTypeWrapper<AggregateCategory>;
  AggregateCrypto_prices: ResolverTypeWrapper<AggregateCrypto_Prices>;
  AggregateEvent: ResolverTypeWrapper<AggregateEvent>;
  AggregateMarket: ResolverTypeWrapper<AggregateMarket>;
  AggregateMarket_group: ResolverTypeWrapper<AggregateMarket_Group>;
  AggregatePosition: ResolverTypeWrapper<AggregatePosition>;
  AggregateRender_job: ResolverTypeWrapper<AggregateRender_Job>;
  AggregateResource: ResolverTypeWrapper<AggregateResource>;
  AggregateResource_price: ResolverTypeWrapper<AggregateResource_Price>;
  AggregateTransaction: ResolverTypeWrapper<AggregateTransaction>;
  BigInt: ResolverTypeWrapper<Scalars['BigInt']['output']>;
  BigIntFilter: BigIntFilter;
  BigIntWithAggregatesFilter: BigIntWithAggregatesFilter;
  BoolFilter: BoolFilter;
  BoolNullableFilter: BoolNullableFilter;
  BoolNullableWithAggregatesFilter: BoolNullableWithAggregatesFilter;
  BoolWithAggregatesFilter: BoolWithAggregatesFilter;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Cache_candle: ResolverTypeWrapper<Cache_Candle>;
  Cache_candleAvgAggregate: ResolverTypeWrapper<Cache_CandleAvgAggregate>;
  Cache_candleCountAggregate: ResolverTypeWrapper<Cache_CandleCountAggregate>;
  Cache_candleMaxAggregate: ResolverTypeWrapper<Cache_CandleMaxAggregate>;
  Cache_candleMinAggregate: ResolverTypeWrapper<Cache_CandleMinAggregate>;
  Cache_candleOrderByWithRelationInput: Cache_CandleOrderByWithRelationInput;
  Cache_candleScalarFieldEnum: Cache_CandleScalarFieldEnum;
  Cache_candleSumAggregate: ResolverTypeWrapper<Cache_CandleSumAggregate>;
  Cache_candleWhereInput: Cache_CandleWhereInput;
  Cache_candleWhereUniqueInput: Cache_CandleWhereUniqueInput;
  CandleAndTimestampType: ResolverTypeWrapper<CandleAndTimestampType>;
  CandleType: ResolverTypeWrapper<CandleType>;
  Category: ResolverTypeWrapper<Category>;
  CategoryAvgAggregate: ResolverTypeWrapper<CategoryAvgAggregate>;
  CategoryAvgOrderByAggregateInput: CategoryAvgOrderByAggregateInput;
  CategoryCount: ResolverTypeWrapper<CategoryCount>;
  CategoryCountAggregate: ResolverTypeWrapper<CategoryCountAggregate>;
  CategoryCountOrderByAggregateInput: CategoryCountOrderByAggregateInput;
  CategoryGroupBy: ResolverTypeWrapper<CategoryGroupBy>;
  CategoryMaxAggregate: ResolverTypeWrapper<CategoryMaxAggregate>;
  CategoryMaxOrderByAggregateInput: CategoryMaxOrderByAggregateInput;
  CategoryMinAggregate: ResolverTypeWrapper<CategoryMinAggregate>;
  CategoryMinOrderByAggregateInput: CategoryMinOrderByAggregateInput;
  CategoryNullableRelationFilter: CategoryNullableRelationFilter;
  CategoryOrderByWithAggregationInput: CategoryOrderByWithAggregationInput;
  CategoryOrderByWithRelationInput: CategoryOrderByWithRelationInput;
  CategoryScalarFieldEnum: CategoryScalarFieldEnum;
  CategoryScalarWhereWithAggregatesInput: CategoryScalarWhereWithAggregatesInput;
  CategorySumAggregate: ResolverTypeWrapper<CategorySumAggregate>;
  CategorySumOrderByAggregateInput: CategorySumOrderByAggregateInput;
  CategoryWhereInput: CategoryWhereInput;
  CategoryWhereUniqueInput: CategoryWhereUniqueInput;
  Collateral_transferNullableRelationFilter: Collateral_TransferNullableRelationFilter;
  Collateral_transferOrderByWithRelationInput: Collateral_TransferOrderByWithRelationInput;
  Collateral_transferWhereInput: Collateral_TransferWhereInput;
  Crypto_prices: ResolverTypeWrapper<Crypto_Prices>;
  Crypto_pricesAvgAggregate: ResolverTypeWrapper<Crypto_PricesAvgAggregate>;
  Crypto_pricesCountAggregate: ResolverTypeWrapper<Crypto_PricesCountAggregate>;
  Crypto_pricesMaxAggregate: ResolverTypeWrapper<Crypto_PricesMaxAggregate>;
  Crypto_pricesMinAggregate: ResolverTypeWrapper<Crypto_PricesMinAggregate>;
  Crypto_pricesOrderByWithRelationInput: Crypto_PricesOrderByWithRelationInput;
  Crypto_pricesScalarFieldEnum: Crypto_PricesScalarFieldEnum;
  Crypto_pricesSumAggregate: ResolverTypeWrapper<Crypto_PricesSumAggregate>;
  Crypto_pricesWhereInput: Crypto_PricesWhereInput;
  Crypto_pricesWhereUniqueInput: Crypto_PricesWhereUniqueInput;
  DateTimeFilter: DateTimeFilter;
  DateTimeISO: ResolverTypeWrapper<Scalars['DateTimeISO']['output']>;
  DateTimeWithAggregatesFilter: DateTimeWithAggregatesFilter;
  Decimal: ResolverTypeWrapper<Scalars['Decimal']['output']>;
  DecimalFilter: DecimalFilter;
  DecimalNullableFilter: DecimalNullableFilter;
  DecimalNullableWithAggregatesFilter: DecimalNullableWithAggregatesFilter;
  DecimalWithAggregatesFilter: DecimalWithAggregatesFilter;
  Enumtransaction_type_enumFilter: Enumtransaction_Type_EnumFilter;
  Enumtransaction_type_enumWithAggregatesFilter: Enumtransaction_Type_EnumWithAggregatesFilter;
  Event: ResolverTypeWrapper<Event>;
  EventAvgAggregate: ResolverTypeWrapper<EventAvgAggregate>;
  EventAvgOrderByAggregateInput: EventAvgOrderByAggregateInput;
  EventCountAggregate: ResolverTypeWrapper<EventCountAggregate>;
  EventCountOrderByAggregateInput: EventCountOrderByAggregateInput;
  EventGroupBy: ResolverTypeWrapper<EventGroupBy>;
  EventListRelationFilter: EventListRelationFilter;
  EventMaxAggregate: ResolverTypeWrapper<EventMaxAggregate>;
  EventMaxOrderByAggregateInput: EventMaxOrderByAggregateInput;
  EventMinAggregate: ResolverTypeWrapper<EventMinAggregate>;
  EventMinOrderByAggregateInput: EventMinOrderByAggregateInput;
  EventNullableRelationFilter: EventNullableRelationFilter;
  EventOrderByRelationAggregateInput: EventOrderByRelationAggregateInput;
  EventOrderByWithAggregationInput: EventOrderByWithAggregationInput;
  EventOrderByWithRelationInput: EventOrderByWithRelationInput;
  EventScalarFieldEnum: EventScalarFieldEnum;
  EventScalarWhereWithAggregatesInput: EventScalarWhereWithAggregatesInput;
  EventSumAggregate: ResolverTypeWrapper<EventSumAggregate>;
  EventSumOrderByAggregateInput: EventSumOrderByAggregateInput;
  EventWhereInput: EventWhereInput;
  EventWhereUniqueInput: EventWhereUniqueInput;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  FloatFilter: FloatFilter;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  IntFilter: IntFilter;
  IntNullableFilter: IntNullableFilter;
  IntNullableWithAggregatesFilter: IntNullableWithAggregatesFilter;
  IntWithAggregatesFilter: IntWithAggregatesFilter;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  JsonFilter: JsonFilter;
  JsonWithAggregatesFilter: JsonWithAggregatesFilter;
  Market: ResolverTypeWrapper<Market>;
  MarketAvgAggregate: ResolverTypeWrapper<MarketAvgAggregate>;
  MarketAvgOrderByAggregateInput: MarketAvgOrderByAggregateInput;
  MarketCount: ResolverTypeWrapper<MarketCount>;
  MarketCountAggregate: ResolverTypeWrapper<MarketCountAggregate>;
  MarketCountOrderByAggregateInput: MarketCountOrderByAggregateInput;
  MarketFilterInput: MarketFilterInput;
  MarketGroupBy: ResolverTypeWrapper<MarketGroupBy>;
  MarketListRelationFilter: MarketListRelationFilter;
  MarketMaxAggregate: ResolverTypeWrapper<MarketMaxAggregate>;
  MarketMaxOrderByAggregateInput: MarketMaxOrderByAggregateInput;
  MarketMinAggregate: ResolverTypeWrapper<MarketMinAggregate>;
  MarketMinOrderByAggregateInput: MarketMinOrderByAggregateInput;
  MarketNullableRelationFilter: MarketNullableRelationFilter;
  MarketOrderByRelationAggregateInput: MarketOrderByRelationAggregateInput;
  MarketOrderByWithAggregationInput: MarketOrderByWithAggregationInput;
  MarketOrderByWithRelationInput: MarketOrderByWithRelationInput;
  MarketOrderInput: MarketOrderInput;
  MarketScalarFieldEnum: MarketScalarFieldEnum;
  MarketScalarWhereWithAggregatesInput: MarketScalarWhereWithAggregatesInput;
  MarketSumAggregate: ResolverTypeWrapper<MarketSumAggregate>;
  MarketSumOrderByAggregateInput: MarketSumOrderByAggregateInput;
  MarketWhereInput: MarketWhereInput;
  MarketWhereUniqueInput: MarketWhereUniqueInput;
  Market_group: ResolverTypeWrapper<Market_Group>;
  Market_groupAvgAggregate: ResolverTypeWrapper<Market_GroupAvgAggregate>;
  Market_groupAvgOrderByAggregateInput: Market_GroupAvgOrderByAggregateInput;
  Market_groupCount: ResolverTypeWrapper<Market_GroupCount>;
  Market_groupCountAggregate: ResolverTypeWrapper<Market_GroupCountAggregate>;
  Market_groupCountOrderByAggregateInput: Market_GroupCountOrderByAggregateInput;
  Market_groupGroupBy: ResolverTypeWrapper<Market_GroupGroupBy>;
  Market_groupListRelationFilter: Market_GroupListRelationFilter;
  Market_groupMaxAggregate: ResolverTypeWrapper<Market_GroupMaxAggregate>;
  Market_groupMaxOrderByAggregateInput: Market_GroupMaxOrderByAggregateInput;
  Market_groupMinAggregate: ResolverTypeWrapper<Market_GroupMinAggregate>;
  Market_groupMinOrderByAggregateInput: Market_GroupMinOrderByAggregateInput;
  Market_groupNullableRelationFilter: Market_GroupNullableRelationFilter;
  Market_groupOrderByRelationAggregateInput: Market_GroupOrderByRelationAggregateInput;
  Market_groupOrderByWithAggregationInput: Market_GroupOrderByWithAggregationInput;
  Market_groupOrderByWithRelationInput: Market_GroupOrderByWithRelationInput;
  Market_groupScalarFieldEnum: Market_GroupScalarFieldEnum;
  Market_groupScalarWhereWithAggregatesInput: Market_GroupScalarWhereWithAggregatesInput;
  Market_groupSumAggregate: ResolverTypeWrapper<Market_GroupSumAggregate>;
  Market_groupSumOrderByAggregateInput: Market_GroupSumOrderByAggregateInput;
  Market_groupWhereInput: Market_GroupWhereInput;
  Market_groupWhereUniqueInput: Market_GroupWhereUniqueInput;
  Market_priceNullableRelationFilter: Market_PriceNullableRelationFilter;
  Market_priceOrderByWithRelationInput: Market_PriceOrderByWithRelationInput;
  Market_priceWhereInput: Market_PriceWhereInput;
  NestedBigIntFilter: NestedBigIntFilter;
  NestedBigIntWithAggregatesFilter: NestedBigIntWithAggregatesFilter;
  NestedBoolFilter: NestedBoolFilter;
  NestedBoolNullableFilter: NestedBoolNullableFilter;
  NestedBoolNullableWithAggregatesFilter: NestedBoolNullableWithAggregatesFilter;
  NestedBoolWithAggregatesFilter: NestedBoolWithAggregatesFilter;
  NestedDateTimeFilter: NestedDateTimeFilter;
  NestedDateTimeWithAggregatesFilter: NestedDateTimeWithAggregatesFilter;
  NestedDecimalFilter: NestedDecimalFilter;
  NestedDecimalNullableFilter: NestedDecimalNullableFilter;
  NestedDecimalNullableWithAggregatesFilter: NestedDecimalNullableWithAggregatesFilter;
  NestedDecimalWithAggregatesFilter: NestedDecimalWithAggregatesFilter;
  NestedEnumtransaction_type_enumFilter: NestedEnumtransaction_Type_EnumFilter;
  NestedEnumtransaction_type_enumWithAggregatesFilter: NestedEnumtransaction_Type_EnumWithAggregatesFilter;
  NestedFloatFilter: NestedFloatFilter;
  NestedFloatNullableFilter: NestedFloatNullableFilter;
  NestedIntFilter: NestedIntFilter;
  NestedIntNullableFilter: NestedIntNullableFilter;
  NestedIntNullableWithAggregatesFilter: NestedIntNullableWithAggregatesFilter;
  NestedIntWithAggregatesFilter: NestedIntWithAggregatesFilter;
  NestedJsonFilter: NestedJsonFilter;
  NestedStringFilter: NestedStringFilter;
  NestedStringNullableFilter: NestedStringNullableFilter;
  NestedStringNullableWithAggregatesFilter: NestedStringNullableWithAggregatesFilter;
  NestedStringWithAggregatesFilter: NestedStringWithAggregatesFilter;
  NullsOrder: NullsOrder;
  PnLType: ResolverTypeWrapper<PnLType>;
  Position: ResolverTypeWrapper<Position>;
  PositionAvgAggregate: ResolverTypeWrapper<PositionAvgAggregate>;
  PositionAvgOrderByAggregateInput: PositionAvgOrderByAggregateInput;
  PositionCount: ResolverTypeWrapper<PositionCount>;
  PositionCountAggregate: ResolverTypeWrapper<PositionCountAggregate>;
  PositionCountOrderByAggregateInput: PositionCountOrderByAggregateInput;
  PositionGroupBy: ResolverTypeWrapper<PositionGroupBy>;
  PositionListRelationFilter: PositionListRelationFilter;
  PositionMaxAggregate: ResolverTypeWrapper<PositionMaxAggregate>;
  PositionMaxOrderByAggregateInput: PositionMaxOrderByAggregateInput;
  PositionMinAggregate: ResolverTypeWrapper<PositionMinAggregate>;
  PositionMinOrderByAggregateInput: PositionMinOrderByAggregateInput;
  PositionNullableRelationFilter: PositionNullableRelationFilter;
  PositionOrderByRelationAggregateInput: PositionOrderByRelationAggregateInput;
  PositionOrderByWithAggregationInput: PositionOrderByWithAggregationInput;
  PositionOrderByWithRelationInput: PositionOrderByWithRelationInput;
  PositionScalarFieldEnum: PositionScalarFieldEnum;
  PositionScalarWhereWithAggregatesInput: PositionScalarWhereWithAggregatesInput;
  PositionSumAggregate: ResolverTypeWrapper<PositionSumAggregate>;
  PositionSumOrderByAggregateInput: PositionSumOrderByAggregateInput;
  PositionWhereInput: PositionWhereInput;
  PositionWhereUniqueInput: PositionWhereUniqueInput;
  Query: ResolverTypeWrapper<{}>;
  QueryMode: QueryMode;
  Render_job: ResolverTypeWrapper<Render_Job>;
  Render_jobAvgAggregate: ResolverTypeWrapper<Render_JobAvgAggregate>;
  Render_jobCountAggregate: ResolverTypeWrapper<Render_JobCountAggregate>;
  Render_jobMaxAggregate: ResolverTypeWrapper<Render_JobMaxAggregate>;
  Render_jobMinAggregate: ResolverTypeWrapper<Render_JobMinAggregate>;
  Render_jobOrderByWithRelationInput: Render_JobOrderByWithRelationInput;
  Render_jobScalarFieldEnum: Render_JobScalarFieldEnum;
  Render_jobSumAggregate: ResolverTypeWrapper<Render_JobSumAggregate>;
  Render_jobWhereInput: Render_JobWhereInput;
  Render_jobWhereUniqueInput: Render_JobWhereUniqueInput;
  Resource: ResolverTypeWrapper<Resource>;
  ResourceAvgAggregate: ResolverTypeWrapper<ResourceAvgAggregate>;
  ResourceAvgOrderByAggregateInput: ResourceAvgOrderByAggregateInput;
  ResourceCount: ResolverTypeWrapper<ResourceCount>;
  ResourceCountAggregate: ResolverTypeWrapper<ResourceCountAggregate>;
  ResourceCountOrderByAggregateInput: ResourceCountOrderByAggregateInput;
  ResourceGroupBy: ResolverTypeWrapper<ResourceGroupBy>;
  ResourceListRelationFilter: ResourceListRelationFilter;
  ResourceMaxAggregate: ResolverTypeWrapper<ResourceMaxAggregate>;
  ResourceMaxOrderByAggregateInput: ResourceMaxOrderByAggregateInput;
  ResourceMinAggregate: ResolverTypeWrapper<ResourceMinAggregate>;
  ResourceMinOrderByAggregateInput: ResourceMinOrderByAggregateInput;
  ResourceNullableRelationFilter: ResourceNullableRelationFilter;
  ResourceOrderByRelationAggregateInput: ResourceOrderByRelationAggregateInput;
  ResourceOrderByWithAggregationInput: ResourceOrderByWithAggregationInput;
  ResourceOrderByWithRelationInput: ResourceOrderByWithRelationInput;
  ResourceScalarFieldEnum: ResourceScalarFieldEnum;
  ResourceScalarWhereWithAggregatesInput: ResourceScalarWhereWithAggregatesInput;
  ResourceSumAggregate: ResolverTypeWrapper<ResourceSumAggregate>;
  ResourceSumOrderByAggregateInput: ResourceSumOrderByAggregateInput;
  ResourceWhereInput: ResourceWhereInput;
  ResourceWhereUniqueInput: ResourceWhereUniqueInput;
  Resource_price: ResolverTypeWrapper<Resource_Price>;
  Resource_priceAvgAggregate: ResolverTypeWrapper<Resource_PriceAvgAggregate>;
  Resource_priceAvgOrderByAggregateInput: Resource_PriceAvgOrderByAggregateInput;
  Resource_priceCountAggregate: ResolverTypeWrapper<Resource_PriceCountAggregate>;
  Resource_priceCountOrderByAggregateInput: Resource_PriceCountOrderByAggregateInput;
  Resource_priceGroupBy: ResolverTypeWrapper<Resource_PriceGroupBy>;
  Resource_priceListRelationFilter: Resource_PriceListRelationFilter;
  Resource_priceMaxAggregate: ResolverTypeWrapper<Resource_PriceMaxAggregate>;
  Resource_priceMaxOrderByAggregateInput: Resource_PriceMaxOrderByAggregateInput;
  Resource_priceMinAggregate: ResolverTypeWrapper<Resource_PriceMinAggregate>;
  Resource_priceMinOrderByAggregateInput: Resource_PriceMinOrderByAggregateInput;
  Resource_priceOrderByRelationAggregateInput: Resource_PriceOrderByRelationAggregateInput;
  Resource_priceOrderByWithAggregationInput: Resource_PriceOrderByWithAggregationInput;
  Resource_priceOrderByWithRelationInput: Resource_PriceOrderByWithRelationInput;
  Resource_priceScalarFieldEnum: Resource_PriceScalarFieldEnum;
  Resource_priceScalarWhereWithAggregatesInput: Resource_PriceScalarWhereWithAggregatesInput;
  Resource_priceSumAggregate: ResolverTypeWrapper<Resource_PriceSumAggregate>;
  Resource_priceSumOrderByAggregateInput: Resource_PriceSumOrderByAggregateInput;
  Resource_priceWhereInput: Resource_PriceWhereInput;
  Resource_priceWhereUniqueInput: Resource_PriceWhereUniqueInput;
  SortOrder: SortOrder;
  SortOrderInput: SortOrderInput;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  StringFilter: StringFilter;
  StringNullableFilter: StringNullableFilter;
  StringNullableWithAggregatesFilter: StringNullableWithAggregatesFilter;
  StringWithAggregatesFilter: StringWithAggregatesFilter;
  Transaction: ResolverTypeWrapper<Transaction>;
  TransactionAvgAggregate: ResolverTypeWrapper<TransactionAvgAggregate>;
  TransactionAvgOrderByAggregateInput: TransactionAvgOrderByAggregateInput;
  TransactionCountAggregate: ResolverTypeWrapper<TransactionCountAggregate>;
  TransactionCountOrderByAggregateInput: TransactionCountOrderByAggregateInput;
  TransactionGroupBy: ResolverTypeWrapper<TransactionGroupBy>;
  TransactionListRelationFilter: TransactionListRelationFilter;
  TransactionMaxAggregate: ResolverTypeWrapper<TransactionMaxAggregate>;
  TransactionMaxOrderByAggregateInput: TransactionMaxOrderByAggregateInput;
  TransactionMinAggregate: ResolverTypeWrapper<TransactionMinAggregate>;
  TransactionMinOrderByAggregateInput: TransactionMinOrderByAggregateInput;
  TransactionNullableRelationFilter: TransactionNullableRelationFilter;
  TransactionOrderByRelationAggregateInput: TransactionOrderByRelationAggregateInput;
  TransactionOrderByWithAggregationInput: TransactionOrderByWithAggregationInput;
  TransactionOrderByWithRelationInput: TransactionOrderByWithRelationInput;
  TransactionScalarFieldEnum: TransactionScalarFieldEnum;
  TransactionScalarWhereWithAggregatesInput: TransactionScalarWhereWithAggregatesInput;
  TransactionSumAggregate: ResolverTypeWrapper<TransactionSumAggregate>;
  TransactionSumOrderByAggregateInput: TransactionSumOrderByAggregateInput;
  TransactionWhereInput: TransactionWhereInput;
  TransactionWhereUniqueInput: TransactionWhereUniqueInput;
  cache_candleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput: Cache_CandleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput;
  eventTransactionHashMarketGroupIdBlockNumberLogIndexCompoundUniqueInput: EventTransactionHashMarketGroupIdBlockNumberLogIndexCompoundUniqueInput;
  marketMarketGroupIdMarketIdCompoundUniqueInput: MarketMarketGroupIdMarketIdCompoundUniqueInput;
  market_groupAddressChainIdCompoundUniqueInput: Market_GroupAddressChainIdCompoundUniqueInput;
  positionPositionIdMarketIdCompoundUniqueInput: PositionPositionIdMarketIdCompoundUniqueInput;
  resource_priceResourceIdTimestampCompoundUniqueInput: Resource_PriceResourceIdTimestampCompoundUniqueInput;
  transaction_type_enum: Transaction_Type_Enum;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  AggregateCache_candle: AggregateCache_Candle;
  AggregateCategory: AggregateCategory;
  AggregateCrypto_prices: AggregateCrypto_Prices;
  AggregateEvent: AggregateEvent;
  AggregateMarket: AggregateMarket;
  AggregateMarket_group: AggregateMarket_Group;
  AggregatePosition: AggregatePosition;
  AggregateRender_job: AggregateRender_Job;
  AggregateResource: AggregateResource;
  AggregateResource_price: AggregateResource_Price;
  AggregateTransaction: AggregateTransaction;
  BigInt: Scalars['BigInt']['output'];
  BigIntFilter: BigIntFilter;
  BigIntWithAggregatesFilter: BigIntWithAggregatesFilter;
  BoolFilter: BoolFilter;
  BoolNullableFilter: BoolNullableFilter;
  BoolNullableWithAggregatesFilter: BoolNullableWithAggregatesFilter;
  BoolWithAggregatesFilter: BoolWithAggregatesFilter;
  Boolean: Scalars['Boolean']['output'];
  Cache_candle: Cache_Candle;
  Cache_candleAvgAggregate: Cache_CandleAvgAggregate;
  Cache_candleCountAggregate: Cache_CandleCountAggregate;
  Cache_candleMaxAggregate: Cache_CandleMaxAggregate;
  Cache_candleMinAggregate: Cache_CandleMinAggregate;
  Cache_candleOrderByWithRelationInput: Cache_CandleOrderByWithRelationInput;
  Cache_candleSumAggregate: Cache_CandleSumAggregate;
  Cache_candleWhereInput: Cache_CandleWhereInput;
  Cache_candleWhereUniqueInput: Cache_CandleWhereUniqueInput;
  CandleAndTimestampType: CandleAndTimestampType;
  CandleType: CandleType;
  Category: Category;
  CategoryAvgAggregate: CategoryAvgAggregate;
  CategoryAvgOrderByAggregateInput: CategoryAvgOrderByAggregateInput;
  CategoryCount: CategoryCount;
  CategoryCountAggregate: CategoryCountAggregate;
  CategoryCountOrderByAggregateInput: CategoryCountOrderByAggregateInput;
  CategoryGroupBy: CategoryGroupBy;
  CategoryMaxAggregate: CategoryMaxAggregate;
  CategoryMaxOrderByAggregateInput: CategoryMaxOrderByAggregateInput;
  CategoryMinAggregate: CategoryMinAggregate;
  CategoryMinOrderByAggregateInput: CategoryMinOrderByAggregateInput;
  CategoryNullableRelationFilter: CategoryNullableRelationFilter;
  CategoryOrderByWithAggregationInput: CategoryOrderByWithAggregationInput;
  CategoryOrderByWithRelationInput: CategoryOrderByWithRelationInput;
  CategoryScalarWhereWithAggregatesInput: CategoryScalarWhereWithAggregatesInput;
  CategorySumAggregate: CategorySumAggregate;
  CategorySumOrderByAggregateInput: CategorySumOrderByAggregateInput;
  CategoryWhereInput: CategoryWhereInput;
  CategoryWhereUniqueInput: CategoryWhereUniqueInput;
  Collateral_transferNullableRelationFilter: Collateral_TransferNullableRelationFilter;
  Collateral_transferOrderByWithRelationInput: Collateral_TransferOrderByWithRelationInput;
  Collateral_transferWhereInput: Collateral_TransferWhereInput;
  Crypto_prices: Crypto_Prices;
  Crypto_pricesAvgAggregate: Crypto_PricesAvgAggregate;
  Crypto_pricesCountAggregate: Crypto_PricesCountAggregate;
  Crypto_pricesMaxAggregate: Crypto_PricesMaxAggregate;
  Crypto_pricesMinAggregate: Crypto_PricesMinAggregate;
  Crypto_pricesOrderByWithRelationInput: Crypto_PricesOrderByWithRelationInput;
  Crypto_pricesSumAggregate: Crypto_PricesSumAggregate;
  Crypto_pricesWhereInput: Crypto_PricesWhereInput;
  Crypto_pricesWhereUniqueInput: Crypto_PricesWhereUniqueInput;
  DateTimeFilter: DateTimeFilter;
  DateTimeISO: Scalars['DateTimeISO']['output'];
  DateTimeWithAggregatesFilter: DateTimeWithAggregatesFilter;
  Decimal: Scalars['Decimal']['output'];
  DecimalFilter: DecimalFilter;
  DecimalNullableFilter: DecimalNullableFilter;
  DecimalNullableWithAggregatesFilter: DecimalNullableWithAggregatesFilter;
  DecimalWithAggregatesFilter: DecimalWithAggregatesFilter;
  Enumtransaction_type_enumFilter: Enumtransaction_Type_EnumFilter;
  Enumtransaction_type_enumWithAggregatesFilter: Enumtransaction_Type_EnumWithAggregatesFilter;
  Event: Event;
  EventAvgAggregate: EventAvgAggregate;
  EventAvgOrderByAggregateInput: EventAvgOrderByAggregateInput;
  EventCountAggregate: EventCountAggregate;
  EventCountOrderByAggregateInput: EventCountOrderByAggregateInput;
  EventGroupBy: EventGroupBy;
  EventListRelationFilter: EventListRelationFilter;
  EventMaxAggregate: EventMaxAggregate;
  EventMaxOrderByAggregateInput: EventMaxOrderByAggregateInput;
  EventMinAggregate: EventMinAggregate;
  EventMinOrderByAggregateInput: EventMinOrderByAggregateInput;
  EventNullableRelationFilter: EventNullableRelationFilter;
  EventOrderByRelationAggregateInput: EventOrderByRelationAggregateInput;
  EventOrderByWithAggregationInput: EventOrderByWithAggregationInput;
  EventOrderByWithRelationInput: EventOrderByWithRelationInput;
  EventScalarWhereWithAggregatesInput: EventScalarWhereWithAggregatesInput;
  EventSumAggregate: EventSumAggregate;
  EventSumOrderByAggregateInput: EventSumOrderByAggregateInput;
  EventWhereInput: EventWhereInput;
  EventWhereUniqueInput: EventWhereUniqueInput;
  Float: Scalars['Float']['output'];
  FloatFilter: FloatFilter;
  Int: Scalars['Int']['output'];
  IntFilter: IntFilter;
  IntNullableFilter: IntNullableFilter;
  IntNullableWithAggregatesFilter: IntNullableWithAggregatesFilter;
  IntWithAggregatesFilter: IntWithAggregatesFilter;
  JSON: Scalars['JSON']['output'];
  JsonFilter: JsonFilter;
  JsonWithAggregatesFilter: JsonWithAggregatesFilter;
  Market: Market;
  MarketAvgAggregate: MarketAvgAggregate;
  MarketAvgOrderByAggregateInput: MarketAvgOrderByAggregateInput;
  MarketCount: MarketCount;
  MarketCountAggregate: MarketCountAggregate;
  MarketCountOrderByAggregateInput: MarketCountOrderByAggregateInput;
  MarketFilterInput: MarketFilterInput;
  MarketGroupBy: MarketGroupBy;
  MarketListRelationFilter: MarketListRelationFilter;
  MarketMaxAggregate: MarketMaxAggregate;
  MarketMaxOrderByAggregateInput: MarketMaxOrderByAggregateInput;
  MarketMinAggregate: MarketMinAggregate;
  MarketMinOrderByAggregateInput: MarketMinOrderByAggregateInput;
  MarketNullableRelationFilter: MarketNullableRelationFilter;
  MarketOrderByRelationAggregateInput: MarketOrderByRelationAggregateInput;
  MarketOrderByWithAggregationInput: MarketOrderByWithAggregationInput;
  MarketOrderByWithRelationInput: MarketOrderByWithRelationInput;
  MarketOrderInput: MarketOrderInput;
  MarketScalarWhereWithAggregatesInput: MarketScalarWhereWithAggregatesInput;
  MarketSumAggregate: MarketSumAggregate;
  MarketSumOrderByAggregateInput: MarketSumOrderByAggregateInput;
  MarketWhereInput: MarketWhereInput;
  MarketWhereUniqueInput: MarketWhereUniqueInput;
  Market_group: Market_Group;
  Market_groupAvgAggregate: Market_GroupAvgAggregate;
  Market_groupAvgOrderByAggregateInput: Market_GroupAvgOrderByAggregateInput;
  Market_groupCount: Market_GroupCount;
  Market_groupCountAggregate: Market_GroupCountAggregate;
  Market_groupCountOrderByAggregateInput: Market_GroupCountOrderByAggregateInput;
  Market_groupGroupBy: Market_GroupGroupBy;
  Market_groupListRelationFilter: Market_GroupListRelationFilter;
  Market_groupMaxAggregate: Market_GroupMaxAggregate;
  Market_groupMaxOrderByAggregateInput: Market_GroupMaxOrderByAggregateInput;
  Market_groupMinAggregate: Market_GroupMinAggregate;
  Market_groupMinOrderByAggregateInput: Market_GroupMinOrderByAggregateInput;
  Market_groupNullableRelationFilter: Market_GroupNullableRelationFilter;
  Market_groupOrderByRelationAggregateInput: Market_GroupOrderByRelationAggregateInput;
  Market_groupOrderByWithAggregationInput: Market_GroupOrderByWithAggregationInput;
  Market_groupOrderByWithRelationInput: Market_GroupOrderByWithRelationInput;
  Market_groupScalarWhereWithAggregatesInput: Market_GroupScalarWhereWithAggregatesInput;
  Market_groupSumAggregate: Market_GroupSumAggregate;
  Market_groupSumOrderByAggregateInput: Market_GroupSumOrderByAggregateInput;
  Market_groupWhereInput: Market_GroupWhereInput;
  Market_groupWhereUniqueInput: Market_GroupWhereUniqueInput;
  Market_priceNullableRelationFilter: Market_PriceNullableRelationFilter;
  Market_priceOrderByWithRelationInput: Market_PriceOrderByWithRelationInput;
  Market_priceWhereInput: Market_PriceWhereInput;
  NestedBigIntFilter: NestedBigIntFilter;
  NestedBigIntWithAggregatesFilter: NestedBigIntWithAggregatesFilter;
  NestedBoolFilter: NestedBoolFilter;
  NestedBoolNullableFilter: NestedBoolNullableFilter;
  NestedBoolNullableWithAggregatesFilter: NestedBoolNullableWithAggregatesFilter;
  NestedBoolWithAggregatesFilter: NestedBoolWithAggregatesFilter;
  NestedDateTimeFilter: NestedDateTimeFilter;
  NestedDateTimeWithAggregatesFilter: NestedDateTimeWithAggregatesFilter;
  NestedDecimalFilter: NestedDecimalFilter;
  NestedDecimalNullableFilter: NestedDecimalNullableFilter;
  NestedDecimalNullableWithAggregatesFilter: NestedDecimalNullableWithAggregatesFilter;
  NestedDecimalWithAggregatesFilter: NestedDecimalWithAggregatesFilter;
  NestedEnumtransaction_type_enumFilter: NestedEnumtransaction_Type_EnumFilter;
  NestedEnumtransaction_type_enumWithAggregatesFilter: NestedEnumtransaction_Type_EnumWithAggregatesFilter;
  NestedFloatFilter: NestedFloatFilter;
  NestedFloatNullableFilter: NestedFloatNullableFilter;
  NestedIntFilter: NestedIntFilter;
  NestedIntNullableFilter: NestedIntNullableFilter;
  NestedIntNullableWithAggregatesFilter: NestedIntNullableWithAggregatesFilter;
  NestedIntWithAggregatesFilter: NestedIntWithAggregatesFilter;
  NestedJsonFilter: NestedJsonFilter;
  NestedStringFilter: NestedStringFilter;
  NestedStringNullableFilter: NestedStringNullableFilter;
  NestedStringNullableWithAggregatesFilter: NestedStringNullableWithAggregatesFilter;
  NestedStringWithAggregatesFilter: NestedStringWithAggregatesFilter;
  PnLType: PnLType;
  Position: Position;
  PositionAvgAggregate: PositionAvgAggregate;
  PositionAvgOrderByAggregateInput: PositionAvgOrderByAggregateInput;
  PositionCount: PositionCount;
  PositionCountAggregate: PositionCountAggregate;
  PositionCountOrderByAggregateInput: PositionCountOrderByAggregateInput;
  PositionGroupBy: PositionGroupBy;
  PositionListRelationFilter: PositionListRelationFilter;
  PositionMaxAggregate: PositionMaxAggregate;
  PositionMaxOrderByAggregateInput: PositionMaxOrderByAggregateInput;
  PositionMinAggregate: PositionMinAggregate;
  PositionMinOrderByAggregateInput: PositionMinOrderByAggregateInput;
  PositionNullableRelationFilter: PositionNullableRelationFilter;
  PositionOrderByRelationAggregateInput: PositionOrderByRelationAggregateInput;
  PositionOrderByWithAggregationInput: PositionOrderByWithAggregationInput;
  PositionOrderByWithRelationInput: PositionOrderByWithRelationInput;
  PositionScalarWhereWithAggregatesInput: PositionScalarWhereWithAggregatesInput;
  PositionSumAggregate: PositionSumAggregate;
  PositionSumOrderByAggregateInput: PositionSumOrderByAggregateInput;
  PositionWhereInput: PositionWhereInput;
  PositionWhereUniqueInput: PositionWhereUniqueInput;
  Query: {};
  Render_job: Render_Job;
  Render_jobAvgAggregate: Render_JobAvgAggregate;
  Render_jobCountAggregate: Render_JobCountAggregate;
  Render_jobMaxAggregate: Render_JobMaxAggregate;
  Render_jobMinAggregate: Render_JobMinAggregate;
  Render_jobOrderByWithRelationInput: Render_JobOrderByWithRelationInput;
  Render_jobSumAggregate: Render_JobSumAggregate;
  Render_jobWhereInput: Render_JobWhereInput;
  Render_jobWhereUniqueInput: Render_JobWhereUniqueInput;
  Resource: Resource;
  ResourceAvgAggregate: ResourceAvgAggregate;
  ResourceAvgOrderByAggregateInput: ResourceAvgOrderByAggregateInput;
  ResourceCount: ResourceCount;
  ResourceCountAggregate: ResourceCountAggregate;
  ResourceCountOrderByAggregateInput: ResourceCountOrderByAggregateInput;
  ResourceGroupBy: ResourceGroupBy;
  ResourceListRelationFilter: ResourceListRelationFilter;
  ResourceMaxAggregate: ResourceMaxAggregate;
  ResourceMaxOrderByAggregateInput: ResourceMaxOrderByAggregateInput;
  ResourceMinAggregate: ResourceMinAggregate;
  ResourceMinOrderByAggregateInput: ResourceMinOrderByAggregateInput;
  ResourceNullableRelationFilter: ResourceNullableRelationFilter;
  ResourceOrderByRelationAggregateInput: ResourceOrderByRelationAggregateInput;
  ResourceOrderByWithAggregationInput: ResourceOrderByWithAggregationInput;
  ResourceOrderByWithRelationInput: ResourceOrderByWithRelationInput;
  ResourceScalarWhereWithAggregatesInput: ResourceScalarWhereWithAggregatesInput;
  ResourceSumAggregate: ResourceSumAggregate;
  ResourceSumOrderByAggregateInput: ResourceSumOrderByAggregateInput;
  ResourceWhereInput: ResourceWhereInput;
  ResourceWhereUniqueInput: ResourceWhereUniqueInput;
  Resource_price: Resource_Price;
  Resource_priceAvgAggregate: Resource_PriceAvgAggregate;
  Resource_priceAvgOrderByAggregateInput: Resource_PriceAvgOrderByAggregateInput;
  Resource_priceCountAggregate: Resource_PriceCountAggregate;
  Resource_priceCountOrderByAggregateInput: Resource_PriceCountOrderByAggregateInput;
  Resource_priceGroupBy: Resource_PriceGroupBy;
  Resource_priceListRelationFilter: Resource_PriceListRelationFilter;
  Resource_priceMaxAggregate: Resource_PriceMaxAggregate;
  Resource_priceMaxOrderByAggregateInput: Resource_PriceMaxOrderByAggregateInput;
  Resource_priceMinAggregate: Resource_PriceMinAggregate;
  Resource_priceMinOrderByAggregateInput: Resource_PriceMinOrderByAggregateInput;
  Resource_priceOrderByRelationAggregateInput: Resource_PriceOrderByRelationAggregateInput;
  Resource_priceOrderByWithAggregationInput: Resource_PriceOrderByWithAggregationInput;
  Resource_priceOrderByWithRelationInput: Resource_PriceOrderByWithRelationInput;
  Resource_priceScalarWhereWithAggregatesInput: Resource_PriceScalarWhereWithAggregatesInput;
  Resource_priceSumAggregate: Resource_PriceSumAggregate;
  Resource_priceSumOrderByAggregateInput: Resource_PriceSumOrderByAggregateInput;
  Resource_priceWhereInput: Resource_PriceWhereInput;
  Resource_priceWhereUniqueInput: Resource_PriceWhereUniqueInput;
  SortOrderInput: SortOrderInput;
  String: Scalars['String']['output'];
  StringFilter: StringFilter;
  StringNullableFilter: StringNullableFilter;
  StringNullableWithAggregatesFilter: StringNullableWithAggregatesFilter;
  StringWithAggregatesFilter: StringWithAggregatesFilter;
  Transaction: Transaction;
  TransactionAvgAggregate: TransactionAvgAggregate;
  TransactionAvgOrderByAggregateInput: TransactionAvgOrderByAggregateInput;
  TransactionCountAggregate: TransactionCountAggregate;
  TransactionCountOrderByAggregateInput: TransactionCountOrderByAggregateInput;
  TransactionGroupBy: TransactionGroupBy;
  TransactionListRelationFilter: TransactionListRelationFilter;
  TransactionMaxAggregate: TransactionMaxAggregate;
  TransactionMaxOrderByAggregateInput: TransactionMaxOrderByAggregateInput;
  TransactionMinAggregate: TransactionMinAggregate;
  TransactionMinOrderByAggregateInput: TransactionMinOrderByAggregateInput;
  TransactionNullableRelationFilter: TransactionNullableRelationFilter;
  TransactionOrderByRelationAggregateInput: TransactionOrderByRelationAggregateInput;
  TransactionOrderByWithAggregationInput: TransactionOrderByWithAggregationInput;
  TransactionOrderByWithRelationInput: TransactionOrderByWithRelationInput;
  TransactionScalarWhereWithAggregatesInput: TransactionScalarWhereWithAggregatesInput;
  TransactionSumAggregate: TransactionSumAggregate;
  TransactionSumOrderByAggregateInput: TransactionSumOrderByAggregateInput;
  TransactionWhereInput: TransactionWhereInput;
  TransactionWhereUniqueInput: TransactionWhereUniqueInput;
  cache_candleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput: Cache_CandleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput;
  eventTransactionHashMarketGroupIdBlockNumberLogIndexCompoundUniqueInput: EventTransactionHashMarketGroupIdBlockNumberLogIndexCompoundUniqueInput;
  marketMarketGroupIdMarketIdCompoundUniqueInput: MarketMarketGroupIdMarketIdCompoundUniqueInput;
  market_groupAddressChainIdCompoundUniqueInput: Market_GroupAddressChainIdCompoundUniqueInput;
  positionPositionIdMarketIdCompoundUniqueInput: PositionPositionIdMarketIdCompoundUniqueInput;
  resource_priceResourceIdTimestampCompoundUniqueInput: Resource_PriceResourceIdTimestampCompoundUniqueInput;
}>;

export type AggregateCache_CandleResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregateCache_candle'] = ResolversParentTypes['AggregateCache_candle']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['Cache_candleAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['Cache_candleCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['Cache_candleMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['Cache_candleMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['Cache_candleSumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregateCategoryResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregateCategory'] = ResolversParentTypes['AggregateCategory']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['CategoryAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['CategoryCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['CategoryMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['CategoryMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['CategorySumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregateCrypto_PricesResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregateCrypto_prices'] = ResolversParentTypes['AggregateCrypto_prices']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['Crypto_pricesAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['Crypto_pricesCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['Crypto_pricesMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['Crypto_pricesMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['Crypto_pricesSumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregateEventResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregateEvent'] = ResolversParentTypes['AggregateEvent']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['EventAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['EventCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['EventMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['EventMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['EventSumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregateMarketResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregateMarket'] = ResolversParentTypes['AggregateMarket']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['MarketAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['MarketCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['MarketMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['MarketMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['MarketSumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregateMarket_GroupResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregateMarket_group'] = ResolversParentTypes['AggregateMarket_group']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['Market_groupAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['Market_groupCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['Market_groupMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['Market_groupMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['Market_groupSumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregatePositionResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregatePosition'] = ResolversParentTypes['AggregatePosition']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['PositionAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['PositionCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['PositionMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['PositionMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['PositionSumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregateRender_JobResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregateRender_job'] = ResolversParentTypes['AggregateRender_job']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['Render_jobAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['Render_jobCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['Render_jobMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['Render_jobMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['Render_jobSumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregateResourceResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregateResource'] = ResolversParentTypes['AggregateResource']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['ResourceAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['ResourceCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['ResourceMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['ResourceMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['ResourceSumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregateResource_PriceResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregateResource_price'] = ResolversParentTypes['AggregateResource_price']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['Resource_priceAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['Resource_priceCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['Resource_priceMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['Resource_priceMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['Resource_priceSumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregateTransactionResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['AggregateTransaction'] = ResolversParentTypes['AggregateTransaction']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['TransactionAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['TransactionCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['TransactionMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['TransactionMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['TransactionSumAggregate']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface BigIntScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['BigInt'], any> {
  name: 'BigInt';
}

export type Cache_CandleResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Cache_candle'] = ResolversParentTypes['Cache_candle']> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  candleType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  chainId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  close?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  endTimestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  high?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  interval?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  lastUpdatedTimestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  low?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketIdx?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  open?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  resourceSlug?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sumFeePaid?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  sumUsed?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  trailingAvgTime?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  trailingStartTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Cache_CandleAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Cache_candleAvgAggregate'] = ResolversParentTypes['Cache_candleAvgAggregate']> = ResolversObject<{
  chainId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  interval?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  lastUpdatedTimestamp?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  marketIdx?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  sumFeePaid?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  sumUsed?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  trailingAvgTime?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  trailingStartTimestamp?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Cache_CandleCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Cache_candleCountAggregate'] = ResolversParentTypes['Cache_candleCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  address?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  candleType?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  close?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  endTimestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  high?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  interval?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  lastUpdatedTimestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  low?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketIdx?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  open?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  resourceSlug?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sumFeePaid?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sumUsed?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  trailingAvgTime?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  trailingStartTimestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Cache_CandleMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Cache_candleMaxAggregate'] = ResolversParentTypes['Cache_candleMaxAggregate']> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  candleType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  chainId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  close?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  high?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  interval?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lastUpdatedTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  low?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketIdx?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  open?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  resourceSlug?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sumFeePaid?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  sumUsed?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  trailingAvgTime?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  trailingStartTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Cache_CandleMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Cache_candleMinAggregate'] = ResolversParentTypes['Cache_candleMinAggregate']> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  candleType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  chainId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  close?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  high?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  interval?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lastUpdatedTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  low?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketIdx?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  open?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  resourceSlug?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sumFeePaid?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  sumUsed?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  trailingAvgTime?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  trailingStartTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Cache_CandleSumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Cache_candleSumAggregate'] = ResolversParentTypes['Cache_candleSumAggregate']> = ResolversObject<{
  chainId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  interval?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lastUpdatedTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketIdx?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  sumFeePaid?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  sumUsed?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  trailingAvgTime?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  trailingStartTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CandleAndTimestampTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CandleAndTimestampType'] = ResolversParentTypes['CandleAndTimestampType']> = ResolversObject<{
  data?: Resolver<Array<ResolversTypes['CandleType']>, ParentType, ContextType>;
  lastUpdateTimestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CandleTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CandleType'] = ResolversParentTypes['CandleType']> = ResolversObject<{
  close?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  high?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  low?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  open?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CategoryResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Category'] = ResolversParentTypes['Category']> = ResolversObject<{
  _count?: Resolver<Maybe<ResolversTypes['CategoryCount']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CategoryAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CategoryAvgAggregate'] = ResolversParentTypes['CategoryAvgAggregate']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CategoryCountResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CategoryCount'] = ResolversParentTypes['CategoryCount']> = ResolversObject<{
  market_group?: Resolver<ResolversTypes['Int'], ParentType, ContextType, Partial<CategoryCountMarket_GroupArgs>>;
  resource?: Resolver<ResolversTypes['Int'], ParentType, ContextType, Partial<CategoryCountResourceArgs>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CategoryCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CategoryCountAggregate'] = ResolversParentTypes['CategoryCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CategoryGroupByResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CategoryGroupBy'] = ResolversParentTypes['CategoryGroupBy']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['CategoryAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['CategoryCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['CategoryMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['CategoryMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['CategorySumAggregate']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CategoryMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CategoryMaxAggregate'] = ResolversParentTypes['CategoryMaxAggregate']> = ResolversObject<{
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  slug?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CategoryMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CategoryMinAggregate'] = ResolversParentTypes['CategoryMinAggregate']> = ResolversObject<{
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  slug?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CategorySumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CategorySumAggregate'] = ResolversParentTypes['CategorySumAggregate']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Crypto_PricesResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Crypto_prices'] = ResolversParentTypes['Crypto_prices']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  ticker?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Crypto_PricesAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Crypto_pricesAvgAggregate'] = ResolversParentTypes['Crypto_pricesAvgAggregate']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  price?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Crypto_PricesCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Crypto_pricesCountAggregate'] = ResolversParentTypes['Crypto_pricesCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  ticker?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Crypto_PricesMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Crypto_pricesMaxAggregate'] = ResolversParentTypes['Crypto_pricesMaxAggregate']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  price?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  ticker?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Crypto_PricesMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Crypto_pricesMinAggregate'] = ResolversParentTypes['Crypto_pricesMinAggregate']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  price?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  ticker?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Crypto_PricesSumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Crypto_pricesSumAggregate'] = ResolversParentTypes['Crypto_pricesSumAggregate']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  price?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface DateTimeIsoScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTimeISO'], any> {
  name: 'DateTimeISO';
}

export interface DecimalScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Decimal'], any> {
  name: 'Decimal';
}

export type EventResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Event'] = ResolversParentTypes['Event']> = ResolversObject<{
  blockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  logData?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  logIndex?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EventAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['EventAvgAggregate'] = ResolversParentTypes['EventAvgAggregate']> = ResolversObject<{
  blockNumber?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  logIndex?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EventCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['EventCountAggregate'] = ResolversParentTypes['EventCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  blockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  logData?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  logIndex?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketGroupId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EventGroupByResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['EventGroupBy'] = ResolversParentTypes['EventGroupBy']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['EventAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['EventCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['EventMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['EventMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['EventSumAggregate']>, ParentType, ContextType>;
  blockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  logData?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  logIndex?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EventMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['EventMaxAggregate'] = ResolversParentTypes['EventMaxAggregate']> = ResolversObject<{
  blockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  logIndex?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  transactionHash?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EventMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['EventMinAggregate'] = ResolversParentTypes['EventMinAggregate']> = ResolversObject<{
  blockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  logIndex?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  transactionHash?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EventSumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['EventSumAggregate'] = ResolversParentTypes['EventSumAggregate']> = ResolversObject<{
  blockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  logIndex?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type MarketResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Market'] = ResolversParentTypes['Market']> = ResolversObject<{
  _count?: Resolver<Maybe<ResolversTypes['MarketCount']>, ParentType, ContextType>;
  baseAssetMaxPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  baseAssetMinPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  currentPrice?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondcurrency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsClaimstatement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsOptimisticoraclev3?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswappositionmanager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapquoter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapswaprouter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  maxPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  minPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  optionName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  poolAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  public?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rules?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  settled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  settlementPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  startTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  startingSqrtPriceX96?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MarketAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['MarketAvgAggregate'] = ResolversParentTypes['MarketAvgAggregate']> = ResolversObject<{
  baseAssetMaxPriceTick?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  baseAssetMinPriceTick?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  maxPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  minPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  settlementPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  startTimestamp?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  startingSqrtPriceX96?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MarketCountResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['MarketCount'] = ResolversParentTypes['MarketCount']> = ResolversObject<{
  position?: Resolver<ResolversTypes['Int'], ParentType, ContextType, Partial<MarketCountPositionArgs>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MarketCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['MarketCountAggregate'] = ResolversParentTypes['MarketCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  baseAssetMaxPriceTick?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  baseAssetMinPriceTick?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  endTimestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketGroupId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsBondamount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsBondcurrency?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsClaimstatement?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsFeerate?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsOptimisticoraclev3?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsUniswappositionmanager?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsUniswapquoter?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsUniswapswaprouter?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  maxPriceD18?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  minPriceD18?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  optionName?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  poolAddress?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  public?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  question?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  rules?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  settled?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  settlementPriceD18?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  startTimestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  startingSqrtPriceX96?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MarketGroupByResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['MarketGroupBy'] = ResolversParentTypes['MarketGroupBy']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['MarketAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['MarketCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['MarketMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['MarketMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['MarketSumAggregate']>, ParentType, ContextType>;
  baseAssetMaxPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  baseAssetMinPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondcurrency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsClaimstatement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsOptimisticoraclev3?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswappositionmanager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapquoter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapswaprouter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  maxPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  minPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  optionName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  poolAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  public?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rules?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  settled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  settlementPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  startTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  startingSqrtPriceX96?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MarketMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['MarketMaxAggregate'] = ResolversParentTypes['MarketMaxAggregate']> = ResolversObject<{
  baseAssetMaxPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  baseAssetMinPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondcurrency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsClaimstatement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsOptimisticoraclev3?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswappositionmanager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapquoter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapswaprouter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  maxPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  minPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  optionName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  poolAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  public?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rules?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  settled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  settlementPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  startTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  startingSqrtPriceX96?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MarketMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['MarketMinAggregate'] = ResolversParentTypes['MarketMinAggregate']> = ResolversObject<{
  baseAssetMaxPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  baseAssetMinPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondcurrency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsClaimstatement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsOptimisticoraclev3?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswappositionmanager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapquoter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapswaprouter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  maxPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  minPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  optionName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  poolAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  public?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rules?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  settled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  settlementPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  startTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  startingSqrtPriceX96?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MarketSumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['MarketSumAggregate'] = ResolversParentTypes['MarketSumAggregate']> = ResolversObject<{
  baseAssetMaxPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  baseAssetMinPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketGroupId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  maxPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  minPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  settlementPriceD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  startTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  startingSqrtPriceX96?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Market_GroupResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Market_group'] = ResolversParentTypes['Market_group']> = ResolversObject<{
  _count?: Resolver<Maybe<ResolversTypes['Market_groupCount']>, ParentType, ContextType>;
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  baseTokenName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  categoryId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  collateralAsset?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  collateralDecimals?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  collateralSymbol?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  deployTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  deployTxnBlockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  factoryAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  initializationNonce?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  isCumulative?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isYin?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondcurrency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsClaimstatement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsOptimisticoraclev3?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswappositionmanager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapquoter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapswaprouter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  markets?: Resolver<Array<ResolversTypes['Market']>, ParentType, ContextType, Partial<Market_GroupMarketsArgs>>;
  minTradeSize?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quoteTokenName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  vaultAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Market_GroupAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Market_groupAvgAggregate'] = ResolversParentTypes['Market_groupAvgAggregate']> = ResolversObject<{
  categoryId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  chainId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  collateralDecimals?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  deployTimestamp?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  deployTxnBlockNumber?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  minTradeSize?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Market_GroupCountResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Market_groupCount'] = ResolversParentTypes['Market_groupCount']> = ResolversObject<{
  event?: Resolver<ResolversTypes['Int'], ParentType, ContextType, Partial<Market_GroupCountEventArgs>>;
  market?: Resolver<ResolversTypes['Int'], ParentType, ContextType, Partial<Market_GroupCountMarketArgs>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Market_GroupCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Market_groupCountAggregate'] = ResolversParentTypes['Market_groupCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  address?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  baseTokenName?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  categoryId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  collateralAsset?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  collateralDecimals?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  collateralSymbol?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  deployTimestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  deployTxnBlockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  factoryAddress?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  initializationNonce?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  isCumulative?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  isYin?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsBondamount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsBondcurrency?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsClaimstatement?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsFeerate?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsOptimisticoraclev3?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsUniswappositionmanager?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsUniswapquoter?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParamsUniswapswaprouter?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  minTradeSize?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  question?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  quoteTokenName?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  resourceId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  vaultAddress?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Market_GroupGroupByResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Market_groupGroupBy'] = ResolversParentTypes['Market_groupGroupBy']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['Market_groupAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['Market_groupCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['Market_groupMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['Market_groupMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['Market_groupSumAggregate']>, ParentType, ContextType>;
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  baseTokenName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  categoryId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  collateralAsset?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  collateralDecimals?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  collateralSymbol?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  deployTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  deployTxnBlockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  factoryAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  initializationNonce?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  isCumulative?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isYin?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondcurrency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsClaimstatement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsOptimisticoraclev3?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswappositionmanager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapquoter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapswaprouter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  minTradeSize?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quoteTokenName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  vaultAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Market_GroupMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Market_groupMaxAggregate'] = ResolversParentTypes['Market_groupMaxAggregate']> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  baseTokenName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  categoryId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  chainId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  collateralAsset?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  collateralDecimals?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  collateralSymbol?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  deployTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  deployTxnBlockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  factoryAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  initializationNonce?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  isCumulative?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  isYin?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondcurrency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsClaimstatement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsOptimisticoraclev3?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswappositionmanager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapquoter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapswaprouter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  minTradeSize?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quoteTokenName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  vaultAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Market_GroupMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Market_groupMinAggregate'] = ResolversParentTypes['Market_groupMinAggregate']> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  baseTokenName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  categoryId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  chainId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  collateralAsset?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  collateralDecimals?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  collateralSymbol?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  deployTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  deployTxnBlockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  factoryAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  initializationNonce?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  isCumulative?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  isYin?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondcurrency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsClaimstatement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsOptimisticoraclev3?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswappositionmanager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapquoter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  marketParamsUniswapswaprouter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  minTradeSize?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quoteTokenName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  vaultAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Market_GroupSumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Market_groupSumAggregate'] = ResolversParentTypes['Market_groupSumAggregate']> = ResolversObject<{
  categoryId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  chainId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  collateralDecimals?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  deployTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  deployTxnBlockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsBondamount?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketParamsFeerate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  minTradeSize?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PnLTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['PnLType'] = ResolversParentTypes['PnLType']> = ResolversObject<{
  marketId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  openPositionsPnL?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  positionCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  positions?: Resolver<Array<ResolversTypes['Int']>, ParentType, ContextType>;
  totalDeposits?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  totalPnL?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  totalWithdrawals?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PositionResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Position'] = ResolversParentTypes['Position']> = ResolversObject<{
  _count?: Resolver<Maybe<ResolversTypes['PositionCount']>, ParentType, ContextType>;
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  highPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  isLP?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isSettled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  lowPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  positionId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PositionAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['PositionAvgAggregate'] = ResolversParentTypes['PositionAvgAggregate']> = ResolversObject<{
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  highPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  lowPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  positionId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PositionCountResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['PositionCount'] = ResolversParentTypes['PositionCount']> = ResolversObject<{
  transaction?: Resolver<ResolversTypes['Int'], ParentType, ContextType, Partial<PositionCountTransactionArgs>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PositionCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['PositionCountAggregate'] = ResolversParentTypes['PositionCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  baseToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  borrowedBaseToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  collateral?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  highPriceTick?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  isLP?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  isSettled?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  lowPriceTick?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  lpBaseToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  lpQuoteToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  positionId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  quoteToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PositionGroupByResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['PositionGroupBy'] = ResolversParentTypes['PositionGroupBy']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['PositionAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['PositionCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['PositionMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['PositionMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['PositionSumAggregate']>, ParentType, ContextType>;
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  highPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  isLP?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isSettled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  lowPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  positionId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PositionMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['PositionMaxAggregate'] = ResolversParentTypes['PositionMaxAggregate']> = ResolversObject<{
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  highPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  isLP?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  isSettled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  lowPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  positionId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PositionMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['PositionMinAggregate'] = ResolversParentTypes['PositionMinAggregate']> = ResolversObject<{
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  highPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  isLP?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  isSettled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  lowPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  positionId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PositionSumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['PositionSumAggregate'] = ResolversParentTypes['PositionSumAggregate']> = ResolversObject<{
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  highPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lowPriceTick?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  positionId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  aggregateCache_candle?: Resolver<ResolversTypes['AggregateCache_candle'], ParentType, ContextType, Partial<QueryAggregateCache_CandleArgs>>;
  aggregateCategory?: Resolver<ResolversTypes['AggregateCategory'], ParentType, ContextType, Partial<QueryAggregateCategoryArgs>>;
  aggregateCrypto_prices?: Resolver<ResolversTypes['AggregateCrypto_prices'], ParentType, ContextType, Partial<QueryAggregateCrypto_PricesArgs>>;
  aggregateEvent?: Resolver<ResolversTypes['AggregateEvent'], ParentType, ContextType, Partial<QueryAggregateEventArgs>>;
  aggregateMarket?: Resolver<ResolversTypes['AggregateMarket'], ParentType, ContextType, Partial<QueryAggregateMarketArgs>>;
  aggregateMarket_group?: Resolver<ResolversTypes['AggregateMarket_group'], ParentType, ContextType, Partial<QueryAggregateMarket_GroupArgs>>;
  aggregatePosition?: Resolver<ResolversTypes['AggregatePosition'], ParentType, ContextType, Partial<QueryAggregatePositionArgs>>;
  aggregateRender_job?: Resolver<ResolversTypes['AggregateRender_job'], ParentType, ContextType, Partial<QueryAggregateRender_JobArgs>>;
  aggregateResource?: Resolver<ResolversTypes['AggregateResource'], ParentType, ContextType, Partial<QueryAggregateResourceArgs>>;
  aggregateResource_price?: Resolver<ResolversTypes['AggregateResource_price'], ParentType, ContextType, Partial<QueryAggregateResource_PriceArgs>>;
  aggregateTransaction?: Resolver<ResolversTypes['AggregateTransaction'], ParentType, ContextType, Partial<QueryAggregateTransactionArgs>>;
  cache_candle?: Resolver<Maybe<ResolversTypes['Cache_candle']>, ParentType, ContextType, RequireFields<QueryCache_CandleArgs, 'where'>>;
  cache_candles?: Resolver<Array<ResolversTypes['Cache_candle']>, ParentType, ContextType, Partial<QueryCache_CandlesArgs>>;
  categories?: Resolver<Array<ResolversTypes['Category']>, ParentType, ContextType, Partial<QueryCategoriesArgs>>;
  category?: Resolver<Maybe<ResolversTypes['Category']>, ParentType, ContextType, RequireFields<QueryCategoryArgs, 'where'>>;
  event?: Resolver<Maybe<ResolversTypes['Event']>, ParentType, ContextType, RequireFields<QueryEventArgs, 'where'>>;
  events?: Resolver<Array<ResolversTypes['Event']>, ParentType, ContextType, Partial<QueryEventsArgs>>;
  findFirstCache_candle?: Resolver<Maybe<ResolversTypes['Cache_candle']>, ParentType, ContextType, Partial<QueryFindFirstCache_CandleArgs>>;
  findFirstCategory?: Resolver<Maybe<ResolversTypes['Category']>, ParentType, ContextType, Partial<QueryFindFirstCategoryArgs>>;
  findFirstCategoryOrThrow?: Resolver<Maybe<ResolversTypes['Category']>, ParentType, ContextType, Partial<QueryFindFirstCategoryOrThrowArgs>>;
  findFirstCrypto_prices?: Resolver<Maybe<ResolversTypes['Crypto_prices']>, ParentType, ContextType, Partial<QueryFindFirstCrypto_PricesArgs>>;
  findFirstEvent?: Resolver<Maybe<ResolversTypes['Event']>, ParentType, ContextType, Partial<QueryFindFirstEventArgs>>;
  findFirstEventOrThrow?: Resolver<Maybe<ResolversTypes['Event']>, ParentType, ContextType, Partial<QueryFindFirstEventOrThrowArgs>>;
  findFirstMarket?: Resolver<Maybe<ResolversTypes['Market']>, ParentType, ContextType, Partial<QueryFindFirstMarketArgs>>;
  findFirstMarketOrThrow?: Resolver<Maybe<ResolversTypes['Market']>, ParentType, ContextType, Partial<QueryFindFirstMarketOrThrowArgs>>;
  findFirstMarket_group?: Resolver<Maybe<ResolversTypes['Market_group']>, ParentType, ContextType, Partial<QueryFindFirstMarket_GroupArgs>>;
  findFirstMarket_groupOrThrow?: Resolver<Maybe<ResolversTypes['Market_group']>, ParentType, ContextType, Partial<QueryFindFirstMarket_GroupOrThrowArgs>>;
  findFirstPosition?: Resolver<Maybe<ResolversTypes['Position']>, ParentType, ContextType, Partial<QueryFindFirstPositionArgs>>;
  findFirstPositionOrThrow?: Resolver<Maybe<ResolversTypes['Position']>, ParentType, ContextType, Partial<QueryFindFirstPositionOrThrowArgs>>;
  findFirstRender_job?: Resolver<Maybe<ResolversTypes['Render_job']>, ParentType, ContextType, Partial<QueryFindFirstRender_JobArgs>>;
  findFirstResource?: Resolver<Maybe<ResolversTypes['Resource']>, ParentType, ContextType, Partial<QueryFindFirstResourceArgs>>;
  findFirstResourceOrThrow?: Resolver<Maybe<ResolversTypes['Resource']>, ParentType, ContextType, Partial<QueryFindFirstResourceOrThrowArgs>>;
  findFirstResource_price?: Resolver<Maybe<ResolversTypes['Resource_price']>, ParentType, ContextType, Partial<QueryFindFirstResource_PriceArgs>>;
  findFirstResource_priceOrThrow?: Resolver<Maybe<ResolversTypes['Resource_price']>, ParentType, ContextType, Partial<QueryFindFirstResource_PriceOrThrowArgs>>;
  findFirstTransaction?: Resolver<Maybe<ResolversTypes['Transaction']>, ParentType, ContextType, Partial<QueryFindFirstTransactionArgs>>;
  findFirstTransactionOrThrow?: Resolver<Maybe<ResolversTypes['Transaction']>, ParentType, ContextType, Partial<QueryFindFirstTransactionOrThrowArgs>>;
  findManyCrypto_prices?: Resolver<Array<ResolversTypes['Crypto_prices']>, ParentType, ContextType, Partial<QueryFindManyCrypto_PricesArgs>>;
  findUniqueCrypto_prices?: Resolver<Maybe<ResolversTypes['Crypto_prices']>, ParentType, ContextType, RequireFields<QueryFindUniqueCrypto_PricesArgs, 'where'>>;
  getCategory?: Resolver<Maybe<ResolversTypes['Category']>, ParentType, ContextType, RequireFields<QueryGetCategoryArgs, 'where'>>;
  getEvent?: Resolver<Maybe<ResolversTypes['Event']>, ParentType, ContextType, RequireFields<QueryGetEventArgs, 'where'>>;
  getMarket?: Resolver<Maybe<ResolversTypes['Market']>, ParentType, ContextType, RequireFields<QueryGetMarketArgs, 'where'>>;
  getMarketLeaderboard?: Resolver<Array<ResolversTypes['PnLType']>, ParentType, ContextType, RequireFields<QueryGetMarketLeaderboardArgs, 'address' | 'chainId' | 'marketId'>>;
  getMarket_group?: Resolver<Maybe<ResolversTypes['Market_group']>, ParentType, ContextType, RequireFields<QueryGetMarket_GroupArgs, 'where'>>;
  getPosition?: Resolver<Maybe<ResolversTypes['Position']>, ParentType, ContextType, RequireFields<QueryGetPositionArgs, 'where'>>;
  getResource?: Resolver<Maybe<ResolversTypes['Resource']>, ParentType, ContextType, RequireFields<QueryGetResourceArgs, 'where'>>;
  getResource_price?: Resolver<Maybe<ResolversTypes['Resource_price']>, ParentType, ContextType, RequireFields<QueryGetResource_PriceArgs, 'where'>>;
  getTransaction?: Resolver<Maybe<ResolversTypes['Transaction']>, ParentType, ContextType, RequireFields<QueryGetTransactionArgs, 'where'>>;
  groupByCategory?: Resolver<Array<ResolversTypes['CategoryGroupBy']>, ParentType, ContextType, RequireFields<QueryGroupByCategoryArgs, 'by'>>;
  groupByEvent?: Resolver<Array<ResolversTypes['EventGroupBy']>, ParentType, ContextType, RequireFields<QueryGroupByEventArgs, 'by'>>;
  groupByMarket?: Resolver<Array<ResolversTypes['MarketGroupBy']>, ParentType, ContextType, RequireFields<QueryGroupByMarketArgs, 'by'>>;
  groupByMarket_group?: Resolver<Array<ResolversTypes['Market_groupGroupBy']>, ParentType, ContextType, RequireFields<QueryGroupByMarket_GroupArgs, 'by'>>;
  groupByPosition?: Resolver<Array<ResolversTypes['PositionGroupBy']>, ParentType, ContextType, RequireFields<QueryGroupByPositionArgs, 'by'>>;
  groupByResource?: Resolver<Array<ResolversTypes['ResourceGroupBy']>, ParentType, ContextType, RequireFields<QueryGroupByResourceArgs, 'by'>>;
  groupByResource_price?: Resolver<Array<ResolversTypes['Resource_priceGroupBy']>, ParentType, ContextType, RequireFields<QueryGroupByResource_PriceArgs, 'by'>>;
  groupByTransaction?: Resolver<Array<ResolversTypes['TransactionGroupBy']>, ParentType, ContextType, RequireFields<QueryGroupByTransactionArgs, 'by'>>;
  indexCandlesFromCache?: Resolver<ResolversTypes['CandleAndTimestampType'], ParentType, ContextType, RequireFields<QueryIndexCandlesFromCacheArgs, 'address' | 'chainId' | 'from' | 'interval' | 'marketId' | 'to'>>;
  indexPriceAtTime?: Resolver<Maybe<ResolversTypes['CandleType']>, ParentType, ContextType, RequireFields<QueryIndexPriceAtTimeArgs, 'address' | 'chainId' | 'marketId' | 'timestamp'>>;
  legacyMarketCandles?: Resolver<Array<ResolversTypes['CandleType']>, ParentType, ContextType, RequireFields<QueryLegacyMarketCandlesArgs, 'address' | 'chainId' | 'from' | 'interval' | 'marketId' | 'to'>>;
  market?: Resolver<Maybe<ResolversTypes['Market']>, ParentType, ContextType, RequireFields<QueryMarketArgs, 'where'>>;
  marketCandlesFromCache?: Resolver<ResolversTypes['CandleAndTimestampType'], ParentType, ContextType, RequireFields<QueryMarketCandlesFromCacheArgs, 'address' | 'chainId' | 'from' | 'interval' | 'marketId' | 'to'>>;
  marketGroup?: Resolver<Maybe<ResolversTypes['Market_group']>, ParentType, ContextType, RequireFields<QueryMarketGroupArgs, 'address' | 'chainId'>>;
  marketGroups?: Resolver<Array<ResolversTypes['Market_group']>, ParentType, ContextType, Partial<QueryMarketGroupsArgs>>;
  market_group?: Resolver<Maybe<ResolversTypes['Market_group']>, ParentType, ContextType, RequireFields<QueryMarket_GroupArgs, 'where'>>;
  market_groups?: Resolver<Array<ResolversTypes['Market_group']>, ParentType, ContextType, Partial<QueryMarket_GroupsArgs>>;
  markets?: Resolver<Array<ResolversTypes['Market']>, ParentType, ContextType, RequireFields<QueryMarketsArgs, 'chainId' | 'marketAddress' | 'marketId'>>;
  position?: Resolver<Maybe<ResolversTypes['Position']>, ParentType, ContextType, RequireFields<QueryPositionArgs, 'where'>>;
  positions?: Resolver<Array<ResolversTypes['Position']>, ParentType, ContextType, Partial<QueryPositionsArgs>>;
  render_job?: Resolver<Maybe<ResolversTypes['Render_job']>, ParentType, ContextType, RequireFields<QueryRender_JobArgs, 'where'>>;
  render_jobs?: Resolver<Array<ResolversTypes['Render_job']>, ParentType, ContextType, Partial<QueryRender_JobsArgs>>;
  resource?: Resolver<Maybe<ResolversTypes['Resource']>, ParentType, ContextType, RequireFields<QueryResourceArgs, 'slug'>>;
  resourceCandlesFromCache?: Resolver<ResolversTypes['CandleAndTimestampType'], ParentType, ContextType, RequireFields<QueryResourceCandlesFromCacheArgs, 'from' | 'interval' | 'slug' | 'to'>>;
  resourcePrices?: Resolver<Array<ResolversTypes['Resource_price']>, ParentType, ContextType>;
  resourceTrailingAverageCandlesFromCache?: Resolver<ResolversTypes['CandleAndTimestampType'], ParentType, ContextType, RequireFields<QueryResourceTrailingAverageCandlesFromCacheArgs, 'from' | 'interval' | 'slug' | 'to' | 'trailingAvgTime'>>;
  resource_price?: Resolver<Maybe<ResolversTypes['Resource_price']>, ParentType, ContextType, RequireFields<QueryResource_PriceArgs, 'where'>>;
  resource_prices?: Resolver<Array<ResolversTypes['Resource_price']>, ParentType, ContextType, Partial<QueryResource_PricesArgs>>;
  resources?: Resolver<Array<ResolversTypes['Resource']>, ParentType, ContextType, Partial<QueryResourcesArgs>>;
  totalVolumeByMarket?: Resolver<ResolversTypes['Float'], ParentType, ContextType, RequireFields<QueryTotalVolumeByMarketArgs, 'chainId' | 'marketAddress' | 'marketId'>>;
  transaction?: Resolver<Maybe<ResolversTypes['Transaction']>, ParentType, ContextType, RequireFields<QueryTransactionArgs, 'where'>>;
  transactions?: Resolver<Array<ResolversTypes['Transaction']>, ParentType, ContextType, Partial<QueryTransactionsArgs>>;
}>;

export type Render_JobResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Render_job'] = ResolversParentTypes['Render_job']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  jobId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  serviceId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Render_JobAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Render_jobAvgAggregate'] = ResolversParentTypes['Render_jobAvgAggregate']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Render_JobCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Render_jobCountAggregate'] = ResolversParentTypes['Render_jobCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  jobId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  serviceId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Render_JobMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Render_jobMaxAggregate'] = ResolversParentTypes['Render_jobMaxAggregate']> = ResolversObject<{
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  jobId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  serviceId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Render_JobMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Render_jobMinAggregate'] = ResolversParentTypes['Render_jobMinAggregate']> = ResolversObject<{
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  jobId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  serviceId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Render_JobSumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Render_jobSumAggregate'] = ResolversParentTypes['Render_jobSumAggregate']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ResourceResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Resource'] = ResolversParentTypes['Resource']> = ResolversObject<{
  _count?: Resolver<Maybe<ResolversTypes['ResourceCount']>, ParentType, ContextType>;
  categoryId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ResourceAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['ResourceAvgAggregate'] = ResolversParentTypes['ResourceAvgAggregate']> = ResolversObject<{
  categoryId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ResourceCountResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['ResourceCount'] = ResolversParentTypes['ResourceCount']> = ResolversObject<{
  market_group?: Resolver<ResolversTypes['Int'], ParentType, ContextType, Partial<ResourceCountMarket_GroupArgs>>;
  resource_price?: Resolver<ResolversTypes['Int'], ParentType, ContextType, Partial<ResourceCountResource_PriceArgs>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ResourceCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['ResourceCountAggregate'] = ResolversParentTypes['ResourceCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  categoryId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ResourceGroupByResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['ResourceGroupBy'] = ResolversParentTypes['ResourceGroupBy']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['ResourceAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['ResourceCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['ResourceMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['ResourceMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['ResourceSumAggregate']>, ParentType, ContextType>;
  categoryId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ResourceMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['ResourceMaxAggregate'] = ResolversParentTypes['ResourceMaxAggregate']> = ResolversObject<{
  categoryId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  slug?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ResourceMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['ResourceMinAggregate'] = ResolversParentTypes['ResourceMinAggregate']> = ResolversObject<{
  categoryId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  slug?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ResourceSumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['ResourceSumAggregate'] = ResolversParentTypes['ResourceSumAggregate']> = ResolversObject<{
  categoryId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resource_PriceResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Resource_price'] = ResolversParentTypes['Resource_price']> = ResolversObject<{
  blockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  feePaid?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  used?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resource_PriceAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Resource_priceAvgAggregate'] = ResolversParentTypes['Resource_priceAvgAggregate']> = ResolversObject<{
  blockNumber?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  feePaid?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  used?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  value?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resource_PriceCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Resource_priceCountAggregate'] = ResolversParentTypes['Resource_priceCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  blockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  feePaid?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  resourceId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  used?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resource_PriceGroupByResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Resource_priceGroupBy'] = ResolversParentTypes['Resource_priceGroupBy']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['Resource_priceAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['Resource_priceCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['Resource_priceMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['Resource_priceMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['Resource_priceSumAggregate']>, ParentType, ContextType>;
  blockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  feePaid?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  used?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resource_PriceMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Resource_priceMaxAggregate'] = ResolversParentTypes['Resource_priceMaxAggregate']> = ResolversObject<{
  blockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  feePaid?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  used?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  value?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resource_PriceMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Resource_priceMinAggregate'] = ResolversParentTypes['Resource_priceMinAggregate']> = ResolversObject<{
  blockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  feePaid?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  used?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  value?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resource_PriceSumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Resource_priceSumAggregate'] = ResolversParentTypes['Resource_priceSumAggregate']> = ResolversObject<{
  blockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  feePaid?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  resourceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  used?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  value?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TransactionResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Transaction'] = ResolversParentTypes['Transaction']> = ResolversObject<{
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  collateralTransferId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  eventId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  lpBaseDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketPriceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  positionId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  tradeRatioD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['transaction_type_enum'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TransactionAvgAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['TransactionAvgAggregate'] = ResolversParentTypes['TransactionAvgAggregate']> = ResolversObject<{
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateralTransferId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  eventId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  lpBaseDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketPriceId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  positionId?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  tradeRatioD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TransactionCountAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['TransactionCountAggregate'] = ResolversParentTypes['TransactionCountAggregate']> = ResolversObject<{
  _all?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  baseToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  borrowedBaseToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  collateral?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  collateralTransferId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  eventId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  lpBaseDeltaToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  lpQuoteDeltaToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketPriceId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  positionId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  quoteToken?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tradeRatioD18?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TransactionGroupByResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['TransactionGroupBy'] = ResolversParentTypes['TransactionGroupBy']> = ResolversObject<{
  _avg?: Resolver<Maybe<ResolversTypes['TransactionAvgAggregate']>, ParentType, ContextType>;
  _count?: Resolver<Maybe<ResolversTypes['TransactionCountAggregate']>, ParentType, ContextType>;
  _max?: Resolver<Maybe<ResolversTypes['TransactionMaxAggregate']>, ParentType, ContextType>;
  _min?: Resolver<Maybe<ResolversTypes['TransactionMinAggregate']>, ParentType, ContextType>;
  _sum?: Resolver<Maybe<ResolversTypes['TransactionSumAggregate']>, ParentType, ContextType>;
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  collateralTransferId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTimeISO'], ParentType, ContextType>;
  eventId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  lpBaseDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketPriceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  positionId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  tradeRatioD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['transaction_type_enum'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TransactionMaxAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['TransactionMaxAggregate'] = ResolversParentTypes['TransactionMaxAggregate']> = ResolversObject<{
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateralTransferId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  eventId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lpBaseDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketPriceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  positionId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  tradeRatioD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['transaction_type_enum']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TransactionMinAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['TransactionMinAggregate'] = ResolversParentTypes['TransactionMinAggregate']> = ResolversObject<{
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateralTransferId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTimeISO']>, ParentType, ContextType>;
  eventId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lpBaseDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketPriceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  positionId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  tradeRatioD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['transaction_type_enum']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TransactionSumAggregateResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['TransactionSumAggregate'] = ResolversParentTypes['TransactionSumAggregate']> = ResolversObject<{
  baseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateral?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  collateralTransferId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  eventId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lpBaseDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  lpQuoteDeltaToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marketPriceId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  positionId?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  tradeRatioD18?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resolvers<ContextType = ApolloContext> = ResolversObject<{
  AggregateCache_candle?: AggregateCache_CandleResolvers<ContextType>;
  AggregateCategory?: AggregateCategoryResolvers<ContextType>;
  AggregateCrypto_prices?: AggregateCrypto_PricesResolvers<ContextType>;
  AggregateEvent?: AggregateEventResolvers<ContextType>;
  AggregateMarket?: AggregateMarketResolvers<ContextType>;
  AggregateMarket_group?: AggregateMarket_GroupResolvers<ContextType>;
  AggregatePosition?: AggregatePositionResolvers<ContextType>;
  AggregateRender_job?: AggregateRender_JobResolvers<ContextType>;
  AggregateResource?: AggregateResourceResolvers<ContextType>;
  AggregateResource_price?: AggregateResource_PriceResolvers<ContextType>;
  AggregateTransaction?: AggregateTransactionResolvers<ContextType>;
  BigInt?: GraphQLScalarType;
  Cache_candle?: Cache_CandleResolvers<ContextType>;
  Cache_candleAvgAggregate?: Cache_CandleAvgAggregateResolvers<ContextType>;
  Cache_candleCountAggregate?: Cache_CandleCountAggregateResolvers<ContextType>;
  Cache_candleMaxAggregate?: Cache_CandleMaxAggregateResolvers<ContextType>;
  Cache_candleMinAggregate?: Cache_CandleMinAggregateResolvers<ContextType>;
  Cache_candleSumAggregate?: Cache_CandleSumAggregateResolvers<ContextType>;
  CandleAndTimestampType?: CandleAndTimestampTypeResolvers<ContextType>;
  CandleType?: CandleTypeResolvers<ContextType>;
  Category?: CategoryResolvers<ContextType>;
  CategoryAvgAggregate?: CategoryAvgAggregateResolvers<ContextType>;
  CategoryCount?: CategoryCountResolvers<ContextType>;
  CategoryCountAggregate?: CategoryCountAggregateResolvers<ContextType>;
  CategoryGroupBy?: CategoryGroupByResolvers<ContextType>;
  CategoryMaxAggregate?: CategoryMaxAggregateResolvers<ContextType>;
  CategoryMinAggregate?: CategoryMinAggregateResolvers<ContextType>;
  CategorySumAggregate?: CategorySumAggregateResolvers<ContextType>;
  Crypto_prices?: Crypto_PricesResolvers<ContextType>;
  Crypto_pricesAvgAggregate?: Crypto_PricesAvgAggregateResolvers<ContextType>;
  Crypto_pricesCountAggregate?: Crypto_PricesCountAggregateResolvers<ContextType>;
  Crypto_pricesMaxAggregate?: Crypto_PricesMaxAggregateResolvers<ContextType>;
  Crypto_pricesMinAggregate?: Crypto_PricesMinAggregateResolvers<ContextType>;
  Crypto_pricesSumAggregate?: Crypto_PricesSumAggregateResolvers<ContextType>;
  DateTimeISO?: GraphQLScalarType;
  Decimal?: GraphQLScalarType;
  Event?: EventResolvers<ContextType>;
  EventAvgAggregate?: EventAvgAggregateResolvers<ContextType>;
  EventCountAggregate?: EventCountAggregateResolvers<ContextType>;
  EventGroupBy?: EventGroupByResolvers<ContextType>;
  EventMaxAggregate?: EventMaxAggregateResolvers<ContextType>;
  EventMinAggregate?: EventMinAggregateResolvers<ContextType>;
  EventSumAggregate?: EventSumAggregateResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  Market?: MarketResolvers<ContextType>;
  MarketAvgAggregate?: MarketAvgAggregateResolvers<ContextType>;
  MarketCount?: MarketCountResolvers<ContextType>;
  MarketCountAggregate?: MarketCountAggregateResolvers<ContextType>;
  MarketGroupBy?: MarketGroupByResolvers<ContextType>;
  MarketMaxAggregate?: MarketMaxAggregateResolvers<ContextType>;
  MarketMinAggregate?: MarketMinAggregateResolvers<ContextType>;
  MarketSumAggregate?: MarketSumAggregateResolvers<ContextType>;
  Market_group?: Market_GroupResolvers<ContextType>;
  Market_groupAvgAggregate?: Market_GroupAvgAggregateResolvers<ContextType>;
  Market_groupCount?: Market_GroupCountResolvers<ContextType>;
  Market_groupCountAggregate?: Market_GroupCountAggregateResolvers<ContextType>;
  Market_groupGroupBy?: Market_GroupGroupByResolvers<ContextType>;
  Market_groupMaxAggregate?: Market_GroupMaxAggregateResolvers<ContextType>;
  Market_groupMinAggregate?: Market_GroupMinAggregateResolvers<ContextType>;
  Market_groupSumAggregate?: Market_GroupSumAggregateResolvers<ContextType>;
  PnLType?: PnLTypeResolvers<ContextType>;
  Position?: PositionResolvers<ContextType>;
  PositionAvgAggregate?: PositionAvgAggregateResolvers<ContextType>;
  PositionCount?: PositionCountResolvers<ContextType>;
  PositionCountAggregate?: PositionCountAggregateResolvers<ContextType>;
  PositionGroupBy?: PositionGroupByResolvers<ContextType>;
  PositionMaxAggregate?: PositionMaxAggregateResolvers<ContextType>;
  PositionMinAggregate?: PositionMinAggregateResolvers<ContextType>;
  PositionSumAggregate?: PositionSumAggregateResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Render_job?: Render_JobResolvers<ContextType>;
  Render_jobAvgAggregate?: Render_JobAvgAggregateResolvers<ContextType>;
  Render_jobCountAggregate?: Render_JobCountAggregateResolvers<ContextType>;
  Render_jobMaxAggregate?: Render_JobMaxAggregateResolvers<ContextType>;
  Render_jobMinAggregate?: Render_JobMinAggregateResolvers<ContextType>;
  Render_jobSumAggregate?: Render_JobSumAggregateResolvers<ContextType>;
  Resource?: ResourceResolvers<ContextType>;
  ResourceAvgAggregate?: ResourceAvgAggregateResolvers<ContextType>;
  ResourceCount?: ResourceCountResolvers<ContextType>;
  ResourceCountAggregate?: ResourceCountAggregateResolvers<ContextType>;
  ResourceGroupBy?: ResourceGroupByResolvers<ContextType>;
  ResourceMaxAggregate?: ResourceMaxAggregateResolvers<ContextType>;
  ResourceMinAggregate?: ResourceMinAggregateResolvers<ContextType>;
  ResourceSumAggregate?: ResourceSumAggregateResolvers<ContextType>;
  Resource_price?: Resource_PriceResolvers<ContextType>;
  Resource_priceAvgAggregate?: Resource_PriceAvgAggregateResolvers<ContextType>;
  Resource_priceCountAggregate?: Resource_PriceCountAggregateResolvers<ContextType>;
  Resource_priceGroupBy?: Resource_PriceGroupByResolvers<ContextType>;
  Resource_priceMaxAggregate?: Resource_PriceMaxAggregateResolvers<ContextType>;
  Resource_priceMinAggregate?: Resource_PriceMinAggregateResolvers<ContextType>;
  Resource_priceSumAggregate?: Resource_PriceSumAggregateResolvers<ContextType>;
  Transaction?: TransactionResolvers<ContextType>;
  TransactionAvgAggregate?: TransactionAvgAggregateResolvers<ContextType>;
  TransactionCountAggregate?: TransactionCountAggregateResolvers<ContextType>;
  TransactionGroupBy?: TransactionGroupByResolvers<ContextType>;
  TransactionMaxAggregate?: TransactionMaxAggregateResolvers<ContextType>;
  TransactionMinAggregate?: TransactionMinAggregateResolvers<ContextType>;
  TransactionSumAggregate?: TransactionSumAggregateResolvers<ContextType>;
}>;

