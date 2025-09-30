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

export type AccuracyRankType = {
  __typename?: 'AccuracyRankType';
  accuracyScore: Scalars['Float']['output'];
  attester: Scalars['String']['output'];
  rank?: Maybe<Scalars['Int']['output']>;
  totalForecasters: Scalars['Int']['output'];
};

export type AggregateAttestation = {
  __typename?: 'AggregateAttestation';
  _avg?: Maybe<AttestationAvgAggregate>;
  _count?: Maybe<AttestationCountAggregate>;
  _max?: Maybe<AttestationMaxAggregate>;
  _min?: Maybe<AttestationMinAggregate>;
  _sum?: Maybe<AttestationSumAggregate>;
};

export type AggregateCategory = {
  __typename?: 'AggregateCategory';
  _avg?: Maybe<CategoryAvgAggregate>;
  _count?: Maybe<CategoryCountAggregate>;
  _max?: Maybe<CategoryMaxAggregate>;
  _min?: Maybe<CategoryMinAggregate>;
  _sum?: Maybe<CategorySumAggregate>;
};

export type AggregateCondition = {
  __typename?: 'AggregateCondition';
  _avg?: Maybe<ConditionAvgAggregate>;
  _count?: Maybe<ConditionCountAggregate>;
  _max?: Maybe<ConditionMaxAggregate>;
  _min?: Maybe<ConditionMinAggregate>;
  _sum?: Maybe<ConditionSumAggregate>;
};

export type AggregateMarket = {
  __typename?: 'AggregateMarket';
  _avg?: Maybe<MarketAvgAggregate>;
  _count?: Maybe<MarketCountAggregate>;
  _max?: Maybe<MarketMaxAggregate>;
  _min?: Maybe<MarketMinAggregate>;
  _sum?: Maybe<MarketSumAggregate>;
};

export type AggregateMarketGroup = {
  __typename?: 'AggregateMarketGroup';
  _avg?: Maybe<MarketGroupAvgAggregate>;
  _count?: Maybe<MarketGroupCountAggregate>;
  _max?: Maybe<MarketGroupMaxAggregate>;
  _min?: Maybe<MarketGroupMinAggregate>;
  _sum?: Maybe<MarketGroupSumAggregate>;
};

export type AggregateMarketPrice = {
  __typename?: 'AggregateMarketPrice';
  _avg?: Maybe<MarketPriceAvgAggregate>;
  _count?: Maybe<MarketPriceCountAggregate>;
  _max?: Maybe<MarketPriceMaxAggregate>;
  _min?: Maybe<MarketPriceMinAggregate>;
  _sum?: Maybe<MarketPriceSumAggregate>;
};

export type AggregatePosition = {
  __typename?: 'AggregatePosition';
  _avg?: Maybe<PositionAvgAggregate>;
  _count?: Maybe<PositionCountAggregate>;
  _max?: Maybe<PositionMaxAggregate>;
  _min?: Maybe<PositionMinAggregate>;
  _sum?: Maybe<PositionSumAggregate>;
};

export type AggregateResource = {
  __typename?: 'AggregateResource';
  _avg?: Maybe<ResourceAvgAggregate>;
  _count?: Maybe<ResourceCountAggregate>;
  _max?: Maybe<ResourceMaxAggregate>;
  _min?: Maybe<ResourceMinAggregate>;
  _sum?: Maybe<ResourceSumAggregate>;
};

export type AggregateResourcePrice = {
  __typename?: 'AggregateResourcePrice';
  _avg?: Maybe<ResourcePriceAvgAggregate>;
  _count?: Maybe<ResourcePriceCountAggregate>;
  _max?: Maybe<ResourcePriceMaxAggregate>;
  _min?: Maybe<ResourcePriceMinAggregate>;
  _sum?: Maybe<ResourcePriceSumAggregate>;
};

export type AggregateTransaction = {
  __typename?: 'AggregateTransaction';
  _avg?: Maybe<TransactionAvgAggregate>;
  _count?: Maybe<TransactionCountAggregate>;
  _max?: Maybe<TransactionMaxAggregate>;
  _min?: Maybe<TransactionMinAggregate>;
  _sum?: Maybe<TransactionSumAggregate>;
};

export type AggregatedProfitEntryType = {
  __typename?: 'AggregatedProfitEntryType';
  owner: Scalars['String']['output'];
  totalPnL: Scalars['Float']['output'];
};

export type Attestation = {
  __typename?: 'Attestation';
  attestation_score?: Maybe<AttestationScore>;
  attester: Scalars['String']['output'];
  blockNumber: Scalars['Int']['output'];
  comment?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  data: Scalars['String']['output'];
  decodedDataJson: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  marketId: Scalars['String']['output'];
  prediction: Scalars['String']['output'];
  questionId: Scalars['String']['output'];
  recipient: Scalars['String']['output'];
  schemaId: Scalars['String']['output'];
  time: Scalars['Int']['output'];
  transactionHash: Scalars['String']['output'];
  uid: Scalars['String']['output'];
};


export type AttestationAttestation_ScoreArgs = {
  where?: InputMaybe<AttestationScoreWhereInput>;
};

export type AttestationAvgAggregate = {
  __typename?: 'AttestationAvgAggregate';
  blockNumber?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  time?: Maybe<Scalars['Float']['output']>;
};

export type AttestationAvgOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  time?: InputMaybe<SortOrder>;
};

export type AttestationCountAggregate = {
  __typename?: 'AttestationCountAggregate';
  _all: Scalars['Int']['output'];
  attester: Scalars['Int']['output'];
  blockNumber: Scalars['Int']['output'];
  comment: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  data: Scalars['Int']['output'];
  decodedDataJson: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  marketAddress: Scalars['Int']['output'];
  marketId: Scalars['Int']['output'];
  prediction: Scalars['Int']['output'];
  questionId: Scalars['Int']['output'];
  recipient: Scalars['Int']['output'];
  schemaId: Scalars['Int']['output'];
  time: Scalars['Int']['output'];
  transactionHash: Scalars['Int']['output'];
  uid: Scalars['Int']['output'];
};

export type AttestationCountOrderByAggregateInput = {
  attester?: InputMaybe<SortOrder>;
  blockNumber?: InputMaybe<SortOrder>;
  comment?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  data?: InputMaybe<SortOrder>;
  decodedDataJson?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketAddress?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  prediction?: InputMaybe<SortOrder>;
  questionId?: InputMaybe<SortOrder>;
  recipient?: InputMaybe<SortOrder>;
  schemaId?: InputMaybe<SortOrder>;
  time?: InputMaybe<SortOrder>;
  transactionHash?: InputMaybe<SortOrder>;
  uid?: InputMaybe<SortOrder>;
};

export type AttestationGroupBy = {
  __typename?: 'AttestationGroupBy';
  _avg?: Maybe<AttestationAvgAggregate>;
  _count?: Maybe<AttestationCountAggregate>;
  _max?: Maybe<AttestationMaxAggregate>;
  _min?: Maybe<AttestationMinAggregate>;
  _sum?: Maybe<AttestationSumAggregate>;
  attester: Scalars['String']['output'];
  blockNumber: Scalars['Int']['output'];
  comment?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  data: Scalars['String']['output'];
  decodedDataJson: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  marketId: Scalars['String']['output'];
  prediction: Scalars['String']['output'];
  questionId: Scalars['String']['output'];
  recipient: Scalars['String']['output'];
  schemaId: Scalars['String']['output'];
  time: Scalars['Int']['output'];
  transactionHash: Scalars['String']['output'];
  uid: Scalars['String']['output'];
};

export type AttestationMaxAggregate = {
  __typename?: 'AttestationMaxAggregate';
  attester?: Maybe<Scalars['String']['output']>;
  blockNumber?: Maybe<Scalars['Int']['output']>;
  comment?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  data?: Maybe<Scalars['String']['output']>;
  decodedDataJson?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  marketAddress?: Maybe<Scalars['String']['output']>;
  marketId?: Maybe<Scalars['String']['output']>;
  prediction?: Maybe<Scalars['String']['output']>;
  questionId?: Maybe<Scalars['String']['output']>;
  recipient?: Maybe<Scalars['String']['output']>;
  schemaId?: Maybe<Scalars['String']['output']>;
  time?: Maybe<Scalars['Int']['output']>;
  transactionHash?: Maybe<Scalars['String']['output']>;
  uid?: Maybe<Scalars['String']['output']>;
};

export type AttestationMaxOrderByAggregateInput = {
  attester?: InputMaybe<SortOrder>;
  blockNumber?: InputMaybe<SortOrder>;
  comment?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  data?: InputMaybe<SortOrder>;
  decodedDataJson?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketAddress?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  prediction?: InputMaybe<SortOrder>;
  questionId?: InputMaybe<SortOrder>;
  recipient?: InputMaybe<SortOrder>;
  schemaId?: InputMaybe<SortOrder>;
  time?: InputMaybe<SortOrder>;
  transactionHash?: InputMaybe<SortOrder>;
  uid?: InputMaybe<SortOrder>;
};

export type AttestationMinAggregate = {
  __typename?: 'AttestationMinAggregate';
  attester?: Maybe<Scalars['String']['output']>;
  blockNumber?: Maybe<Scalars['Int']['output']>;
  comment?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  data?: Maybe<Scalars['String']['output']>;
  decodedDataJson?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  marketAddress?: Maybe<Scalars['String']['output']>;
  marketId?: Maybe<Scalars['String']['output']>;
  prediction?: Maybe<Scalars['String']['output']>;
  questionId?: Maybe<Scalars['String']['output']>;
  recipient?: Maybe<Scalars['String']['output']>;
  schemaId?: Maybe<Scalars['String']['output']>;
  time?: Maybe<Scalars['Int']['output']>;
  transactionHash?: Maybe<Scalars['String']['output']>;
  uid?: Maybe<Scalars['String']['output']>;
};

export type AttestationMinOrderByAggregateInput = {
  attester?: InputMaybe<SortOrder>;
  blockNumber?: InputMaybe<SortOrder>;
  comment?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  data?: InputMaybe<SortOrder>;
  decodedDataJson?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketAddress?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  prediction?: InputMaybe<SortOrder>;
  questionId?: InputMaybe<SortOrder>;
  recipient?: InputMaybe<SortOrder>;
  schemaId?: InputMaybe<SortOrder>;
  time?: InputMaybe<SortOrder>;
  transactionHash?: InputMaybe<SortOrder>;
  uid?: InputMaybe<SortOrder>;
};

export type AttestationOrderByWithAggregationInput = {
  _avg?: InputMaybe<AttestationAvgOrderByAggregateInput>;
  _count?: InputMaybe<AttestationCountOrderByAggregateInput>;
  _max?: InputMaybe<AttestationMaxOrderByAggregateInput>;
  _min?: InputMaybe<AttestationMinOrderByAggregateInput>;
  _sum?: InputMaybe<AttestationSumOrderByAggregateInput>;
  attester?: InputMaybe<SortOrder>;
  blockNumber?: InputMaybe<SortOrder>;
  comment?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  data?: InputMaybe<SortOrder>;
  decodedDataJson?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketAddress?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  prediction?: InputMaybe<SortOrder>;
  questionId?: InputMaybe<SortOrder>;
  recipient?: InputMaybe<SortOrder>;
  schemaId?: InputMaybe<SortOrder>;
  time?: InputMaybe<SortOrder>;
  transactionHash?: InputMaybe<SortOrder>;
  uid?: InputMaybe<SortOrder>;
};

export type AttestationOrderByWithRelationInput = {
  attestation_score?: InputMaybe<AttestationScoreOrderByWithRelationInput>;
  attester?: InputMaybe<SortOrder>;
  blockNumber?: InputMaybe<SortOrder>;
  comment?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  data?: InputMaybe<SortOrder>;
  decodedDataJson?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketAddress?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  prediction?: InputMaybe<SortOrder>;
  questionId?: InputMaybe<SortOrder>;
  recipient?: InputMaybe<SortOrder>;
  schemaId?: InputMaybe<SortOrder>;
  time?: InputMaybe<SortOrder>;
  transactionHash?: InputMaybe<SortOrder>;
  uid?: InputMaybe<SortOrder>;
};

export type AttestationRelationFilter = {
  is?: InputMaybe<AttestationWhereInput>;
  isNot?: InputMaybe<AttestationWhereInput>;
};

export type AttestationScalarFieldEnum =
  | 'attester'
  | 'blockNumber'
  | 'comment'
  | 'createdAt'
  | 'data'
  | 'decodedDataJson'
  | 'id'
  | 'marketAddress'
  | 'marketId'
  | 'prediction'
  | 'questionId'
  | 'recipient'
  | 'schemaId'
  | 'time'
  | 'transactionHash'
  | 'uid';

export type AttestationScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<AttestationScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<AttestationScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<AttestationScalarWhereWithAggregatesInput>>;
  attester?: InputMaybe<StringWithAggregatesFilter>;
  blockNumber?: InputMaybe<IntWithAggregatesFilter>;
  comment?: InputMaybe<StringNullableWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  data?: InputMaybe<StringWithAggregatesFilter>;
  decodedDataJson?: InputMaybe<StringWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  marketAddress?: InputMaybe<StringWithAggregatesFilter>;
  marketId?: InputMaybe<StringWithAggregatesFilter>;
  prediction?: InputMaybe<StringWithAggregatesFilter>;
  questionId?: InputMaybe<StringWithAggregatesFilter>;
  recipient?: InputMaybe<StringWithAggregatesFilter>;
  schemaId?: InputMaybe<StringWithAggregatesFilter>;
  time?: InputMaybe<IntWithAggregatesFilter>;
  transactionHash?: InputMaybe<StringWithAggregatesFilter>;
  uid?: InputMaybe<StringWithAggregatesFilter>;
};

export type AttestationScore = {
  __typename?: 'AttestationScore';
  attestation: Attestation;
  attestationId: Scalars['Int']['output'];
  attester: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  errorSquared?: Maybe<Scalars['Float']['output']>;
  id: Scalars['Int']['output'];
  madeAt: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  marketId: Scalars['String']['output'];
  outcome?: Maybe<Scalars['Int']['output']>;
  probabilityD18?: Maybe<Scalars['String']['output']>;
  probabilityFloat?: Maybe<Scalars['Float']['output']>;
  questionId?: Maybe<Scalars['String']['output']>;
  scoredAt?: Maybe<Scalars['DateTimeISO']['output']>;
  used: Scalars['Boolean']['output'];
};

export type AttestationScoreNullableRelationFilter = {
  is?: InputMaybe<AttestationScoreWhereInput>;
  isNot?: InputMaybe<AttestationScoreWhereInput>;
};

export type AttestationScoreOrderByWithRelationInput = {
  attestation?: InputMaybe<AttestationOrderByWithRelationInput>;
  attestationId?: InputMaybe<SortOrder>;
  attester?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  errorSquared?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  madeAt?: InputMaybe<SortOrder>;
  marketAddress?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  outcome?: InputMaybe<SortOrderInput>;
  probabilityD18?: InputMaybe<SortOrderInput>;
  probabilityFloat?: InputMaybe<SortOrderInput>;
  questionId?: InputMaybe<SortOrderInput>;
  scoredAt?: InputMaybe<SortOrderInput>;
  used?: InputMaybe<SortOrder>;
};

export type AttestationScoreWhereInput = {
  AND?: InputMaybe<Array<AttestationScoreWhereInput>>;
  NOT?: InputMaybe<Array<AttestationScoreWhereInput>>;
  OR?: InputMaybe<Array<AttestationScoreWhereInput>>;
  attestation?: InputMaybe<AttestationRelationFilter>;
  attestationId?: InputMaybe<IntFilter>;
  attester?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  errorSquared?: InputMaybe<FloatNullableFilter>;
  id?: InputMaybe<IntFilter>;
  madeAt?: InputMaybe<IntFilter>;
  marketAddress?: InputMaybe<StringFilter>;
  marketId?: InputMaybe<StringFilter>;
  outcome?: InputMaybe<IntNullableFilter>;
  probabilityD18?: InputMaybe<StringNullableFilter>;
  probabilityFloat?: InputMaybe<FloatNullableFilter>;
  questionId?: InputMaybe<StringNullableFilter>;
  scoredAt?: InputMaybe<DateTimeNullableFilter>;
  used?: InputMaybe<BoolFilter>;
};

export type AttestationSumAggregate = {
  __typename?: 'AttestationSumAggregate';
  blockNumber?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  time?: Maybe<Scalars['Int']['output']>;
};

export type AttestationSumOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  time?: InputMaybe<SortOrder>;
};

export type AttestationWhereInput = {
  AND?: InputMaybe<Array<AttestationWhereInput>>;
  NOT?: InputMaybe<Array<AttestationWhereInput>>;
  OR?: InputMaybe<Array<AttestationWhereInput>>;
  attestation_score?: InputMaybe<AttestationScoreNullableRelationFilter>;
  attester?: InputMaybe<StringFilter>;
  blockNumber?: InputMaybe<IntFilter>;
  comment?: InputMaybe<StringNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  data?: InputMaybe<StringFilter>;
  decodedDataJson?: InputMaybe<StringFilter>;
  id?: InputMaybe<IntFilter>;
  marketAddress?: InputMaybe<StringFilter>;
  marketId?: InputMaybe<StringFilter>;
  prediction?: InputMaybe<StringFilter>;
  questionId?: InputMaybe<StringFilter>;
  recipient?: InputMaybe<StringFilter>;
  schemaId?: InputMaybe<StringFilter>;
  time?: InputMaybe<IntFilter>;
  transactionHash?: InputMaybe<StringFilter>;
  uid?: InputMaybe<StringFilter>;
};

export type AttestationWhereUniqueInput = {
  AND?: InputMaybe<Array<AttestationWhereInput>>;
  NOT?: InputMaybe<Array<AttestationWhereInput>>;
  OR?: InputMaybe<Array<AttestationWhereInput>>;
  attestation_score?: InputMaybe<AttestationScoreNullableRelationFilter>;
  attester?: InputMaybe<StringFilter>;
  blockNumber?: InputMaybe<IntFilter>;
  comment?: InputMaybe<StringNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  data?: InputMaybe<StringFilter>;
  decodedDataJson?: InputMaybe<StringFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  marketAddress?: InputMaybe<StringFilter>;
  marketId?: InputMaybe<StringFilter>;
  prediction?: InputMaybe<StringFilter>;
  questionId?: InputMaybe<StringFilter>;
  recipient?: InputMaybe<StringFilter>;
  schemaId?: InputMaybe<StringFilter>;
  time?: InputMaybe<IntFilter>;
  transactionHash?: InputMaybe<StringFilter>;
  uid?: InputMaybe<Scalars['String']['input']>;
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
  conditions: Array<Condition>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  marketGroups: Array<MarketGroup>;
  name: Scalars['String']['output'];
  resources: Array<Resource>;
  slug: Scalars['String']['output'];
};


export type CategoryConditionsArgs = {
  cursor?: InputMaybe<ConditionWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};


export type CategoryMarketGroupsArgs = {
  cursor?: InputMaybe<MarketGroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketGroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketGroupWhereInput>;
};


export type CategoryResourcesArgs = {
  cursor?: InputMaybe<ResourceWhereUniqueInput>;
  distinct?: InputMaybe<Array<ResourceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ResourceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourceWhereInput>;
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
  condition: Scalars['Int']['output'];
  market_group: Scalars['Int']['output'];
  resource: Scalars['Int']['output'];
};


export type CategoryCountConditionArgs = {
  where?: InputMaybe<ConditionWhereInput>;
};


export type CategoryCountMarket_GroupArgs = {
  where?: InputMaybe<MarketGroupWhereInput>;
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
  conditions?: InputMaybe<ConditionOrderByRelationAggregateInput>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketGroups?: InputMaybe<MarketGroupOrderByRelationAggregateInput>;
  name?: InputMaybe<SortOrder>;
  resources?: InputMaybe<ResourceOrderByRelationAggregateInput>;
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
  conditions?: InputMaybe<ConditionListRelationFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  marketGroups?: InputMaybe<MarketGroupListRelationFilter>;
  name?: InputMaybe<StringFilter>;
  resources?: InputMaybe<ResourceListRelationFilter>;
  slug?: InputMaybe<StringFilter>;
};

export type CategoryWhereUniqueInput = {
  AND?: InputMaybe<Array<CategoryWhereInput>>;
  NOT?: InputMaybe<Array<CategoryWhereInput>>;
  OR?: InputMaybe<Array<CategoryWhereInput>>;
  conditions?: InputMaybe<ConditionListRelationFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  marketGroups?: InputMaybe<MarketGroupListRelationFilter>;
  name?: InputMaybe<Scalars['String']['input']>;
  resources?: InputMaybe<ResourceListRelationFilter>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type CollateralTransfer = {
  __typename?: 'CollateralTransfer';
  collateral: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  owner: Scalars['String']['output'];
  timestamp: Scalars['Int']['output'];
  transaction?: Maybe<Transaction>;
  transactionHash: Scalars['String']['output'];
};


export type CollateralTransferTransactionArgs = {
  where?: InputMaybe<TransactionWhereInput>;
};

export type CollateralTransferNullableRelationFilter = {
  is?: InputMaybe<CollateralTransferWhereInput>;
  isNot?: InputMaybe<CollateralTransferWhereInput>;
};

export type CollateralTransferOrderByWithRelationInput = {
  collateral?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  owner?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  transaction?: InputMaybe<TransactionOrderByWithRelationInput>;
  transactionHash?: InputMaybe<SortOrder>;
};

export type CollateralTransferWhereInput = {
  AND?: InputMaybe<Array<CollateralTransferWhereInput>>;
  NOT?: InputMaybe<Array<CollateralTransferWhereInput>>;
  OR?: InputMaybe<Array<CollateralTransferWhereInput>>;
  collateral?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  owner?: InputMaybe<StringFilter>;
  timestamp?: InputMaybe<IntFilter>;
  transaction?: InputMaybe<TransactionNullableRelationFilter>;
  transactionHash?: InputMaybe<StringFilter>;
};

export type Condition = {
  __typename?: 'Condition';
  category?: Maybe<Category>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  claimStatement: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  description: Scalars['String']['output'];
  endTime: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  public: Scalars['Boolean']['output'];
  question: Scalars['String']['output'];
  shortName?: Maybe<Scalars['String']['output']>;
  similarMarkets: Array<Scalars['String']['output']>;
};


export type ConditionCategoryArgs = {
  where?: InputMaybe<CategoryWhereInput>;
};

export type ConditionAvgAggregate = {
  __typename?: 'ConditionAvgAggregate';
  categoryId?: Maybe<Scalars['Float']['output']>;
  endTime?: Maybe<Scalars['Float']['output']>;
};

export type ConditionAvgOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
};

export type ConditionCountAggregate = {
  __typename?: 'ConditionCountAggregate';
  _all: Scalars['Int']['output'];
  categoryId: Scalars['Int']['output'];
  claimStatement: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  description: Scalars['Int']['output'];
  endTime: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  public: Scalars['Int']['output'];
  question: Scalars['Int']['output'];
  shortName: Scalars['Int']['output'];
  similarMarkets: Scalars['Int']['output'];
};

export type ConditionCountOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  claimStatement?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrder>;
  similarMarkets?: InputMaybe<SortOrder>;
};

export type ConditionGroupBy = {
  __typename?: 'ConditionGroupBy';
  _avg?: Maybe<ConditionAvgAggregate>;
  _count?: Maybe<ConditionCountAggregate>;
  _max?: Maybe<ConditionMaxAggregate>;
  _min?: Maybe<ConditionMinAggregate>;
  _sum?: Maybe<ConditionSumAggregate>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  claimStatement: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  description: Scalars['String']['output'];
  endTime: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  public: Scalars['Boolean']['output'];
  question: Scalars['String']['output'];
  shortName?: Maybe<Scalars['String']['output']>;
  similarMarkets?: Maybe<Array<Scalars['String']['output']>>;
};

export type ConditionListRelationFilter = {
  every?: InputMaybe<ConditionWhereInput>;
  none?: InputMaybe<ConditionWhereInput>;
  some?: InputMaybe<ConditionWhereInput>;
};

export type ConditionMaxAggregate = {
  __typename?: 'ConditionMaxAggregate';
  categoryId?: Maybe<Scalars['Int']['output']>;
  claimStatement?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  endTime?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  public?: Maybe<Scalars['Boolean']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
};

export type ConditionMaxOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  claimStatement?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrder>;
};

export type ConditionMinAggregate = {
  __typename?: 'ConditionMinAggregate';
  categoryId?: Maybe<Scalars['Int']['output']>;
  claimStatement?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  endTime?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  public?: Maybe<Scalars['Boolean']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
};

export type ConditionMinOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  claimStatement?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrder>;
};

export type ConditionOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type ConditionOrderByWithAggregationInput = {
  _avg?: InputMaybe<ConditionAvgOrderByAggregateInput>;
  _count?: InputMaybe<ConditionCountOrderByAggregateInput>;
  _max?: InputMaybe<ConditionMaxOrderByAggregateInput>;
  _min?: InputMaybe<ConditionMinOrderByAggregateInput>;
  _sum?: InputMaybe<ConditionSumOrderByAggregateInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  claimStatement?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrderInput>;
  similarMarkets?: InputMaybe<SortOrder>;
};

export type ConditionOrderByWithRelationInput = {
  category?: InputMaybe<CategoryOrderByWithRelationInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  claimStatement?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrderInput>;
  similarMarkets?: InputMaybe<SortOrder>;
};

export type ConditionScalarFieldEnum =
  | 'categoryId'
  | 'claimStatement'
  | 'createdAt'
  | 'description'
  | 'endTime'
  | 'id'
  | 'public'
  | 'question'
  | 'shortName'
  | 'similarMarkets';

export type ConditionScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<ConditionScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<ConditionScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<ConditionScalarWhereWithAggregatesInput>>;
  categoryId?: InputMaybe<IntNullableWithAggregatesFilter>;
  claimStatement?: InputMaybe<StringWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  description?: InputMaybe<StringWithAggregatesFilter>;
  endTime?: InputMaybe<IntWithAggregatesFilter>;
  id?: InputMaybe<StringWithAggregatesFilter>;
  public?: InputMaybe<BoolWithAggregatesFilter>;
  question?: InputMaybe<StringWithAggregatesFilter>;
  shortName?: InputMaybe<StringNullableWithAggregatesFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
};

export type ConditionSumAggregate = {
  __typename?: 'ConditionSumAggregate';
  categoryId?: Maybe<Scalars['Int']['output']>;
  endTime?: Maybe<Scalars['Int']['output']>;
};

export type ConditionSumOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
};

export type ConditionSummary = {
  __typename?: 'ConditionSummary';
  endTime?: Maybe<Scalars['Int']['output']>;
  id: Scalars['String']['output'];
  question?: Maybe<Scalars['String']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
};

export type ConditionWhereInput = {
  AND?: InputMaybe<Array<ConditionWhereInput>>;
  NOT?: InputMaybe<Array<ConditionWhereInput>>;
  OR?: InputMaybe<Array<ConditionWhereInput>>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  claimStatement?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  description?: InputMaybe<StringFilter>;
  endTime?: InputMaybe<IntFilter>;
  id?: InputMaybe<StringFilter>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringFilter>;
  shortName?: InputMaybe<StringNullableFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
};

export type ConditionWhereUniqueInput = {
  AND?: InputMaybe<Array<ConditionWhereInput>>;
  NOT?: InputMaybe<Array<ConditionWhereInput>>;
  OR?: InputMaybe<Array<ConditionWhereInput>>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  claimStatement?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  description?: InputMaybe<StringFilter>;
  endTime?: InputMaybe<IntFilter>;
  id?: InputMaybe<Scalars['String']['input']>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringFilter>;
  shortName?: InputMaybe<StringNullableFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
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
  marketGroup?: Maybe<MarketGroup>;
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  timestamp: Scalars['BigInt']['output'];
  transaction?: Maybe<Transaction>;
  transactionHash: Scalars['String']['output'];
};


export type EventMarketGroupArgs = {
  where?: InputMaybe<MarketGroupWhereInput>;
};


export type EventTransactionArgs = {
  where?: InputMaybe<TransactionWhereInput>;
};

export type EventListRelationFilter = {
  every?: InputMaybe<EventWhereInput>;
  none?: InputMaybe<EventWhereInput>;
  some?: InputMaybe<EventWhereInput>;
};

export type EventNullableRelationFilter = {
  is?: InputMaybe<EventWhereInput>;
  isNot?: InputMaybe<EventWhereInput>;
};

export type EventOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type EventOrderByWithRelationInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  logData?: InputMaybe<SortOrder>;
  logIndex?: InputMaybe<SortOrder>;
  marketGroup?: InputMaybe<MarketGroupOrderByWithRelationInput>;
  marketGroupId?: InputMaybe<SortOrderInput>;
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

export type EventTransactionHashMarketGroupIdBlockNumberLogIndexCompoundUniqueInput = {
  blockNumber: Scalars['Int']['input'];
  logIndex: Scalars['Int']['input'];
  marketGroupId: Scalars['Int']['input'];
  transactionHash: Scalars['String']['input'];
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
  marketGroup?: InputMaybe<MarketGroupNullableRelationFilter>;
  marketGroupId?: InputMaybe<IntNullableFilter>;
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
  marketGroup?: InputMaybe<MarketGroupNullableRelationFilter>;
  marketGroupId?: InputMaybe<IntNullableFilter>;
  timestamp?: InputMaybe<BigIntFilter>;
  transaction?: InputMaybe<TransactionNullableRelationFilter>;
  transactionHash?: InputMaybe<StringFilter>;
  transactionHash_marketGroupId_blockNumber_logIndex?: InputMaybe<EventTransactionHashMarketGroupIdBlockNumberLogIndexCompoundUniqueInput>;
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

export type ForecasterScoreType = {
  __typename?: 'ForecasterScoreType';
  accuracyScore: Scalars['Float']['output'];
  attester: Scalars['String']['output'];
  numScored: Scalars['Int']['output'];
  numTimeWeighted: Scalars['Int']['output'];
  sumErrorSquared: Scalars['Float']['output'];
  sumTimeWeightedError: Scalars['Float']['output'];
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

export type Market = {
  __typename?: 'Market';
  _count?: Maybe<MarketCount>;
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  claimStatementNo?: Maybe<Scalars['String']['output']>;
  claimStatementYesOrNumeric?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  marketGroup?: Maybe<MarketGroup>;
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  marketId: Scalars['Int']['output'];
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  maxPriceD18?: Maybe<Scalars['Decimal']['output']>;
  minPriceD18?: Maybe<Scalars['Decimal']['output']>;
  optionName?: Maybe<Scalars['String']['output']>;
  poolAddress?: Maybe<Scalars['String']['output']>;
  positions: Array<Position>;
  public: Scalars['Boolean']['output'];
  question?: Maybe<Scalars['String']['output']>;
  settled?: Maybe<Scalars['Boolean']['output']>;
  settlementPriceD18?: Maybe<Scalars['Decimal']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
  similarMarkets: Array<Scalars['String']['output']>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['String']['output']>;
};


export type MarketMarketGroupArgs = {
  where?: InputMaybe<MarketGroupWhereInput>;
};


export type MarketPositionsArgs = {
  cursor?: InputMaybe<PositionWhereUniqueInput>;
  distinct?: InputMaybe<Array<PositionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<PositionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PositionWhereInput>;
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
  claimStatementNo: Scalars['Int']['output'];
  claimStatementYesOrNumeric: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  endTimestamp: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  marketGroupId: Scalars['Int']['output'];
  marketId: Scalars['Int']['output'];
  marketParamsAssertionliveness: Scalars['Int']['output'];
  marketParamsBondamount: Scalars['Int']['output'];
  marketParamsBondcurrency: Scalars['Int']['output'];
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
  settled: Scalars['Int']['output'];
  settlementPriceD18: Scalars['Int']['output'];
  shortName: Scalars['Int']['output'];
  similarMarkets: Scalars['Int']['output'];
  startTimestamp: Scalars['Int']['output'];
  startingSqrtPriceX96: Scalars['Int']['output'];
};

export type MarketCountOrderByAggregateInput = {
  baseAssetMaxPriceTick?: InputMaybe<SortOrder>;
  baseAssetMinPriceTick?: InputMaybe<SortOrder>;
  claimStatementNo?: InputMaybe<SortOrder>;
  claimStatementYesOrNumeric?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
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
  settled?: InputMaybe<SortOrder>;
  settlementPriceD18?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrder>;
  similarMarkets?: InputMaybe<SortOrder>;
  startTimestamp?: InputMaybe<SortOrder>;
  startingSqrtPriceX96?: InputMaybe<SortOrder>;
};

export type MarketGroup = {
  __typename?: 'MarketGroup';
  _count?: Maybe<MarketGroupCount>;
  address?: Maybe<Scalars['String']['output']>;
  baseTokenName?: Maybe<Scalars['String']['output']>;
  category?: Maybe<Category>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId: Scalars['Int']['output'];
  collateralAsset?: Maybe<Scalars['String']['output']>;
  collateralDecimals?: Maybe<Scalars['Int']['output']>;
  collateralSymbol?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  deployTimestamp?: Maybe<Scalars['Int']['output']>;
  deployTxnBlockNumber?: Maybe<Scalars['Int']['output']>;
  events: Array<Event>;
  factoryAddress?: Maybe<Scalars['String']['output']>;
  id: Scalars['Int']['output'];
  initializationNonce?: Maybe<Scalars['String']['output']>;
  isBridged: Scalars['Boolean']['output'];
  isCumulative: Scalars['Boolean']['output'];
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
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
  resource?: Maybe<Resource>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  rules?: Maybe<Scalars['String']['output']>;
};


export type MarketGroupCategoryArgs = {
  where?: InputMaybe<CategoryWhereInput>;
};


export type MarketGroupEventsArgs = {
  cursor?: InputMaybe<EventWhereUniqueInput>;
  distinct?: InputMaybe<Array<EventScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<EventOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<EventWhereInput>;
};


export type MarketGroupMarketsArgs = {
  cursor?: InputMaybe<MarketWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketWhereInput>;
};


export type MarketGroupResourceArgs = {
  where?: InputMaybe<ResourceWhereInput>;
};

export type MarketGroupAddressChainIdCompoundUniqueInput = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
};

export type MarketGroupAvgAggregate = {
  __typename?: 'MarketGroupAvgAggregate';
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

export type MarketGroupAvgOrderByAggregateInput = {
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

export type MarketGroupBy = {
  __typename?: 'MarketGroupBy';
  _avg?: Maybe<MarketAvgAggregate>;
  _count?: Maybe<MarketCountAggregate>;
  _max?: Maybe<MarketMaxAggregate>;
  _min?: Maybe<MarketMinAggregate>;
  _sum?: Maybe<MarketSumAggregate>;
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  claimStatementNo?: Maybe<Scalars['String']['output']>;
  claimStatementYesOrNumeric?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  marketId: Scalars['Int']['output'];
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
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
  settled?: Maybe<Scalars['Boolean']['output']>;
  settlementPriceD18?: Maybe<Scalars['Decimal']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
  similarMarkets?: Maybe<Array<Scalars['String']['output']>>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['String']['output']>;
};

export type MarketGroupCount = {
  __typename?: 'MarketGroupCount';
  event: Scalars['Int']['output'];
  market: Scalars['Int']['output'];
};


export type MarketGroupCountEventArgs = {
  where?: InputMaybe<EventWhereInput>;
};


export type MarketGroupCountMarketArgs = {
  where?: InputMaybe<MarketWhereInput>;
};

export type MarketGroupCountAggregate = {
  __typename?: 'MarketGroupCountAggregate';
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
  isBridged: Scalars['Int']['output'];
  isCumulative: Scalars['Int']['output'];
  marketParamsAssertionliveness: Scalars['Int']['output'];
  marketParamsBondamount: Scalars['Int']['output'];
  marketParamsBondcurrency: Scalars['Int']['output'];
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
  rules: Scalars['Int']['output'];
};

export type MarketGroupCountOrderByAggregateInput = {
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
  isBridged?: InputMaybe<SortOrder>;
  isCumulative?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
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
  rules?: InputMaybe<SortOrder>;
};

export type MarketGroupGroupBy = {
  __typename?: 'MarketGroupGroupBy';
  _avg?: Maybe<MarketGroupAvgAggregate>;
  _count?: Maybe<MarketGroupCountAggregate>;
  _max?: Maybe<MarketGroupMaxAggregate>;
  _min?: Maybe<MarketGroupMinAggregate>;
  _sum?: Maybe<MarketGroupSumAggregate>;
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
  isBridged: Scalars['Boolean']['output'];
  isCumulative: Scalars['Boolean']['output'];
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
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
  rules?: Maybe<Scalars['String']['output']>;
};

export type MarketGroupListRelationFilter = {
  every?: InputMaybe<MarketGroupWhereInput>;
  none?: InputMaybe<MarketGroupWhereInput>;
  some?: InputMaybe<MarketGroupWhereInput>;
};

export type MarketGroupMaxAggregate = {
  __typename?: 'MarketGroupMaxAggregate';
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
  isBridged?: Maybe<Scalars['Boolean']['output']>;
  isCumulative?: Maybe<Scalars['Boolean']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
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
  rules?: Maybe<Scalars['String']['output']>;
};

export type MarketGroupMaxOrderByAggregateInput = {
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
  isBridged?: InputMaybe<SortOrder>;
  isCumulative?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
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
  rules?: InputMaybe<SortOrder>;
};

export type MarketGroupMinAggregate = {
  __typename?: 'MarketGroupMinAggregate';
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
  isBridged?: Maybe<Scalars['Boolean']['output']>;
  isCumulative?: Maybe<Scalars['Boolean']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
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
  rules?: Maybe<Scalars['String']['output']>;
};

export type MarketGroupMinOrderByAggregateInput = {
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
  isBridged?: InputMaybe<SortOrder>;
  isCumulative?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
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
  rules?: InputMaybe<SortOrder>;
};

export type MarketGroupNullableRelationFilter = {
  is?: InputMaybe<MarketGroupWhereInput>;
  isNot?: InputMaybe<MarketGroupWhereInput>;
};

export type MarketGroupOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type MarketGroupOrderByWithAggregationInput = {
  _avg?: InputMaybe<MarketGroupAvgOrderByAggregateInput>;
  _count?: InputMaybe<MarketGroupCountOrderByAggregateInput>;
  _max?: InputMaybe<MarketGroupMaxOrderByAggregateInput>;
  _min?: InputMaybe<MarketGroupMinOrderByAggregateInput>;
  _sum?: InputMaybe<MarketGroupSumOrderByAggregateInput>;
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
  isBridged?: InputMaybe<SortOrder>;
  isCumulative?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrderInput>;
  marketParamsBondamount?: InputMaybe<SortOrderInput>;
  marketParamsBondcurrency?: InputMaybe<SortOrderInput>;
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
  rules?: InputMaybe<SortOrderInput>;
};

export type MarketGroupOrderByWithRelationInput = {
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
  events?: InputMaybe<EventOrderByRelationAggregateInput>;
  factoryAddress?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  initializationNonce?: InputMaybe<SortOrderInput>;
  isBridged?: InputMaybe<SortOrder>;
  isCumulative?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrderInput>;
  marketParamsBondamount?: InputMaybe<SortOrderInput>;
  marketParamsBondcurrency?: InputMaybe<SortOrderInput>;
  marketParamsFeerate?: InputMaybe<SortOrderInput>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrderInput>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrderInput>;
  marketParamsUniswapquoter?: InputMaybe<SortOrderInput>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrderInput>;
  markets?: InputMaybe<MarketOrderByRelationAggregateInput>;
  minTradeSize?: InputMaybe<SortOrderInput>;
  owner?: InputMaybe<SortOrderInput>;
  question?: InputMaybe<SortOrderInput>;
  quoteTokenName?: InputMaybe<SortOrderInput>;
  resource?: InputMaybe<ResourceOrderByWithRelationInput>;
  resourceId?: InputMaybe<SortOrderInput>;
  rules?: InputMaybe<SortOrderInput>;
};

export type MarketGroupScalarFieldEnum =
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
  | 'isBridged'
  | 'isCumulative'
  | 'marketParamsAssertionliveness'
  | 'marketParamsBondamount'
  | 'marketParamsBondcurrency'
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
  | 'rules';

export type MarketGroupScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<MarketGroupScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<MarketGroupScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<MarketGroupScalarWhereWithAggregatesInput>>;
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
  isBridged?: InputMaybe<BoolWithAggregatesFilter>;
  isCumulative?: InputMaybe<BoolWithAggregatesFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableWithAggregatesFilter>;
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
  rules?: InputMaybe<StringNullableWithAggregatesFilter>;
};

export type MarketGroupSumAggregate = {
  __typename?: 'MarketGroupSumAggregate';
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

export type MarketGroupSumOrderByAggregateInput = {
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

export type MarketGroupWhereInput = {
  AND?: InputMaybe<Array<MarketGroupWhereInput>>;
  NOT?: InputMaybe<Array<MarketGroupWhereInput>>;
  OR?: InputMaybe<Array<MarketGroupWhereInput>>;
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
  events?: InputMaybe<EventListRelationFilter>;
  factoryAddress?: InputMaybe<StringNullableFilter>;
  id?: InputMaybe<IntFilter>;
  initializationNonce?: InputMaybe<StringNullableFilter>;
  isBridged?: InputMaybe<BoolFilter>;
  isCumulative?: InputMaybe<BoolFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableFilter>;
  marketParamsFeerate?: InputMaybe<IntNullableFilter>;
  marketParamsOptimisticoraclev3?: InputMaybe<StringNullableFilter>;
  marketParamsUniswappositionmanager?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapquoter?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapswaprouter?: InputMaybe<StringNullableFilter>;
  markets?: InputMaybe<MarketListRelationFilter>;
  minTradeSize?: InputMaybe<DecimalNullableFilter>;
  owner?: InputMaybe<StringNullableFilter>;
  question?: InputMaybe<StringNullableFilter>;
  quoteTokenName?: InputMaybe<StringNullableFilter>;
  resource?: InputMaybe<ResourceNullableRelationFilter>;
  resourceId?: InputMaybe<IntNullableFilter>;
  rules?: InputMaybe<StringNullableFilter>;
};

export type MarketGroupWhereUniqueInput = {
  AND?: InputMaybe<Array<MarketGroupWhereInput>>;
  NOT?: InputMaybe<Array<MarketGroupWhereInput>>;
  OR?: InputMaybe<Array<MarketGroupWhereInput>>;
  address?: InputMaybe<StringNullableFilter>;
  address_chainId?: InputMaybe<MarketGroupAddressChainIdCompoundUniqueInput>;
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
  events?: InputMaybe<EventListRelationFilter>;
  factoryAddress?: InputMaybe<StringNullableFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  initializationNonce?: InputMaybe<StringNullableFilter>;
  isBridged?: InputMaybe<BoolFilter>;
  isCumulative?: InputMaybe<BoolFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableFilter>;
  marketParamsFeerate?: InputMaybe<IntNullableFilter>;
  marketParamsOptimisticoraclev3?: InputMaybe<StringNullableFilter>;
  marketParamsUniswappositionmanager?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapquoter?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapswaprouter?: InputMaybe<StringNullableFilter>;
  markets?: InputMaybe<MarketListRelationFilter>;
  minTradeSize?: InputMaybe<DecimalNullableFilter>;
  owner?: InputMaybe<StringNullableFilter>;
  question?: InputMaybe<StringNullableFilter>;
  quoteTokenName?: InputMaybe<StringNullableFilter>;
  resource?: InputMaybe<ResourceNullableRelationFilter>;
  resourceId?: InputMaybe<IntNullableFilter>;
  rules?: InputMaybe<StringNullableFilter>;
};

export type MarketListRelationFilter = {
  every?: InputMaybe<MarketWhereInput>;
  none?: InputMaybe<MarketWhereInput>;
  some?: InputMaybe<MarketWhereInput>;
};

export type MarketMarketGroupIdMarketIdCompoundUniqueInput = {
  marketGroupId: Scalars['Int']['input'];
  marketId: Scalars['Int']['input'];
};

export type MarketMaxAggregate = {
  __typename?: 'MarketMaxAggregate';
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  claimStatementNo?: Maybe<Scalars['String']['output']>;
  claimStatementYesOrNumeric?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
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
  settled?: Maybe<Scalars['Boolean']['output']>;
  settlementPriceD18?: Maybe<Scalars['Decimal']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['String']['output']>;
};

export type MarketMaxOrderByAggregateInput = {
  baseAssetMaxPriceTick?: InputMaybe<SortOrder>;
  baseAssetMinPriceTick?: InputMaybe<SortOrder>;
  claimStatementNo?: InputMaybe<SortOrder>;
  claimStatementYesOrNumeric?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
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
  settled?: InputMaybe<SortOrder>;
  settlementPriceD18?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrder>;
  startTimestamp?: InputMaybe<SortOrder>;
  startingSqrtPriceX96?: InputMaybe<SortOrder>;
};

export type MarketMinAggregate = {
  __typename?: 'MarketMinAggregate';
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  claimStatementNo?: Maybe<Scalars['String']['output']>;
  claimStatementYesOrNumeric?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  marketGroupId?: Maybe<Scalars['Int']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  marketParamsAssertionliveness?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondamount?: Maybe<Scalars['Decimal']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
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
  settled?: Maybe<Scalars['Boolean']['output']>;
  settlementPriceD18?: Maybe<Scalars['Decimal']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['String']['output']>;
};

export type MarketMinOrderByAggregateInput = {
  baseAssetMaxPriceTick?: InputMaybe<SortOrder>;
  baseAssetMinPriceTick?: InputMaybe<SortOrder>;
  claimStatementNo?: InputMaybe<SortOrder>;
  claimStatementYesOrNumeric?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrder>;
  marketParamsBondamount?: InputMaybe<SortOrder>;
  marketParamsBondcurrency?: InputMaybe<SortOrder>;
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
  settled?: InputMaybe<SortOrder>;
  settlementPriceD18?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrder>;
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
  claimStatementNo?: InputMaybe<SortOrderInput>;
  claimStatementYesOrNumeric?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  marketGroupId?: InputMaybe<SortOrderInput>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrderInput>;
  marketParamsBondamount?: InputMaybe<SortOrderInput>;
  marketParamsBondcurrency?: InputMaybe<SortOrderInput>;
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
  settled?: InputMaybe<SortOrderInput>;
  settlementPriceD18?: InputMaybe<SortOrderInput>;
  shortName?: InputMaybe<SortOrderInput>;
  similarMarkets?: InputMaybe<SortOrder>;
  startTimestamp?: InputMaybe<SortOrderInput>;
  startingSqrtPriceX96?: InputMaybe<SortOrderInput>;
};

export type MarketOrderByWithRelationInput = {
  baseAssetMaxPriceTick?: InputMaybe<SortOrderInput>;
  baseAssetMinPriceTick?: InputMaybe<SortOrderInput>;
  claimStatementNo?: InputMaybe<SortOrderInput>;
  claimStatementYesOrNumeric?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  endTimestamp?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  marketGroup?: InputMaybe<MarketGroupOrderByWithRelationInput>;
  marketGroupId?: InputMaybe<SortOrderInput>;
  marketId?: InputMaybe<SortOrder>;
  marketParamsAssertionliveness?: InputMaybe<SortOrderInput>;
  marketParamsBondamount?: InputMaybe<SortOrderInput>;
  marketParamsBondcurrency?: InputMaybe<SortOrderInput>;
  marketParamsFeerate?: InputMaybe<SortOrderInput>;
  marketParamsOptimisticoraclev3?: InputMaybe<SortOrderInput>;
  marketParamsUniswappositionmanager?: InputMaybe<SortOrderInput>;
  marketParamsUniswapquoter?: InputMaybe<SortOrderInput>;
  marketParamsUniswapswaprouter?: InputMaybe<SortOrderInput>;
  maxPriceD18?: InputMaybe<SortOrderInput>;
  minPriceD18?: InputMaybe<SortOrderInput>;
  optionName?: InputMaybe<SortOrderInput>;
  poolAddress?: InputMaybe<SortOrderInput>;
  positions?: InputMaybe<PositionOrderByRelationAggregateInput>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrderInput>;
  settled?: InputMaybe<SortOrderInput>;
  settlementPriceD18?: InputMaybe<SortOrderInput>;
  shortName?: InputMaybe<SortOrderInput>;
  similarMarkets?: InputMaybe<SortOrder>;
  startTimestamp?: InputMaybe<SortOrderInput>;
  startingSqrtPriceX96?: InputMaybe<SortOrderInput>;
};

export type MarketPrice = {
  __typename?: 'MarketPrice';
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  timestamp: Scalars['BigInt']['output'];
  transaction?: Maybe<Transaction>;
  value: Scalars['Decimal']['output'];
};


export type MarketPriceTransactionArgs = {
  where?: InputMaybe<TransactionWhereInput>;
};

export type MarketPriceAvgAggregate = {
  __typename?: 'MarketPriceAvgAggregate';
  id?: Maybe<Scalars['Float']['output']>;
  timestamp?: Maybe<Scalars['Float']['output']>;
  value?: Maybe<Scalars['Decimal']['output']>;
};

export type MarketPriceAvgOrderByAggregateInput = {
  id?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type MarketPriceCountAggregate = {
  __typename?: 'MarketPriceCountAggregate';
  _all: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  timestamp: Scalars['Int']['output'];
  value: Scalars['Int']['output'];
};

export type MarketPriceCountOrderByAggregateInput = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type MarketPriceGroupBy = {
  __typename?: 'MarketPriceGroupBy';
  _avg?: Maybe<MarketPriceAvgAggregate>;
  _count?: Maybe<MarketPriceCountAggregate>;
  _max?: Maybe<MarketPriceMaxAggregate>;
  _min?: Maybe<MarketPriceMinAggregate>;
  _sum?: Maybe<MarketPriceSumAggregate>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  timestamp: Scalars['BigInt']['output'];
  value: Scalars['Decimal']['output'];
};

export type MarketPriceMaxAggregate = {
  __typename?: 'MarketPriceMaxAggregate';
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['BigInt']['output']>;
  value?: Maybe<Scalars['Decimal']['output']>;
};

export type MarketPriceMaxOrderByAggregateInput = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type MarketPriceMinAggregate = {
  __typename?: 'MarketPriceMinAggregate';
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['BigInt']['output']>;
  value?: Maybe<Scalars['Decimal']['output']>;
};

export type MarketPriceMinOrderByAggregateInput = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type MarketPriceNullableRelationFilter = {
  is?: InputMaybe<MarketPriceWhereInput>;
  isNot?: InputMaybe<MarketPriceWhereInput>;
};

export type MarketPriceOrderByWithAggregationInput = {
  _avg?: InputMaybe<MarketPriceAvgOrderByAggregateInput>;
  _count?: InputMaybe<MarketPriceCountOrderByAggregateInput>;
  _max?: InputMaybe<MarketPriceMaxOrderByAggregateInput>;
  _min?: InputMaybe<MarketPriceMinOrderByAggregateInput>;
  _sum?: InputMaybe<MarketPriceSumOrderByAggregateInput>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type MarketPriceOrderByWithRelationInput = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  transaction?: InputMaybe<TransactionOrderByWithRelationInput>;
  value?: InputMaybe<SortOrder>;
};

export type MarketPriceScalarFieldEnum =
  | 'createdAt'
  | 'id'
  | 'timestamp'
  | 'value';

export type MarketPriceScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<MarketPriceScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<MarketPriceScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<MarketPriceScalarWhereWithAggregatesInput>>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  timestamp?: InputMaybe<BigIntWithAggregatesFilter>;
  value?: InputMaybe<DecimalWithAggregatesFilter>;
};

export type MarketPriceSumAggregate = {
  __typename?: 'MarketPriceSumAggregate';
  id?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['BigInt']['output']>;
  value?: Maybe<Scalars['Decimal']['output']>;
};

export type MarketPriceSumOrderByAggregateInput = {
  id?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type MarketPriceWhereInput = {
  AND?: InputMaybe<Array<MarketPriceWhereInput>>;
  NOT?: InputMaybe<Array<MarketPriceWhereInput>>;
  OR?: InputMaybe<Array<MarketPriceWhereInput>>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  timestamp?: InputMaybe<BigIntFilter>;
  transaction?: InputMaybe<TransactionNullableRelationFilter>;
  value?: InputMaybe<DecimalFilter>;
};

export type MarketPriceWhereUniqueInput = {
  AND?: InputMaybe<Array<MarketPriceWhereInput>>;
  NOT?: InputMaybe<Array<MarketPriceWhereInput>>;
  OR?: InputMaybe<Array<MarketPriceWhereInput>>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  timestamp?: InputMaybe<BigIntFilter>;
  transaction?: InputMaybe<TransactionNullableRelationFilter>;
  value?: InputMaybe<DecimalFilter>;
};

export type MarketScalarFieldEnum =
  | 'baseAssetMaxPriceTick'
  | 'baseAssetMinPriceTick'
  | 'claimStatementNo'
  | 'claimStatementYesOrNumeric'
  | 'createdAt'
  | 'endTimestamp'
  | 'id'
  | 'marketGroupId'
  | 'marketId'
  | 'marketParamsAssertionliveness'
  | 'marketParamsBondamount'
  | 'marketParamsBondcurrency'
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
  | 'settled'
  | 'settlementPriceD18'
  | 'shortName'
  | 'similarMarkets'
  | 'startTimestamp'
  | 'startingSqrtPriceX96';

export type MarketScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<MarketScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<MarketScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<MarketScalarWhereWithAggregatesInput>>;
  baseAssetMaxPriceTick?: InputMaybe<IntNullableWithAggregatesFilter>;
  baseAssetMinPriceTick?: InputMaybe<IntNullableWithAggregatesFilter>;
  claimStatementNo?: InputMaybe<StringNullableWithAggregatesFilter>;
  claimStatementYesOrNumeric?: InputMaybe<StringNullableWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  endTimestamp?: InputMaybe<IntNullableWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  marketGroupId?: InputMaybe<IntNullableWithAggregatesFilter>;
  marketId?: InputMaybe<IntWithAggregatesFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableWithAggregatesFilter>;
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
  settled?: InputMaybe<BoolNullableWithAggregatesFilter>;
  settlementPriceD18?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  shortName?: InputMaybe<StringNullableWithAggregatesFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
  startTimestamp?: InputMaybe<IntNullableWithAggregatesFilter>;
  startingSqrtPriceX96?: InputMaybe<StringNullableWithAggregatesFilter>;
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
};

export type MarketWhereInput = {
  AND?: InputMaybe<Array<MarketWhereInput>>;
  NOT?: InputMaybe<Array<MarketWhereInput>>;
  OR?: InputMaybe<Array<MarketWhereInput>>;
  baseAssetMaxPriceTick?: InputMaybe<IntNullableFilter>;
  baseAssetMinPriceTick?: InputMaybe<IntNullableFilter>;
  claimStatementNo?: InputMaybe<StringNullableFilter>;
  claimStatementYesOrNumeric?: InputMaybe<StringNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  endTimestamp?: InputMaybe<IntNullableFilter>;
  id?: InputMaybe<IntFilter>;
  marketGroup?: InputMaybe<MarketGroupNullableRelationFilter>;
  marketGroupId?: InputMaybe<IntNullableFilter>;
  marketId?: InputMaybe<IntFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableFilter>;
  marketParamsFeerate?: InputMaybe<IntNullableFilter>;
  marketParamsOptimisticoraclev3?: InputMaybe<StringNullableFilter>;
  marketParamsUniswappositionmanager?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapquoter?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapswaprouter?: InputMaybe<StringNullableFilter>;
  maxPriceD18?: InputMaybe<DecimalNullableFilter>;
  minPriceD18?: InputMaybe<DecimalNullableFilter>;
  optionName?: InputMaybe<StringNullableFilter>;
  poolAddress?: InputMaybe<StringNullableFilter>;
  positions?: InputMaybe<PositionListRelationFilter>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringNullableFilter>;
  settled?: InputMaybe<BoolNullableFilter>;
  settlementPriceD18?: InputMaybe<DecimalNullableFilter>;
  shortName?: InputMaybe<StringNullableFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
  startTimestamp?: InputMaybe<IntNullableFilter>;
  startingSqrtPriceX96?: InputMaybe<StringNullableFilter>;
};

export type MarketWhereUniqueInput = {
  AND?: InputMaybe<Array<MarketWhereInput>>;
  NOT?: InputMaybe<Array<MarketWhereInput>>;
  OR?: InputMaybe<Array<MarketWhereInput>>;
  baseAssetMaxPriceTick?: InputMaybe<IntNullableFilter>;
  baseAssetMinPriceTick?: InputMaybe<IntNullableFilter>;
  claimStatementNo?: InputMaybe<StringNullableFilter>;
  claimStatementYesOrNumeric?: InputMaybe<StringNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  endTimestamp?: InputMaybe<IntNullableFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  marketGroup?: InputMaybe<MarketGroupNullableRelationFilter>;
  marketGroupId?: InputMaybe<IntNullableFilter>;
  marketGroupId_marketId?: InputMaybe<MarketMarketGroupIdMarketIdCompoundUniqueInput>;
  marketId?: InputMaybe<IntFilter>;
  marketParamsAssertionliveness?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondamount?: InputMaybe<DecimalNullableFilter>;
  marketParamsBondcurrency?: InputMaybe<StringNullableFilter>;
  marketParamsFeerate?: InputMaybe<IntNullableFilter>;
  marketParamsOptimisticoraclev3?: InputMaybe<StringNullableFilter>;
  marketParamsUniswappositionmanager?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapquoter?: InputMaybe<StringNullableFilter>;
  marketParamsUniswapswaprouter?: InputMaybe<StringNullableFilter>;
  maxPriceD18?: InputMaybe<DecimalNullableFilter>;
  minPriceD18?: InputMaybe<DecimalNullableFilter>;
  optionName?: InputMaybe<StringNullableFilter>;
  poolAddress?: InputMaybe<StringNullableFilter>;
  positions?: InputMaybe<PositionListRelationFilter>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringNullableFilter>;
  settled?: InputMaybe<BoolNullableFilter>;
  settlementPriceD18?: InputMaybe<DecimalNullableFilter>;
  shortName?: InputMaybe<StringNullableFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
  startTimestamp?: InputMaybe<IntNullableFilter>;
  startingSqrtPriceX96?: InputMaybe<StringNullableFilter>;
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

export type ParlayType = {
  __typename?: 'ParlayType';
  chainId: Scalars['Int']['output'];
  endsAt?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  maker: Scalars['String']['output'];
  makerCollateral?: Maybe<Scalars['String']['output']>;
  makerNftTokenId: Scalars['String']['output'];
  makerWon?: Maybe<Scalars['Boolean']['output']>;
  marketAddress: Scalars['String']['output'];
  mintedAt: Scalars['Int']['output'];
  predictedOutcomes: Array<PredictedOutcomeType>;
  refCode?: Maybe<Scalars['String']['output']>;
  settledAt?: Maybe<Scalars['Int']['output']>;
  status: Scalars['String']['output'];
  taker: Scalars['String']['output'];
  takerCollateral?: Maybe<Scalars['String']['output']>;
  takerNftTokenId: Scalars['String']['output'];
  totalCollateral: Scalars['String']['output'];
};

export type PnLType = {
  __typename?: 'PnLType';
  collateralAddress?: Maybe<Scalars['String']['output']>;
  collateralDecimals?: Maybe<Scalars['Int']['output']>;
  collateralSymbol?: Maybe<Scalars['String']['output']>;
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
  baseToken?: Maybe<Scalars['String']['output']>;
  borrowedBaseToken?: Maybe<Scalars['String']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['String']['output']>;
  collateral: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id: Scalars['Int']['output'];
  isLP: Scalars['Boolean']['output'];
  isSettled?: Maybe<Scalars['Boolean']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  lpBaseToken?: Maybe<Scalars['String']['output']>;
  lpQuoteToken?: Maybe<Scalars['String']['output']>;
  market?: Maybe<Market>;
  marketId?: Maybe<Scalars['Int']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  positionId: Scalars['Int']['output'];
  quoteToken?: Maybe<Scalars['String']['output']>;
  transactions: Array<Transaction>;
};


export type PositionMarketArgs = {
  where?: InputMaybe<MarketWhereInput>;
};


export type PositionTransactionsArgs = {
  cursor?: InputMaybe<TransactionWhereUniqueInput>;
  distinct?: InputMaybe<Array<TransactionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<TransactionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<TransactionWhereInput>;
};

export type PositionAvgAggregate = {
  __typename?: 'PositionAvgAggregate';
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  marketId?: Maybe<Scalars['Float']['output']>;
  positionId?: Maybe<Scalars['Float']['output']>;
};

export type PositionAvgOrderByAggregateInput = {
  highPriceTick?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lowPriceTick?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
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
  baseToken?: Maybe<Scalars['String']['output']>;
  borrowedBaseToken?: Maybe<Scalars['String']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['String']['output']>;
  collateral: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id: Scalars['Int']['output'];
  isLP: Scalars['Boolean']['output'];
  isSettled?: Maybe<Scalars['Boolean']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  lpBaseToken?: Maybe<Scalars['String']['output']>;
  lpQuoteToken?: Maybe<Scalars['String']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  positionId: Scalars['Int']['output'];
  quoteToken?: Maybe<Scalars['String']['output']>;
};

export type PositionListRelationFilter = {
  every?: InputMaybe<PositionWhereInput>;
  none?: InputMaybe<PositionWhereInput>;
  some?: InputMaybe<PositionWhereInput>;
};

export type PositionMaxAggregate = {
  __typename?: 'PositionMaxAggregate';
  baseToken?: Maybe<Scalars['String']['output']>;
  borrowedBaseToken?: Maybe<Scalars['String']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['String']['output']>;
  collateral?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isLP?: Maybe<Scalars['Boolean']['output']>;
  isSettled?: Maybe<Scalars['Boolean']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  lpBaseToken?: Maybe<Scalars['String']['output']>;
  lpQuoteToken?: Maybe<Scalars['String']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['String']['output']>;
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
  baseToken?: Maybe<Scalars['String']['output']>;
  borrowedBaseToken?: Maybe<Scalars['String']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['String']['output']>;
  collateral?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isLP?: Maybe<Scalars['Boolean']['output']>;
  isSettled?: Maybe<Scalars['Boolean']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  lpBaseToken?: Maybe<Scalars['String']['output']>;
  lpQuoteToken?: Maybe<Scalars['String']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['String']['output']>;
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
  transactions?: InputMaybe<TransactionOrderByRelationAggregateInput>;
};

export type PositionPositionIdMarketIdCompoundUniqueInput = {
  marketId: Scalars['Int']['input'];
  positionId: Scalars['Int']['input'];
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
  baseToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  borrowedBaseToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  borrowedQuoteToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  collateral?: InputMaybe<StringWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  highPriceTick?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  isLP?: InputMaybe<BoolWithAggregatesFilter>;
  isSettled?: InputMaybe<BoolNullableWithAggregatesFilter>;
  lowPriceTick?: InputMaybe<DecimalNullableWithAggregatesFilter>;
  lpBaseToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  lpQuoteToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketId?: InputMaybe<IntNullableWithAggregatesFilter>;
  owner?: InputMaybe<StringNullableWithAggregatesFilter>;
  positionId?: InputMaybe<IntWithAggregatesFilter>;
  quoteToken?: InputMaybe<StringNullableWithAggregatesFilter>;
};

export type PositionSumAggregate = {
  __typename?: 'PositionSumAggregate';
  highPriceTick?: Maybe<Scalars['Decimal']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lowPriceTick?: Maybe<Scalars['Decimal']['output']>;
  marketId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
};

export type PositionSumOrderByAggregateInput = {
  highPriceTick?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lowPriceTick?: InputMaybe<SortOrder>;
  marketId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
};

export type PositionWhereInput = {
  AND?: InputMaybe<Array<PositionWhereInput>>;
  NOT?: InputMaybe<Array<PositionWhereInput>>;
  OR?: InputMaybe<Array<PositionWhereInput>>;
  baseToken?: InputMaybe<StringNullableFilter>;
  borrowedBaseToken?: InputMaybe<StringNullableFilter>;
  borrowedQuoteToken?: InputMaybe<StringNullableFilter>;
  collateral?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  highPriceTick?: InputMaybe<DecimalNullableFilter>;
  id?: InputMaybe<IntFilter>;
  isLP?: InputMaybe<BoolFilter>;
  isSettled?: InputMaybe<BoolNullableFilter>;
  lowPriceTick?: InputMaybe<DecimalNullableFilter>;
  lpBaseToken?: InputMaybe<StringNullableFilter>;
  lpQuoteToken?: InputMaybe<StringNullableFilter>;
  market?: InputMaybe<MarketNullableRelationFilter>;
  marketId?: InputMaybe<IntNullableFilter>;
  owner?: InputMaybe<StringNullableFilter>;
  positionId?: InputMaybe<IntFilter>;
  quoteToken?: InputMaybe<StringNullableFilter>;
  transactions?: InputMaybe<TransactionListRelationFilter>;
};

export type PositionWhereUniqueInput = {
  AND?: InputMaybe<Array<PositionWhereInput>>;
  NOT?: InputMaybe<Array<PositionWhereInput>>;
  OR?: InputMaybe<Array<PositionWhereInput>>;
  baseToken?: InputMaybe<StringNullableFilter>;
  borrowedBaseToken?: InputMaybe<StringNullableFilter>;
  borrowedQuoteToken?: InputMaybe<StringNullableFilter>;
  collateral?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  highPriceTick?: InputMaybe<DecimalNullableFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  isLP?: InputMaybe<BoolFilter>;
  isSettled?: InputMaybe<BoolNullableFilter>;
  lowPriceTick?: InputMaybe<DecimalNullableFilter>;
  lpBaseToken?: InputMaybe<StringNullableFilter>;
  lpQuoteToken?: InputMaybe<StringNullableFilter>;
  market?: InputMaybe<MarketNullableRelationFilter>;
  marketId?: InputMaybe<IntNullableFilter>;
  owner?: InputMaybe<StringNullableFilter>;
  positionId?: InputMaybe<IntFilter>;
  positionId_marketId?: InputMaybe<PositionPositionIdMarketIdCompoundUniqueInput>;
  quoteToken?: InputMaybe<StringNullableFilter>;
  transactions?: InputMaybe<TransactionListRelationFilter>;
};

export type PredictedOutcomeType = {
  __typename?: 'PredictedOutcomeType';
  condition?: Maybe<ConditionSummary>;
  conditionId: Scalars['String']['output'];
  prediction: Scalars['Boolean']['output'];
};

export type ProfitRankType = {
  __typename?: 'ProfitRankType';
  owner: Scalars['String']['output'];
  rank?: Maybe<Scalars['Int']['output']>;
  totalParticipants: Scalars['Int']['output'];
  totalPnL: Scalars['Float']['output'];
};

export type Query = {
  __typename?: 'Query';
  accuracyRankByAddress: AccuracyRankType;
  aggregateAttestation: AggregateAttestation;
  aggregateCategory: AggregateCategory;
  aggregateCondition: AggregateCondition;
  aggregateMarket: AggregateMarket;
  aggregateMarketGroup: AggregateMarketGroup;
  aggregateMarketPrice: AggregateMarketPrice;
  aggregatePosition: AggregatePosition;
  aggregateResource: AggregateResource;
  aggregateResourcePrice: AggregateResourcePrice;
  aggregateTransaction: AggregateTransaction;
  allTimeProfitLeaderboard: Array<AggregatedProfitEntryType>;
  attestation?: Maybe<Attestation>;
  attestations: Array<Attestation>;
  categories: Array<Category>;
  category?: Maybe<Category>;
  condition?: Maybe<Condition>;
  conditions: Array<Condition>;
  findFirstAttestation?: Maybe<Attestation>;
  findFirstAttestationOrThrow?: Maybe<Attestation>;
  findFirstCategory?: Maybe<Category>;
  findFirstCategoryOrThrow?: Maybe<Category>;
  findFirstCondition?: Maybe<Condition>;
  findFirstConditionOrThrow?: Maybe<Condition>;
  findFirstMarket?: Maybe<Market>;
  findFirstMarketGroup?: Maybe<MarketGroup>;
  findFirstMarketGroupOrThrow?: Maybe<MarketGroup>;
  findFirstMarketOrThrow?: Maybe<Market>;
  findFirstMarketPrice?: Maybe<MarketPrice>;
  findFirstMarketPriceOrThrow?: Maybe<MarketPrice>;
  findFirstPosition?: Maybe<Position>;
  findFirstPositionOrThrow?: Maybe<Position>;
  findFirstResource?: Maybe<Resource>;
  findFirstResourceOrThrow?: Maybe<Resource>;
  findFirstResourcePrice?: Maybe<ResourcePrice>;
  findFirstResourcePriceOrThrow?: Maybe<ResourcePrice>;
  findFirstTransaction?: Maybe<Transaction>;
  findFirstTransactionOrThrow?: Maybe<Transaction>;
  forecasterScore?: Maybe<ForecasterScoreType>;
  getAttestation?: Maybe<Attestation>;
  getCategory?: Maybe<Category>;
  getCondition?: Maybe<Condition>;
  getMarket?: Maybe<Market>;
  getMarketGroup?: Maybe<MarketGroup>;
  getMarketLeaderboard: Array<PnLType>;
  getMarketPrice?: Maybe<MarketPrice>;
  getParlayLeaderboard: Array<PnLType>;
  getPosition?: Maybe<Position>;
  getResource?: Maybe<Resource>;
  getResourcePrice?: Maybe<ResourcePrice>;
  getTransaction?: Maybe<Transaction>;
  groupByAttestation: Array<AttestationGroupBy>;
  groupByCategory: Array<CategoryGroupBy>;
  groupByCondition: Array<ConditionGroupBy>;
  groupByMarket: Array<MarketGroupBy>;
  groupByMarketGroup: Array<MarketGroupGroupBy>;
  groupByMarketPrice: Array<MarketPriceGroupBy>;
  groupByPosition: Array<PositionGroupBy>;
  groupByResource: Array<ResourceGroupBy>;
  groupByResourcePrice: Array<ResourcePriceGroupBy>;
  groupByTransaction: Array<TransactionGroupBy>;
  indexCandles: CandleAndTimestampType;
  indexPriceAtTime?: Maybe<CandleType>;
  legacyMarketCandles: Array<CandleType>;
  market?: Maybe<Market>;
  marketCandles: CandleAndTimestampType;
  marketGroup?: Maybe<MarketGroup>;
  marketGroups: Array<MarketGroup>;
  marketPrice?: Maybe<MarketPrice>;
  marketPrices: Array<MarketPrice>;
  markets: Array<Market>;
  position?: Maybe<Position>;
  positions: Array<Position>;
  profitRankByAddress: ProfitRankType;
  resource?: Maybe<Resource>;
  resourceCandles: CandleAndTimestampType;
  resourcePrice?: Maybe<ResourcePrice>;
  resourcePrices: Array<ResourcePrice>;
  resourceTrailingAverageCandles: CandleAndTimestampType;
  resources: Array<Resource>;
  topForecasters: Array<ForecasterScoreType>;
  totalVolumeByMarket: Scalars['Float']['output'];
  transaction?: Maybe<Transaction>;
  transactions: Array<Transaction>;
  userParlays: Array<ParlayType>;
};


export type QueryAccuracyRankByAddressArgs = {
  attester: Scalars['String']['input'];
};


export type QueryAggregateAttestationArgs = {
  cursor?: InputMaybe<AttestationWhereUniqueInput>;
  orderBy?: InputMaybe<Array<AttestationOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<AttestationWhereInput>;
};


export type QueryAggregateCategoryArgs = {
  cursor?: InputMaybe<CategoryWhereUniqueInput>;
  orderBy?: InputMaybe<Array<CategoryOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryAggregateConditionArgs = {
  cursor?: InputMaybe<ConditionWhereUniqueInput>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};


export type QueryAggregateMarketArgs = {
  cursor?: InputMaybe<MarketWhereUniqueInput>;
  orderBy?: InputMaybe<Array<MarketOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketWhereInput>;
};


export type QueryAggregateMarketGroupArgs = {
  cursor?: InputMaybe<MarketGroupWhereUniqueInput>;
  orderBy?: InputMaybe<Array<MarketGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketGroupWhereInput>;
};


export type QueryAggregateMarketPriceArgs = {
  cursor?: InputMaybe<MarketPriceWhereUniqueInput>;
  orderBy?: InputMaybe<Array<MarketPriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketPriceWhereInput>;
};


export type QueryAggregatePositionArgs = {
  cursor?: InputMaybe<PositionWhereUniqueInput>;
  orderBy?: InputMaybe<Array<PositionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PositionWhereInput>;
};


export type QueryAggregateResourceArgs = {
  cursor?: InputMaybe<ResourceWhereUniqueInput>;
  orderBy?: InputMaybe<Array<ResourceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourceWhereInput>;
};


export type QueryAggregateResourcePriceArgs = {
  cursor?: InputMaybe<ResourcePriceWhereUniqueInput>;
  orderBy?: InputMaybe<Array<ResourcePriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourcePriceWhereInput>;
};


export type QueryAggregateTransactionArgs = {
  cursor?: InputMaybe<TransactionWhereUniqueInput>;
  orderBy?: InputMaybe<Array<TransactionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<TransactionWhereInput>;
};


export type QueryAttestationArgs = {
  where: AttestationWhereUniqueInput;
};


export type QueryAttestationsArgs = {
  cursor?: InputMaybe<AttestationWhereUniqueInput>;
  distinct?: InputMaybe<Array<AttestationScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<AttestationOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<AttestationWhereInput>;
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


export type QueryConditionArgs = {
  where: ConditionWhereUniqueInput;
};


export type QueryConditionsArgs = {
  cursor?: InputMaybe<ConditionWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};


export type QueryFindFirstAttestationArgs = {
  cursor?: InputMaybe<AttestationWhereUniqueInput>;
  distinct?: InputMaybe<Array<AttestationScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<AttestationOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<AttestationWhereInput>;
};


export type QueryFindFirstAttestationOrThrowArgs = {
  cursor?: InputMaybe<AttestationWhereUniqueInput>;
  distinct?: InputMaybe<Array<AttestationScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<AttestationOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<AttestationWhereInput>;
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


export type QueryFindFirstConditionArgs = {
  cursor?: InputMaybe<ConditionWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};


export type QueryFindFirstConditionOrThrowArgs = {
  cursor?: InputMaybe<ConditionWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};


export type QueryFindFirstMarketArgs = {
  cursor?: InputMaybe<MarketWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketWhereInput>;
};


export type QueryFindFirstMarketGroupArgs = {
  cursor?: InputMaybe<MarketGroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketGroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketGroupWhereInput>;
};


export type QueryFindFirstMarketGroupOrThrowArgs = {
  cursor?: InputMaybe<MarketGroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketGroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketGroupWhereInput>;
};


export type QueryFindFirstMarketOrThrowArgs = {
  cursor?: InputMaybe<MarketWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketWhereInput>;
};


export type QueryFindFirstMarketPriceArgs = {
  cursor?: InputMaybe<MarketPriceWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketPriceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketPriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketPriceWhereInput>;
};


export type QueryFindFirstMarketPriceOrThrowArgs = {
  cursor?: InputMaybe<MarketPriceWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketPriceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketPriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketPriceWhereInput>;
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


export type QueryFindFirstResourcePriceArgs = {
  cursor?: InputMaybe<ResourcePriceWhereUniqueInput>;
  distinct?: InputMaybe<Array<ResourcePriceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ResourcePriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourcePriceWhereInput>;
};


export type QueryFindFirstResourcePriceOrThrowArgs = {
  cursor?: InputMaybe<ResourcePriceWhereUniqueInput>;
  distinct?: InputMaybe<Array<ResourcePriceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ResourcePriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourcePriceWhereInput>;
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


export type QueryForecasterScoreArgs = {
  attester: Scalars['String']['input'];
};


export type QueryGetAttestationArgs = {
  where: AttestationWhereUniqueInput;
};


export type QueryGetCategoryArgs = {
  where: CategoryWhereUniqueInput;
};


export type QueryGetConditionArgs = {
  where: ConditionWhereUniqueInput;
};


export type QueryGetMarketArgs = {
  where: MarketWhereUniqueInput;
};


export type QueryGetMarketGroupArgs = {
  where: MarketGroupWhereUniqueInput;
};


export type QueryGetMarketLeaderboardArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  marketId: Scalars['String']['input'];
};


export type QueryGetMarketPriceArgs = {
  where: MarketPriceWhereUniqueInput;
};


export type QueryGetParlayLeaderboardArgs = {
  chainId: Scalars['Int']['input'];
  marketAddress: Scalars['String']['input'];
};


export type QueryGetPositionArgs = {
  where: PositionWhereUniqueInput;
};


export type QueryGetResourceArgs = {
  where: ResourceWhereUniqueInput;
};


export type QueryGetResourcePriceArgs = {
  where: ResourcePriceWhereUniqueInput;
};


export type QueryGetTransactionArgs = {
  where: TransactionWhereUniqueInput;
};


export type QueryGroupByAttestationArgs = {
  by: Array<AttestationScalarFieldEnum>;
  having?: InputMaybe<AttestationScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<AttestationOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<AttestationWhereInput>;
};


export type QueryGroupByCategoryArgs = {
  by: Array<CategoryScalarFieldEnum>;
  having?: InputMaybe<CategoryScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<CategoryOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<CategoryWhereInput>;
};


export type QueryGroupByConditionArgs = {
  by: Array<ConditionScalarFieldEnum>;
  having?: InputMaybe<ConditionScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};


export type QueryGroupByMarketArgs = {
  by: Array<MarketScalarFieldEnum>;
  having?: InputMaybe<MarketScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<MarketOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketWhereInput>;
};


export type QueryGroupByMarketGroupArgs = {
  by: Array<MarketGroupScalarFieldEnum>;
  having?: InputMaybe<MarketGroupScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<MarketGroupOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketGroupWhereInput>;
};


export type QueryGroupByMarketPriceArgs = {
  by: Array<MarketPriceScalarFieldEnum>;
  having?: InputMaybe<MarketPriceScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<MarketPriceOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketPriceWhereInput>;
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


export type QueryGroupByResourcePriceArgs = {
  by: Array<ResourcePriceScalarFieldEnum>;
  having?: InputMaybe<ResourcePriceScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<ResourcePriceOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourcePriceWhereInput>;
};


export type QueryGroupByTransactionArgs = {
  by: Array<TransactionScalarFieldEnum>;
  having?: InputMaybe<TransactionScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<TransactionOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<TransactionWhereInput>;
};


export type QueryIndexCandlesArgs = {
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


export type QueryMarketCandlesArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  marketId: Scalars['String']['input'];
  to: Scalars['Int']['input'];
};


export type QueryMarketGroupArgs = {
  where: MarketGroupWhereUniqueInput;
};


export type QueryMarketGroupsArgs = {
  cursor?: InputMaybe<MarketGroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketGroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketGroupWhereInput>;
};


export type QueryMarketPriceArgs = {
  where: MarketPriceWhereUniqueInput;
};


export type QueryMarketPricesArgs = {
  cursor?: InputMaybe<MarketPriceWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketPriceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketPriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketPriceWhereInput>;
};


export type QueryMarketsArgs = {
  cursor?: InputMaybe<MarketWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketWhereInput>;
};


export type QueryPositionArgs = {
  where: PositionWhereUniqueInput;
};


export type QueryPositionsArgs = {
  cursor?: InputMaybe<PositionWhereUniqueInput>;
  distinct?: InputMaybe<Array<PositionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<PositionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PositionWhereInput>;
};


export type QueryProfitRankByAddressArgs = {
  owner: Scalars['String']['input'];
};


export type QueryResourceArgs = {
  where: ResourceWhereUniqueInput;
};


export type QueryResourceCandlesArgs = {
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  slug: Scalars['String']['input'];
  to: Scalars['Int']['input'];
};


export type QueryResourcePriceArgs = {
  where: ResourcePriceWhereUniqueInput;
};


export type QueryResourcePricesArgs = {
  cursor?: InputMaybe<ResourcePriceWhereUniqueInput>;
  distinct?: InputMaybe<Array<ResourcePriceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ResourcePriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourcePriceWhereInput>;
};


export type QueryResourceTrailingAverageCandlesArgs = {
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  slug: Scalars['String']['input'];
  to: Scalars['Int']['input'];
  trailingAvgTime: Scalars['Int']['input'];
};


export type QueryResourcesArgs = {
  cursor?: InputMaybe<ResourceWhereUniqueInput>;
  distinct?: InputMaybe<Array<ResourceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ResourceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourceWhereInput>;
};


export type QueryTopForecastersArgs = {
  limit?: Scalars['Int']['input'];
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
  cursor?: InputMaybe<TransactionWhereUniqueInput>;
  distinct?: InputMaybe<Array<TransactionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<TransactionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<TransactionWhereInput>;
};


export type QueryUserParlaysArgs = {
  address: Scalars['String']['input'];
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};

export type QueryMode =
  | 'default'
  | 'insensitive';

export type Resource = {
  __typename?: 'Resource';
  _count?: Maybe<ResourceCount>;
  category?: Maybe<Category>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  marketGroups: Array<MarketGroup>;
  name: Scalars['String']['output'];
  resourcePrices: Array<ResourcePrice>;
  slug: Scalars['String']['output'];
};


export type ResourceCategoryArgs = {
  where?: InputMaybe<CategoryWhereInput>;
};


export type ResourceMarketGroupsArgs = {
  cursor?: InputMaybe<MarketGroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<MarketGroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<MarketGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<MarketGroupWhereInput>;
};


export type ResourceResourcePricesArgs = {
  cursor?: InputMaybe<ResourcePriceWhereUniqueInput>;
  distinct?: InputMaybe<Array<ResourcePriceScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ResourcePriceOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ResourcePriceWhereInput>;
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
  where?: InputMaybe<MarketGroupWhereInput>;
};


export type ResourceCountResource_PriceArgs = {
  where?: InputMaybe<ResourcePriceWhereInput>;
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
  marketGroups?: InputMaybe<MarketGroupOrderByRelationAggregateInput>;
  name?: InputMaybe<SortOrder>;
  resourcePrices?: InputMaybe<ResourcePriceOrderByRelationAggregateInput>;
  slug?: InputMaybe<SortOrder>;
};

export type ResourcePrice = {
  __typename?: 'ResourcePrice';
  blockNumber: Scalars['Int']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  feePaid: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  resource?: Maybe<Resource>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  timestamp: Scalars['Int']['output'];
  used: Scalars['String']['output'];
  value: Scalars['String']['output'];
};


export type ResourcePriceResourceArgs = {
  where?: InputMaybe<ResourceWhereInput>;
};

export type ResourcePriceAvgAggregate = {
  __typename?: 'ResourcePriceAvgAggregate';
  blockNumber?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  resourceId?: Maybe<Scalars['Float']['output']>;
  timestamp?: Maybe<Scalars['Float']['output']>;
};

export type ResourcePriceAvgOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
};

export type ResourcePriceCountAggregate = {
  __typename?: 'ResourcePriceCountAggregate';
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

export type ResourcePriceCountOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type ResourcePriceGroupBy = {
  __typename?: 'ResourcePriceGroupBy';
  _avg?: Maybe<ResourcePriceAvgAggregate>;
  _count?: Maybe<ResourcePriceCountAggregate>;
  _max?: Maybe<ResourcePriceMaxAggregate>;
  _min?: Maybe<ResourcePriceMinAggregate>;
  _sum?: Maybe<ResourcePriceSumAggregate>;
  blockNumber: Scalars['Int']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  feePaid: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  resourceId?: Maybe<Scalars['Int']['output']>;
  timestamp: Scalars['Int']['output'];
  used: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type ResourcePriceListRelationFilter = {
  every?: InputMaybe<ResourcePriceWhereInput>;
  none?: InputMaybe<ResourcePriceWhereInput>;
  some?: InputMaybe<ResourcePriceWhereInput>;
};

export type ResourcePriceMaxAggregate = {
  __typename?: 'ResourcePriceMaxAggregate';
  blockNumber?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  feePaid?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['Int']['output']>;
  used?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['String']['output']>;
};

export type ResourcePriceMaxOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type ResourcePriceMinAggregate = {
  __typename?: 'ResourcePriceMinAggregate';
  blockNumber?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  feePaid?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['Int']['output']>;
  used?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['String']['output']>;
};

export type ResourcePriceMinOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type ResourcePriceOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type ResourcePriceOrderByWithAggregationInput = {
  _avg?: InputMaybe<ResourcePriceAvgOrderByAggregateInput>;
  _count?: InputMaybe<ResourcePriceCountOrderByAggregateInput>;
  _max?: InputMaybe<ResourcePriceMaxOrderByAggregateInput>;
  _min?: InputMaybe<ResourcePriceMinOrderByAggregateInput>;
  _sum?: InputMaybe<ResourcePriceSumOrderByAggregateInput>;
  blockNumber?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  feePaid?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrderInput>;
  timestamp?: InputMaybe<SortOrder>;
  used?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type ResourcePriceOrderByWithRelationInput = {
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

export type ResourcePriceResourceIdTimestampCompoundUniqueInput = {
  resourceId: Scalars['Int']['input'];
  timestamp: Scalars['Int']['input'];
};

export type ResourcePriceScalarFieldEnum =
  | 'blockNumber'
  | 'createdAt'
  | 'feePaid'
  | 'id'
  | 'resourceId'
  | 'timestamp'
  | 'used'
  | 'value';

export type ResourcePriceScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<ResourcePriceScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<ResourcePriceScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<ResourcePriceScalarWhereWithAggregatesInput>>;
  blockNumber?: InputMaybe<IntWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  feePaid?: InputMaybe<StringWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  resourceId?: InputMaybe<IntNullableWithAggregatesFilter>;
  timestamp?: InputMaybe<IntWithAggregatesFilter>;
  used?: InputMaybe<StringWithAggregatesFilter>;
  value?: InputMaybe<StringWithAggregatesFilter>;
};

export type ResourcePriceSumAggregate = {
  __typename?: 'ResourcePriceSumAggregate';
  blockNumber?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  resourceId?: Maybe<Scalars['Int']['output']>;
  timestamp?: Maybe<Scalars['Int']['output']>;
};

export type ResourcePriceSumOrderByAggregateInput = {
  blockNumber?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  resourceId?: InputMaybe<SortOrder>;
  timestamp?: InputMaybe<SortOrder>;
};

export type ResourcePriceWhereInput = {
  AND?: InputMaybe<Array<ResourcePriceWhereInput>>;
  NOT?: InputMaybe<Array<ResourcePriceWhereInput>>;
  OR?: InputMaybe<Array<ResourcePriceWhereInput>>;
  blockNumber?: InputMaybe<IntFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  feePaid?: InputMaybe<StringFilter>;
  id?: InputMaybe<IntFilter>;
  resource?: InputMaybe<ResourceNullableRelationFilter>;
  resourceId?: InputMaybe<IntNullableFilter>;
  timestamp?: InputMaybe<IntFilter>;
  used?: InputMaybe<StringFilter>;
  value?: InputMaybe<StringFilter>;
};

export type ResourcePriceWhereUniqueInput = {
  AND?: InputMaybe<Array<ResourcePriceWhereInput>>;
  NOT?: InputMaybe<Array<ResourcePriceWhereInput>>;
  OR?: InputMaybe<Array<ResourcePriceWhereInput>>;
  blockNumber?: InputMaybe<IntFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  feePaid?: InputMaybe<StringFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  resource?: InputMaybe<ResourceNullableRelationFilter>;
  resourceId?: InputMaybe<IntNullableFilter>;
  resourceId_timestamp?: InputMaybe<ResourcePriceResourceIdTimestampCompoundUniqueInput>;
  timestamp?: InputMaybe<IntFilter>;
  used?: InputMaybe<StringFilter>;
  value?: InputMaybe<StringFilter>;
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
  marketGroups?: InputMaybe<MarketGroupListRelationFilter>;
  name?: InputMaybe<StringFilter>;
  resourcePrices?: InputMaybe<ResourcePriceListRelationFilter>;
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
  marketGroups?: InputMaybe<MarketGroupListRelationFilter>;
  name?: InputMaybe<Scalars['String']['input']>;
  resourcePrices?: InputMaybe<ResourcePriceListRelationFilter>;
  slug?: InputMaybe<Scalars['String']['input']>;
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

export type StringNullableListFilter = {
  equals?: InputMaybe<Array<Scalars['String']['input']>>;
  has?: InputMaybe<Scalars['String']['input']>;
  hasEvery?: InputMaybe<Array<Scalars['String']['input']>>;
  hasSome?: InputMaybe<Array<Scalars['String']['input']>>;
  isEmpty?: InputMaybe<Scalars['Boolean']['input']>;
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
  baseToken?: Maybe<Scalars['String']['output']>;
  borrowedBaseToken?: Maybe<Scalars['String']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['String']['output']>;
  collateral: Scalars['String']['output'];
  collateralTransfer?: Maybe<CollateralTransfer>;
  collateralTransferId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  event?: Maybe<Event>;
  eventId?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  lpBaseDeltaToken?: Maybe<Scalars['String']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['String']['output']>;
  marketPrice?: Maybe<MarketPrice>;
  marketPriceId?: Maybe<Scalars['Int']['output']>;
  position?: Maybe<Position>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['String']['output']>;
  tradeRatioD18?: Maybe<Scalars['String']['output']>;
  type: Transaction_Type_Enum;
};


export type TransactionCollateralTransferArgs = {
  where?: InputMaybe<CollateralTransferWhereInput>;
};


export type TransactionEventArgs = {
  where?: InputMaybe<EventWhereInput>;
};


export type TransactionMarketPriceArgs = {
  where?: InputMaybe<MarketPriceWhereInput>;
};


export type TransactionPositionArgs = {
  where?: InputMaybe<PositionWhereInput>;
};

export type TransactionAvgAggregate = {
  __typename?: 'TransactionAvgAggregate';
  collateralTransferId?: Maybe<Scalars['Float']['output']>;
  eventId?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
  marketPriceId?: Maybe<Scalars['Float']['output']>;
  positionId?: Maybe<Scalars['Float']['output']>;
};

export type TransactionAvgOrderByAggregateInput = {
  collateralTransferId?: InputMaybe<SortOrder>;
  eventId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketPriceId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
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
  baseToken?: Maybe<Scalars['String']['output']>;
  borrowedBaseToken?: Maybe<Scalars['String']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['String']['output']>;
  collateral: Scalars['String']['output'];
  collateralTransferId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  eventId?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  lpBaseDeltaToken?: Maybe<Scalars['String']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['String']['output']>;
  marketPriceId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['String']['output']>;
  tradeRatioD18?: Maybe<Scalars['String']['output']>;
  type: Transaction_Type_Enum;
};

export type TransactionListRelationFilter = {
  every?: InputMaybe<TransactionWhereInput>;
  none?: InputMaybe<TransactionWhereInput>;
  some?: InputMaybe<TransactionWhereInput>;
};

export type TransactionMaxAggregate = {
  __typename?: 'TransactionMaxAggregate';
  baseToken?: Maybe<Scalars['String']['output']>;
  borrowedBaseToken?: Maybe<Scalars['String']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['String']['output']>;
  collateral?: Maybe<Scalars['String']['output']>;
  collateralTransferId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  eventId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lpBaseDeltaToken?: Maybe<Scalars['String']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['String']['output']>;
  marketPriceId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['String']['output']>;
  tradeRatioD18?: Maybe<Scalars['String']['output']>;
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
  baseToken?: Maybe<Scalars['String']['output']>;
  borrowedBaseToken?: Maybe<Scalars['String']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['String']['output']>;
  collateral?: Maybe<Scalars['String']['output']>;
  collateralTransferId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  eventId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lpBaseDeltaToken?: Maybe<Scalars['String']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['String']['output']>;
  marketPriceId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  quoteToken?: Maybe<Scalars['String']['output']>;
  tradeRatioD18?: Maybe<Scalars['String']['output']>;
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
  collateralTransfer?: InputMaybe<CollateralTransferOrderByWithRelationInput>;
  collateralTransferId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  event?: InputMaybe<EventOrderByWithRelationInput>;
  eventId?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  lpBaseDeltaToken?: InputMaybe<SortOrderInput>;
  lpQuoteDeltaToken?: InputMaybe<SortOrderInput>;
  marketPrice?: InputMaybe<MarketPriceOrderByWithRelationInput>;
  marketPriceId?: InputMaybe<SortOrderInput>;
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
  baseToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  borrowedBaseToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  borrowedQuoteToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  collateral?: InputMaybe<StringWithAggregatesFilter>;
  collateralTransferId?: InputMaybe<IntNullableWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  eventId?: InputMaybe<IntNullableWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  lpBaseDeltaToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  lpQuoteDeltaToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  marketPriceId?: InputMaybe<IntNullableWithAggregatesFilter>;
  positionId?: InputMaybe<IntNullableWithAggregatesFilter>;
  quoteToken?: InputMaybe<StringNullableWithAggregatesFilter>;
  tradeRatioD18?: InputMaybe<StringNullableWithAggregatesFilter>;
  type?: InputMaybe<Enumtransaction_Type_EnumWithAggregatesFilter>;
};

export type TransactionSumAggregate = {
  __typename?: 'TransactionSumAggregate';
  collateralTransferId?: Maybe<Scalars['Int']['output']>;
  eventId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  marketPriceId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
};

export type TransactionSumOrderByAggregateInput = {
  collateralTransferId?: InputMaybe<SortOrder>;
  eventId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  marketPriceId?: InputMaybe<SortOrder>;
  positionId?: InputMaybe<SortOrder>;
};

export type TransactionWhereInput = {
  AND?: InputMaybe<Array<TransactionWhereInput>>;
  NOT?: InputMaybe<Array<TransactionWhereInput>>;
  OR?: InputMaybe<Array<TransactionWhereInput>>;
  baseToken?: InputMaybe<StringNullableFilter>;
  borrowedBaseToken?: InputMaybe<StringNullableFilter>;
  borrowedQuoteToken?: InputMaybe<StringNullableFilter>;
  collateral?: InputMaybe<StringFilter>;
  collateralTransfer?: InputMaybe<CollateralTransferNullableRelationFilter>;
  collateralTransferId?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  event?: InputMaybe<EventNullableRelationFilter>;
  eventId?: InputMaybe<IntNullableFilter>;
  id?: InputMaybe<IntFilter>;
  lpBaseDeltaToken?: InputMaybe<StringNullableFilter>;
  lpQuoteDeltaToken?: InputMaybe<StringNullableFilter>;
  marketPrice?: InputMaybe<MarketPriceNullableRelationFilter>;
  marketPriceId?: InputMaybe<IntNullableFilter>;
  position?: InputMaybe<PositionNullableRelationFilter>;
  positionId?: InputMaybe<IntNullableFilter>;
  quoteToken?: InputMaybe<StringNullableFilter>;
  tradeRatioD18?: InputMaybe<StringNullableFilter>;
  type?: InputMaybe<Enumtransaction_Type_EnumFilter>;
};

export type TransactionWhereUniqueInput = {
  AND?: InputMaybe<Array<TransactionWhereInput>>;
  NOT?: InputMaybe<Array<TransactionWhereInput>>;
  OR?: InputMaybe<Array<TransactionWhereInput>>;
  baseToken?: InputMaybe<StringNullableFilter>;
  borrowedBaseToken?: InputMaybe<StringNullableFilter>;
  borrowedQuoteToken?: InputMaybe<StringNullableFilter>;
  collateral?: InputMaybe<StringFilter>;
  collateralTransfer?: InputMaybe<CollateralTransferNullableRelationFilter>;
  collateralTransferId?: InputMaybe<Scalars['Int']['input']>;
  createdAt?: InputMaybe<DateTimeFilter>;
  event?: InputMaybe<EventNullableRelationFilter>;
  eventId?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  lpBaseDeltaToken?: InputMaybe<StringNullableFilter>;
  lpQuoteDeltaToken?: InputMaybe<StringNullableFilter>;
  marketPrice?: InputMaybe<MarketPriceNullableRelationFilter>;
  marketPriceId?: InputMaybe<Scalars['Int']['input']>;
  position?: InputMaybe<PositionNullableRelationFilter>;
  positionId?: InputMaybe<IntNullableFilter>;
  quoteToken?: InputMaybe<StringNullableFilter>;
  tradeRatioD18?: InputMaybe<StringNullableFilter>;
  type?: InputMaybe<Enumtransaction_Type_EnumFilter>;
};

export type Transaction_Type_Enum =
  | 'addLiquidity'
  | 'burnParlayNFTs'
  | 'long'
  | 'mintParlayNFTs'
  | 'removeLiquidity'
  | 'settledPosition'
  | 'short';
