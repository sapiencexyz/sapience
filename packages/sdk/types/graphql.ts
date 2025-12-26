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
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar.This scalar is serialized to a string in ISO 8601 format and parsed from a string in ISO 8601 format. */
  DateTimeISO: { input: any; output: any; }
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

export type AggregateConditionGroup = {
  __typename?: 'AggregateConditionGroup';
  _avg?: Maybe<ConditionGroupAvgAggregate>;
  _count?: Maybe<ConditionGroupCountAggregate>;
  _max?: Maybe<ConditionGroupMaxAggregate>;
  _min?: Maybe<ConditionGroupMinAggregate>;
  _sum?: Maybe<ConditionGroupSumAggregate>;
};

export type AggregateUser = {
  __typename?: 'AggregateUser';
  _avg?: Maybe<UserAvgAggregate>;
  _count?: Maybe<UserCountAggregate>;
  _max?: Maybe<UserMaxAggregate>;
  _min?: Maybe<UserMinAggregate>;
  _sum?: Maybe<UserSumAggregate>;
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
  condition?: Maybe<Condition>;
  conditionId?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  data: Scalars['String']['output'];
  decodedDataJson: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  prediction: Scalars['String']['output'];
  recipient: Scalars['String']['output'];
  resolver?: Maybe<Scalars['String']['output']>;
  schemaId: Scalars['String']['output'];
  time: Scalars['Int']['output'];
  transactionHash: Scalars['String']['output'];
  uid: Scalars['String']['output'];
};


export type AttestationAttestation_ScoreArgs = {
  where?: InputMaybe<AttestationScoreWhereInput>;
};


export type AttestationConditionArgs = {
  where?: InputMaybe<ConditionWhereInput>;
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
  conditionId: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  data: Scalars['Int']['output'];
  decodedDataJson: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  prediction: Scalars['Int']['output'];
  recipient: Scalars['Int']['output'];
  resolver: Scalars['Int']['output'];
  schemaId: Scalars['Int']['output'];
  time: Scalars['Int']['output'];
  transactionHash: Scalars['Int']['output'];
  uid: Scalars['Int']['output'];
};

export type AttestationCountOrderByAggregateInput = {
  attester?: InputMaybe<SortOrder>;
  blockNumber?: InputMaybe<SortOrder>;
  comment?: InputMaybe<SortOrder>;
  conditionId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  data?: InputMaybe<SortOrder>;
  decodedDataJson?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  prediction?: InputMaybe<SortOrder>;
  recipient?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrder>;
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
  conditionId?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  data: Scalars['String']['output'];
  decodedDataJson: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  prediction: Scalars['String']['output'];
  recipient: Scalars['String']['output'];
  resolver?: Maybe<Scalars['String']['output']>;
  schemaId: Scalars['String']['output'];
  time: Scalars['Int']['output'];
  transactionHash: Scalars['String']['output'];
  uid: Scalars['String']['output'];
};

export type AttestationListRelationFilter = {
  every?: InputMaybe<AttestationWhereInput>;
  none?: InputMaybe<AttestationWhereInput>;
  some?: InputMaybe<AttestationWhereInput>;
};

export type AttestationMaxAggregate = {
  __typename?: 'AttestationMaxAggregate';
  attester?: Maybe<Scalars['String']['output']>;
  blockNumber?: Maybe<Scalars['Int']['output']>;
  comment?: Maybe<Scalars['String']['output']>;
  conditionId?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  data?: Maybe<Scalars['String']['output']>;
  decodedDataJson?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  prediction?: Maybe<Scalars['String']['output']>;
  recipient?: Maybe<Scalars['String']['output']>;
  resolver?: Maybe<Scalars['String']['output']>;
  schemaId?: Maybe<Scalars['String']['output']>;
  time?: Maybe<Scalars['Int']['output']>;
  transactionHash?: Maybe<Scalars['String']['output']>;
  uid?: Maybe<Scalars['String']['output']>;
};

export type AttestationMaxOrderByAggregateInput = {
  attester?: InputMaybe<SortOrder>;
  blockNumber?: InputMaybe<SortOrder>;
  comment?: InputMaybe<SortOrder>;
  conditionId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  data?: InputMaybe<SortOrder>;
  decodedDataJson?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  prediction?: InputMaybe<SortOrder>;
  recipient?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrder>;
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
  conditionId?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  data?: Maybe<Scalars['String']['output']>;
  decodedDataJson?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  prediction?: Maybe<Scalars['String']['output']>;
  recipient?: Maybe<Scalars['String']['output']>;
  resolver?: Maybe<Scalars['String']['output']>;
  schemaId?: Maybe<Scalars['String']['output']>;
  time?: Maybe<Scalars['Int']['output']>;
  transactionHash?: Maybe<Scalars['String']['output']>;
  uid?: Maybe<Scalars['String']['output']>;
};

export type AttestationMinOrderByAggregateInput = {
  attester?: InputMaybe<SortOrder>;
  blockNumber?: InputMaybe<SortOrder>;
  comment?: InputMaybe<SortOrder>;
  conditionId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  data?: InputMaybe<SortOrder>;
  decodedDataJson?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  prediction?: InputMaybe<SortOrder>;
  recipient?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrder>;
  schemaId?: InputMaybe<SortOrder>;
  time?: InputMaybe<SortOrder>;
  transactionHash?: InputMaybe<SortOrder>;
  uid?: InputMaybe<SortOrder>;
};

export type AttestationOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
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
  conditionId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  data?: InputMaybe<SortOrder>;
  decodedDataJson?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  prediction?: InputMaybe<SortOrder>;
  recipient?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrderInput>;
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
  condition?: InputMaybe<ConditionOrderByWithRelationInput>;
  conditionId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  data?: InputMaybe<SortOrder>;
  decodedDataJson?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  prediction?: InputMaybe<SortOrder>;
  recipient?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrderInput>;
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
  | 'conditionId'
  | 'createdAt'
  | 'data'
  | 'decodedDataJson'
  | 'id'
  | 'prediction'
  | 'recipient'
  | 'resolver'
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
  conditionId?: InputMaybe<StringNullableWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  data?: InputMaybe<StringWithAggregatesFilter>;
  decodedDataJson?: InputMaybe<StringWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  prediction?: InputMaybe<StringWithAggregatesFilter>;
  recipient?: InputMaybe<StringWithAggregatesFilter>;
  resolver?: InputMaybe<StringNullableWithAggregatesFilter>;
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
  marketAddress?: Maybe<Scalars['String']['output']>;
  marketId?: Maybe<Scalars['String']['output']>;
  outcome?: Maybe<Scalars['Int']['output']>;
  probabilityD18?: Maybe<Scalars['String']['output']>;
  probabilityFloat?: Maybe<Scalars['Float']['output']>;
  questionId?: Maybe<Scalars['String']['output']>;
  resolver?: Maybe<Scalars['String']['output']>;
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
  marketAddress?: InputMaybe<SortOrderInput>;
  marketId?: InputMaybe<SortOrderInput>;
  outcome?: InputMaybe<SortOrderInput>;
  probabilityD18?: InputMaybe<SortOrderInput>;
  probabilityFloat?: InputMaybe<SortOrderInput>;
  questionId?: InputMaybe<SortOrderInput>;
  resolver?: InputMaybe<SortOrderInput>;
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
  condition?: InputMaybe<ConditionNullableRelationFilter>;
  conditionId?: InputMaybe<StringNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  data?: InputMaybe<StringFilter>;
  decodedDataJson?: InputMaybe<StringFilter>;
  id?: InputMaybe<IntFilter>;
  prediction?: InputMaybe<StringFilter>;
  recipient?: InputMaybe<StringFilter>;
  resolver?: InputMaybe<StringNullableFilter>;
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
  condition?: InputMaybe<ConditionNullableRelationFilter>;
  conditionId?: InputMaybe<StringNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  data?: InputMaybe<StringFilter>;
  decodedDataJson?: InputMaybe<StringFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  prediction?: InputMaybe<StringFilter>;
  recipient?: InputMaybe<StringFilter>;
  resolver?: InputMaybe<StringNullableFilter>;
  schemaId?: InputMaybe<StringFilter>;
  time?: InputMaybe<IntFilter>;
  transactionHash?: InputMaybe<StringFilter>;
  uid?: InputMaybe<Scalars['String']['input']>;
};

export type BoolFilter = {
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolFilter>;
};

export type BoolNullableFilter = {
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolNullableFilter>;
};

export type BoolWithAggregatesFilter = {
  _count?: InputMaybe<NestedIntFilter>;
  _max?: InputMaybe<NestedBoolFilter>;
  _min?: InputMaybe<NestedBoolFilter>;
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolWithAggregatesFilter>;
};

export type Category = {
  __typename?: 'Category';
  _count?: Maybe<CategoryCount>;
  conditionGroups: Array<ConditionGroup>;
  conditions: Array<Condition>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
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
  condition_group: Scalars['Int']['output'];
};


export type CategoryCountConditionArgs = {
  where?: InputMaybe<ConditionWhereInput>;
};


export type CategoryCountCondition_GroupArgs = {
  where?: InputMaybe<ConditionGroupWhereInput>;
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
  name?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type Condition = {
  __typename?: 'Condition';
  _count?: Maybe<ConditionCount>;
  assertionId?: Maybe<Scalars['String']['output']>;
  assertionTimestamp?: Maybe<Scalars['Int']['output']>;
  attestations: Array<Attestation>;
  category?: Maybe<Category>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId: Scalars['Int']['output'];
  claimStatement: Scalars['String']['output'];
  conditionGroup?: Maybe<ConditionGroup>;
  conditionGroupId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  description: Scalars['String']['output'];
  displayOrder?: Maybe<Scalars['Int']['output']>;
  endTime: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  openInterest: Scalars['String']['output'];
  predictions: Array<Prediction>;
  public: Scalars['Boolean']['output'];
  question: Scalars['String']['output'];
  resolvedToYes: Scalars['Boolean']['output'];
  /** Canonical resolver address for this condition (latest observed wins) */
  resolver?: Maybe<Scalars['String']['output']>;
  settled: Scalars['Boolean']['output'];
  settledAt?: Maybe<Scalars['Int']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
  similarMarkets: Array<Scalars['String']['output']>;
};


export type ConditionAttestationsArgs = {
  cursor?: InputMaybe<AttestationWhereUniqueInput>;
  distinct?: InputMaybe<Array<AttestationScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<AttestationOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<AttestationWhereInput>;
};


export type ConditionCategoryArgs = {
  where?: InputMaybe<CategoryWhereInput>;
};


export type ConditionConditionGroupArgs = {
  where?: InputMaybe<ConditionGroupWhereInput>;
};


export type ConditionPredictionsArgs = {
  cursor?: InputMaybe<PredictionWhereUniqueInput>;
  distinct?: InputMaybe<Array<PredictionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<PredictionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PredictionWhereInput>;
};

export type ConditionAvgAggregate = {
  __typename?: 'ConditionAvgAggregate';
  assertionTimestamp?: Maybe<Scalars['Float']['output']>;
  categoryId?: Maybe<Scalars['Float']['output']>;
  chainId?: Maybe<Scalars['Float']['output']>;
  conditionGroupId?: Maybe<Scalars['Float']['output']>;
  displayOrder?: Maybe<Scalars['Float']['output']>;
  endTime?: Maybe<Scalars['Float']['output']>;
  settledAt?: Maybe<Scalars['Float']['output']>;
};

export type ConditionAvgOrderByAggregateInput = {
  assertionTimestamp?: InputMaybe<SortOrder>;
  categoryId?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrder>;
  conditionGroupId?: InputMaybe<SortOrder>;
  displayOrder?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
  settledAt?: InputMaybe<SortOrder>;
};

export type ConditionCount = {
  __typename?: 'ConditionCount';
  attestations: Scalars['Int']['output'];
  predictions: Scalars['Int']['output'];
};


export type ConditionCountAttestationsArgs = {
  where?: InputMaybe<AttestationWhereInput>;
};


export type ConditionCountPredictionsArgs = {
  where?: InputMaybe<PredictionWhereInput>;
};

export type ConditionCountAggregate = {
  __typename?: 'ConditionCountAggregate';
  _all: Scalars['Int']['output'];
  assertionId: Scalars['Int']['output'];
  assertionTimestamp: Scalars['Int']['output'];
  categoryId: Scalars['Int']['output'];
  chainId: Scalars['Int']['output'];
  claimStatement: Scalars['Int']['output'];
  conditionGroupId: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  description: Scalars['Int']['output'];
  displayOrder: Scalars['Int']['output'];
  endTime: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  openInterest: Scalars['Int']['output'];
  public: Scalars['Int']['output'];
  question: Scalars['Int']['output'];
  resolvedToYes: Scalars['Int']['output'];
  resolver: Scalars['Int']['output'];
  settled: Scalars['Int']['output'];
  settledAt: Scalars['Int']['output'];
  shortName: Scalars['Int']['output'];
  similarMarkets: Scalars['Int']['output'];
};

export type ConditionCountOrderByAggregateInput = {
  assertionId?: InputMaybe<SortOrder>;
  assertionTimestamp?: InputMaybe<SortOrder>;
  categoryId?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrder>;
  claimStatement?: InputMaybe<SortOrder>;
  conditionGroupId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  displayOrder?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  openInterest?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  resolvedToYes?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrder>;
  settled?: InputMaybe<SortOrder>;
  settledAt?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrder>;
  similarMarkets?: InputMaybe<SortOrder>;
};

export type ConditionGroup = {
  __typename?: 'ConditionGroup';
  _count?: Maybe<ConditionGroupCount>;
  category?: Maybe<Category>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  conditions: Array<Condition>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['String']['output'];
};


export type ConditionGroupCategoryArgs = {
  where?: InputMaybe<CategoryWhereInput>;
};


export type ConditionGroupConditionsArgs = {
  cursor?: InputMaybe<ConditionWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};

export type ConditionGroupAvgAggregate = {
  __typename?: 'ConditionGroupAvgAggregate';
  categoryId?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
};

export type ConditionGroupAvgOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
};

export type ConditionGroupBy = {
  __typename?: 'ConditionGroupBy';
  _avg?: Maybe<ConditionAvgAggregate>;
  _count?: Maybe<ConditionCountAggregate>;
  _max?: Maybe<ConditionMaxAggregate>;
  _min?: Maybe<ConditionMinAggregate>;
  _sum?: Maybe<ConditionSumAggregate>;
  assertionId?: Maybe<Scalars['String']['output']>;
  assertionTimestamp?: Maybe<Scalars['Int']['output']>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId: Scalars['Int']['output'];
  claimStatement: Scalars['String']['output'];
  conditionGroupId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  description: Scalars['String']['output'];
  displayOrder?: Maybe<Scalars['Int']['output']>;
  endTime: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  openInterest: Scalars['String']['output'];
  public: Scalars['Boolean']['output'];
  question: Scalars['String']['output'];
  resolvedToYes: Scalars['Boolean']['output'];
  resolver?: Maybe<Scalars['String']['output']>;
  settled: Scalars['Boolean']['output'];
  settledAt?: Maybe<Scalars['Int']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
  similarMarkets?: Maybe<Array<Scalars['String']['output']>>;
};

export type ConditionGroupCount = {
  __typename?: 'ConditionGroupCount';
  condition: Scalars['Int']['output'];
};


export type ConditionGroupCountConditionArgs = {
  where?: InputMaybe<ConditionWhereInput>;
};

export type ConditionGroupCountAggregate = {
  __typename?: 'ConditionGroupCountAggregate';
  _all: Scalars['Int']['output'];
  categoryId: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['Int']['output'];
};

export type ConditionGroupCountOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
};

export type ConditionGroupGroupBy = {
  __typename?: 'ConditionGroupGroupBy';
  _avg?: Maybe<ConditionGroupAvgAggregate>;
  _count?: Maybe<ConditionGroupCountAggregate>;
  _max?: Maybe<ConditionGroupMaxAggregate>;
  _min?: Maybe<ConditionGroupMinAggregate>;
  _sum?: Maybe<ConditionGroupSumAggregate>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  name: Scalars['String']['output'];
};

export type ConditionGroupListRelationFilter = {
  every?: InputMaybe<ConditionGroupWhereInput>;
  none?: InputMaybe<ConditionGroupWhereInput>;
  some?: InputMaybe<ConditionGroupWhereInput>;
};

export type ConditionGroupMaxAggregate = {
  __typename?: 'ConditionGroupMaxAggregate';
  categoryId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export type ConditionGroupMaxOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
};

export type ConditionGroupMinAggregate = {
  __typename?: 'ConditionGroupMinAggregate';
  categoryId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export type ConditionGroupMinOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
};

export type ConditionGroupNullableRelationFilter = {
  is?: InputMaybe<ConditionGroupWhereInput>;
  isNot?: InputMaybe<ConditionGroupWhereInput>;
};

export type ConditionGroupOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type ConditionGroupOrderByWithAggregationInput = {
  _avg?: InputMaybe<ConditionGroupAvgOrderByAggregateInput>;
  _count?: InputMaybe<ConditionGroupCountOrderByAggregateInput>;
  _max?: InputMaybe<ConditionGroupMaxOrderByAggregateInput>;
  _min?: InputMaybe<ConditionGroupMinOrderByAggregateInput>;
  _sum?: InputMaybe<ConditionGroupSumOrderByAggregateInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
};

export type ConditionGroupOrderByWithRelationInput = {
  category?: InputMaybe<CategoryOrderByWithRelationInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  conditions?: InputMaybe<ConditionOrderByRelationAggregateInput>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
};

export type ConditionGroupScalarFieldEnum =
  | 'categoryId'
  | 'createdAt'
  | 'id'
  | 'name';

export type ConditionGroupScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<ConditionGroupScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<ConditionGroupScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<ConditionGroupScalarWhereWithAggregatesInput>>;
  categoryId?: InputMaybe<IntNullableWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  name?: InputMaybe<StringWithAggregatesFilter>;
};

export type ConditionGroupSumAggregate = {
  __typename?: 'ConditionGroupSumAggregate';
  categoryId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
};

export type ConditionGroupSumOrderByAggregateInput = {
  categoryId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
};

export type ConditionGroupWhereInput = {
  AND?: InputMaybe<Array<ConditionGroupWhereInput>>;
  NOT?: InputMaybe<Array<ConditionGroupWhereInput>>;
  OR?: InputMaybe<Array<ConditionGroupWhereInput>>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  conditions?: InputMaybe<ConditionListRelationFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  name?: InputMaybe<StringFilter>;
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
  name?: InputMaybe<Scalars['String']['input']>;
};

export type ConditionListRelationFilter = {
  every?: InputMaybe<ConditionWhereInput>;
  none?: InputMaybe<ConditionWhereInput>;
  some?: InputMaybe<ConditionWhereInput>;
};

export type ConditionMaxAggregate = {
  __typename?: 'ConditionMaxAggregate';
  assertionId?: Maybe<Scalars['String']['output']>;
  assertionTimestamp?: Maybe<Scalars['Int']['output']>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId?: Maybe<Scalars['Int']['output']>;
  claimStatement?: Maybe<Scalars['String']['output']>;
  conditionGroupId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  displayOrder?: Maybe<Scalars['Int']['output']>;
  endTime?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  openInterest?: Maybe<Scalars['String']['output']>;
  public?: Maybe<Scalars['Boolean']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  resolvedToYes?: Maybe<Scalars['Boolean']['output']>;
  resolver?: Maybe<Scalars['String']['output']>;
  settled?: Maybe<Scalars['Boolean']['output']>;
  settledAt?: Maybe<Scalars['Int']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
};

export type ConditionMaxOrderByAggregateInput = {
  assertionId?: InputMaybe<SortOrder>;
  assertionTimestamp?: InputMaybe<SortOrder>;
  categoryId?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrder>;
  claimStatement?: InputMaybe<SortOrder>;
  conditionGroupId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  displayOrder?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  openInterest?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  resolvedToYes?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrder>;
  settled?: InputMaybe<SortOrder>;
  settledAt?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrder>;
};

export type ConditionMinAggregate = {
  __typename?: 'ConditionMinAggregate';
  assertionId?: Maybe<Scalars['String']['output']>;
  assertionTimestamp?: Maybe<Scalars['Int']['output']>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId?: Maybe<Scalars['Int']['output']>;
  claimStatement?: Maybe<Scalars['String']['output']>;
  conditionGroupId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  displayOrder?: Maybe<Scalars['Int']['output']>;
  endTime?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  openInterest?: Maybe<Scalars['String']['output']>;
  public?: Maybe<Scalars['Boolean']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  resolvedToYes?: Maybe<Scalars['Boolean']['output']>;
  resolver?: Maybe<Scalars['String']['output']>;
  settled?: Maybe<Scalars['Boolean']['output']>;
  settledAt?: Maybe<Scalars['Int']['output']>;
  shortName?: Maybe<Scalars['String']['output']>;
};

export type ConditionMinOrderByAggregateInput = {
  assertionId?: InputMaybe<SortOrder>;
  assertionTimestamp?: InputMaybe<SortOrder>;
  categoryId?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrder>;
  claimStatement?: InputMaybe<SortOrder>;
  conditionGroupId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  displayOrder?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  openInterest?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  resolvedToYes?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrder>;
  settled?: InputMaybe<SortOrder>;
  settledAt?: InputMaybe<SortOrder>;
  shortName?: InputMaybe<SortOrder>;
};

export type ConditionNullableRelationFilter = {
  is?: InputMaybe<ConditionWhereInput>;
  isNot?: InputMaybe<ConditionWhereInput>;
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
  assertionId?: InputMaybe<SortOrderInput>;
  assertionTimestamp?: InputMaybe<SortOrderInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  chainId?: InputMaybe<SortOrder>;
  claimStatement?: InputMaybe<SortOrder>;
  conditionGroupId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  displayOrder?: InputMaybe<SortOrderInput>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  openInterest?: InputMaybe<SortOrder>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  resolvedToYes?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrderInput>;
  settled?: InputMaybe<SortOrder>;
  settledAt?: InputMaybe<SortOrderInput>;
  shortName?: InputMaybe<SortOrderInput>;
  similarMarkets?: InputMaybe<SortOrder>;
};

export type ConditionOrderByWithRelationInput = {
  assertionId?: InputMaybe<SortOrderInput>;
  assertionTimestamp?: InputMaybe<SortOrderInput>;
  attestations?: InputMaybe<AttestationOrderByRelationAggregateInput>;
  category?: InputMaybe<CategoryOrderByWithRelationInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  chainId?: InputMaybe<SortOrder>;
  claimStatement?: InputMaybe<SortOrder>;
  conditionGroup?: InputMaybe<ConditionGroupOrderByWithRelationInput>;
  conditionGroupId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  displayOrder?: InputMaybe<SortOrderInput>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  openInterest?: InputMaybe<SortOrder>;
  predictions?: InputMaybe<PredictionOrderByRelationAggregateInput>;
  public?: InputMaybe<SortOrder>;
  question?: InputMaybe<SortOrder>;
  resolvedToYes?: InputMaybe<SortOrder>;
  resolver?: InputMaybe<SortOrderInput>;
  settled?: InputMaybe<SortOrder>;
  settledAt?: InputMaybe<SortOrderInput>;
  shortName?: InputMaybe<SortOrderInput>;
  similarMarkets?: InputMaybe<SortOrder>;
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
  | 'claimStatement'
  | 'conditionGroupId'
  | 'createdAt'
  | 'description'
  | 'displayOrder'
  | 'endTime'
  | 'id'
  | 'openInterest'
  | 'public'
  | 'question'
  | 'resolvedToYes'
  | 'resolver'
  | 'settled'
  | 'settledAt'
  | 'shortName'
  | 'similarMarkets';

export type ConditionScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<ConditionScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<ConditionScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<ConditionScalarWhereWithAggregatesInput>>;
  assertionId?: InputMaybe<StringNullableWithAggregatesFilter>;
  assertionTimestamp?: InputMaybe<IntNullableWithAggregatesFilter>;
  categoryId?: InputMaybe<IntNullableWithAggregatesFilter>;
  chainId?: InputMaybe<IntWithAggregatesFilter>;
  claimStatement?: InputMaybe<StringWithAggregatesFilter>;
  conditionGroupId?: InputMaybe<IntNullableWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  description?: InputMaybe<StringWithAggregatesFilter>;
  displayOrder?: InputMaybe<IntNullableWithAggregatesFilter>;
  endTime?: InputMaybe<IntWithAggregatesFilter>;
  id?: InputMaybe<StringWithAggregatesFilter>;
  openInterest?: InputMaybe<StringWithAggregatesFilter>;
  public?: InputMaybe<BoolWithAggregatesFilter>;
  question?: InputMaybe<StringWithAggregatesFilter>;
  resolvedToYes?: InputMaybe<BoolWithAggregatesFilter>;
  resolver?: InputMaybe<StringNullableWithAggregatesFilter>;
  settled?: InputMaybe<BoolWithAggregatesFilter>;
  settledAt?: InputMaybe<IntNullableWithAggregatesFilter>;
  shortName?: InputMaybe<StringNullableWithAggregatesFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
};

export type ConditionSumAggregate = {
  __typename?: 'ConditionSumAggregate';
  assertionTimestamp?: Maybe<Scalars['Int']['output']>;
  categoryId?: Maybe<Scalars['Int']['output']>;
  chainId?: Maybe<Scalars['Int']['output']>;
  conditionGroupId?: Maybe<Scalars['Int']['output']>;
  displayOrder?: Maybe<Scalars['Int']['output']>;
  endTime?: Maybe<Scalars['Int']['output']>;
  settledAt?: Maybe<Scalars['Int']['output']>;
};

export type ConditionSumOrderByAggregateInput = {
  assertionTimestamp?: InputMaybe<SortOrder>;
  categoryId?: InputMaybe<SortOrder>;
  chainId?: InputMaybe<SortOrder>;
  conditionGroupId?: InputMaybe<SortOrder>;
  displayOrder?: InputMaybe<SortOrder>;
  endTime?: InputMaybe<SortOrder>;
  settledAt?: InputMaybe<SortOrder>;
};

export type ConditionSummary = {
  __typename?: 'ConditionSummary';
  endTime?: Maybe<Scalars['Int']['output']>;
  id: Scalars['String']['output'];
  question?: Maybe<Scalars['String']['output']>;
  resolvedToYes: Scalars['Boolean']['output'];
  resolver?: Maybe<Scalars['String']['output']>;
  settled: Scalars['Boolean']['output'];
  shortName?: Maybe<Scalars['String']['output']>;
};

export type ConditionWhereInput = {
  AND?: InputMaybe<Array<ConditionWhereInput>>;
  NOT?: InputMaybe<Array<ConditionWhereInput>>;
  OR?: InputMaybe<Array<ConditionWhereInput>>;
  assertionId?: InputMaybe<StringNullableFilter>;
  assertionTimestamp?: InputMaybe<IntNullableFilter>;
  attestations?: InputMaybe<AttestationListRelationFilter>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  chainId?: InputMaybe<IntFilter>;
  claimStatement?: InputMaybe<StringFilter>;
  conditionGroup?: InputMaybe<ConditionGroupNullableRelationFilter>;
  conditionGroupId?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  description?: InputMaybe<StringFilter>;
  displayOrder?: InputMaybe<IntNullableFilter>;
  endTime?: InputMaybe<IntFilter>;
  id?: InputMaybe<StringFilter>;
  openInterest?: InputMaybe<StringFilter>;
  predictions?: InputMaybe<PredictionListRelationFilter>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringFilter>;
  resolvedToYes?: InputMaybe<BoolFilter>;
  resolver?: InputMaybe<StringNullableFilter>;
  settled?: InputMaybe<BoolFilter>;
  settledAt?: InputMaybe<IntNullableFilter>;
  shortName?: InputMaybe<StringNullableFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
};

export type ConditionWhereUniqueInput = {
  AND?: InputMaybe<Array<ConditionWhereInput>>;
  NOT?: InputMaybe<Array<ConditionWhereInput>>;
  OR?: InputMaybe<Array<ConditionWhereInput>>;
  assertionId?: InputMaybe<StringNullableFilter>;
  assertionTimestamp?: InputMaybe<IntNullableFilter>;
  attestations?: InputMaybe<AttestationListRelationFilter>;
  category?: InputMaybe<CategoryNullableRelationFilter>;
  categoryId?: InputMaybe<IntNullableFilter>;
  chainId?: InputMaybe<IntFilter>;
  claimStatement?: InputMaybe<StringFilter>;
  conditionGroup?: InputMaybe<ConditionGroupNullableRelationFilter>;
  conditionGroupId?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  description?: InputMaybe<StringFilter>;
  displayOrder?: InputMaybe<IntNullableFilter>;
  endTime?: InputMaybe<IntFilter>;
  id?: InputMaybe<Scalars['String']['input']>;
  openInterest?: InputMaybe<StringFilter>;
  predictions?: InputMaybe<PredictionListRelationFilter>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringFilter>;
  resolvedToYes?: InputMaybe<BoolFilter>;
  resolver?: InputMaybe<StringNullableFilter>;
  settled?: InputMaybe<BoolFilter>;
  settledAt?: InputMaybe<IntNullableFilter>;
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

export type EnumLimitOrderStatusFilter = {
  equals?: InputMaybe<LimitOrderStatus>;
  in?: InputMaybe<Array<LimitOrderStatus>>;
  not?: InputMaybe<NestedEnumLimitOrderStatusFilter>;
  notIn?: InputMaybe<Array<LimitOrderStatus>>;
};

export type EnumPositionStatusFilter = {
  equals?: InputMaybe<PositionStatus>;
  in?: InputMaybe<Array<PositionStatus>>;
  not?: InputMaybe<NestedEnumPositionStatusFilter>;
  notIn?: InputMaybe<Array<PositionStatus>>;
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

export type LimitOrder = {
  __typename?: 'LimitOrder';
  _count?: Maybe<LimitOrderCount>;
  cancelledAt?: Maybe<Scalars['Int']['output']>;
  cancelledTxHash?: Maybe<Scalars['String']['output']>;
  chainId: Scalars['Int']['output'];
  counterparty?: Maybe<Scalars['String']['output']>;
  counterpartyCollateral: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  filledAt?: Maybe<Scalars['Int']['output']>;
  filledTxHash?: Maybe<Scalars['String']['output']>;
  id: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  orderId: Scalars['String']['output'];
  placedAt: Scalars['Int']['output'];
  placedTxHash: Scalars['String']['output'];
  predictions: Array<Prediction>;
  predictor: Scalars['String']['output'];
  predictorCollateral: Scalars['String']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  resolver: Scalars['String']['output'];
  status: LimitOrderStatus;
};


export type LimitOrderPredictionsArgs = {
  cursor?: InputMaybe<PredictionWhereUniqueInput>;
  distinct?: InputMaybe<Array<PredictionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<PredictionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PredictionWhereInput>;
};

export type LimitOrderCount = {
  __typename?: 'LimitOrderCount';
  predictions: Scalars['Int']['output'];
};


export type LimitOrderCountPredictionsArgs = {
  where?: InputMaybe<PredictionWhereInput>;
};

export type LimitOrderNullableRelationFilter = {
  is?: InputMaybe<LimitOrderWhereInput>;
  isNot?: InputMaybe<LimitOrderWhereInput>;
};

export type LimitOrderOrderByWithRelationInput = {
  cancelledAt?: InputMaybe<SortOrderInput>;
  cancelledTxHash?: InputMaybe<SortOrderInput>;
  chainId?: InputMaybe<SortOrder>;
  counterparty?: InputMaybe<SortOrderInput>;
  counterpartyCollateral?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  filledAt?: InputMaybe<SortOrderInput>;
  filledTxHash?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  marketAddress?: InputMaybe<SortOrder>;
  orderId?: InputMaybe<SortOrder>;
  placedAt?: InputMaybe<SortOrder>;
  placedTxHash?: InputMaybe<SortOrder>;
  predictions?: InputMaybe<PredictionOrderByRelationAggregateInput>;
  predictor?: InputMaybe<SortOrder>;
  predictorCollateral?: InputMaybe<SortOrder>;
  refCode?: InputMaybe<SortOrderInput>;
  resolver?: InputMaybe<SortOrder>;
  status?: InputMaybe<SortOrder>;
};

export type LimitOrderStatus =
  | 'cancelled'
  | 'filled'
  | 'pending';

export type LimitOrderWhereInput = {
  AND?: InputMaybe<Array<LimitOrderWhereInput>>;
  NOT?: InputMaybe<Array<LimitOrderWhereInput>>;
  OR?: InputMaybe<Array<LimitOrderWhereInput>>;
  cancelledAt?: InputMaybe<IntNullableFilter>;
  cancelledTxHash?: InputMaybe<StringNullableFilter>;
  chainId?: InputMaybe<IntFilter>;
  counterparty?: InputMaybe<StringNullableFilter>;
  counterpartyCollateral?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  filledAt?: InputMaybe<IntNullableFilter>;
  filledTxHash?: InputMaybe<StringNullableFilter>;
  id?: InputMaybe<IntFilter>;
  marketAddress?: InputMaybe<StringFilter>;
  orderId?: InputMaybe<StringFilter>;
  placedAt?: InputMaybe<IntFilter>;
  placedTxHash?: InputMaybe<StringFilter>;
  predictions?: InputMaybe<PredictionListRelationFilter>;
  predictor?: InputMaybe<StringFilter>;
  predictorCollateral?: InputMaybe<StringFilter>;
  refCode?: InputMaybe<StringNullableFilter>;
  resolver?: InputMaybe<StringFilter>;
  status?: InputMaybe<EnumLimitOrderStatusFilter>;
};

export type NestedBoolFilter = {
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolFilter>;
};

export type NestedBoolNullableFilter = {
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<NestedBoolNullableFilter>;
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

export type NestedEnumLimitOrderStatusFilter = {
  equals?: InputMaybe<LimitOrderStatus>;
  in?: InputMaybe<Array<LimitOrderStatus>>;
  not?: InputMaybe<NestedEnumLimitOrderStatusFilter>;
  notIn?: InputMaybe<Array<LimitOrderStatus>>;
};

export type NestedEnumPositionStatusFilter = {
  equals?: InputMaybe<PositionStatus>;
  in?: InputMaybe<Array<PositionStatus>>;
  not?: InputMaybe<NestedEnumPositionStatusFilter>;
  notIn?: InputMaybe<Array<PositionStatus>>;
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

/** Position model to store on-chain prediction positions */
export type Position = {
  __typename?: 'Position';
  _count?: Maybe<PositionCount>;
  chainId: Scalars['Int']['output'];
  counterparty: Scalars['String']['output'];
  counterpartyCollateral?: Maybe<Scalars['String']['output']>;
  counterpartyNftTokenId: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  endsAt?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  mintedAt: Scalars['Int']['output'];
  predictions: Array<Prediction>;
  predictor: Scalars['String']['output'];
  predictorCollateral?: Maybe<Scalars['String']['output']>;
  predictorNftTokenId: Scalars['String']['output'];
  /** True when the predictor's submitted outcomes were correct (previously makerWon) */
  predictorWon?: Maybe<Scalars['Boolean']['output']>;
  refCode?: Maybe<Scalars['String']['output']>;
  settledAt?: Maybe<Scalars['Int']['output']>;
  status: PositionStatus;
  totalCollateral: Scalars['String']['output'];
};


/** Position model to store on-chain prediction positions */
export type PositionPredictionsArgs = {
  cursor?: InputMaybe<PredictionWhereUniqueInput>;
  distinct?: InputMaybe<Array<PredictionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<PredictionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<PredictionWhereInput>;
};

export type PositionCount = {
  __typename?: 'PositionCount';
  predictions: Scalars['Int']['output'];
};


export type PositionCountPredictionsArgs = {
  where?: InputMaybe<PredictionWhereInput>;
};

export type PositionNullableRelationFilter = {
  is?: InputMaybe<PositionWhereInput>;
  isNot?: InputMaybe<PositionWhereInput>;
};

export type PositionOrderByWithRelationInput = {
  chainId?: InputMaybe<SortOrder>;
  counterparty?: InputMaybe<SortOrder>;
  counterpartyCollateral?: InputMaybe<SortOrderInput>;
  counterpartyNftTokenId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  endsAt?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  marketAddress?: InputMaybe<SortOrder>;
  mintedAt?: InputMaybe<SortOrder>;
  predictions?: InputMaybe<PredictionOrderByRelationAggregateInput>;
  predictor?: InputMaybe<SortOrder>;
  predictorCollateral?: InputMaybe<SortOrderInput>;
  predictorNftTokenId?: InputMaybe<SortOrder>;
  predictorWon?: InputMaybe<SortOrderInput>;
  refCode?: InputMaybe<SortOrderInput>;
  settledAt?: InputMaybe<SortOrderInput>;
  status?: InputMaybe<SortOrder>;
  totalCollateral?: InputMaybe<SortOrder>;
};

export type PositionStatus =
  | 'active'
  | 'consolidated'
  | 'settled';

export type PositionType = {
  __typename?: 'PositionType';
  chainId: Scalars['Int']['output'];
  counterparty: Scalars['String']['output'];
  counterpartyCollateral?: Maybe<Scalars['String']['output']>;
  counterpartyNftTokenId: Scalars['String']['output'];
  endsAt?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  mintedAt: Scalars['Int']['output'];
  predictions: Array<PredictionType>;
  predictor: Scalars['String']['output'];
  predictorCollateral?: Maybe<Scalars['String']['output']>;
  predictorNftTokenId: Scalars['String']['output'];
  predictorWon?: Maybe<Scalars['Boolean']['output']>;
  refCode?: Maybe<Scalars['String']['output']>;
  settledAt?: Maybe<Scalars['Int']['output']>;
  status: Scalars['String']['output'];
  totalCollateral: Scalars['String']['output'];
};

export type PositionWhereInput = {
  AND?: InputMaybe<Array<PositionWhereInput>>;
  NOT?: InputMaybe<Array<PositionWhereInput>>;
  OR?: InputMaybe<Array<PositionWhereInput>>;
  chainId?: InputMaybe<IntFilter>;
  counterparty?: InputMaybe<StringFilter>;
  counterpartyCollateral?: InputMaybe<StringNullableFilter>;
  counterpartyNftTokenId?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  endsAt?: InputMaybe<IntNullableFilter>;
  id?: InputMaybe<IntFilter>;
  marketAddress?: InputMaybe<StringFilter>;
  mintedAt?: InputMaybe<IntFilter>;
  predictions?: InputMaybe<PredictionListRelationFilter>;
  predictor?: InputMaybe<StringFilter>;
  predictorCollateral?: InputMaybe<StringNullableFilter>;
  predictorNftTokenId?: InputMaybe<StringFilter>;
  predictorWon?: InputMaybe<BoolNullableFilter>;
  refCode?: InputMaybe<StringNullableFilter>;
  settledAt?: InputMaybe<IntNullableFilter>;
  status?: InputMaybe<EnumPositionStatusFilter>;
  totalCollateral?: InputMaybe<StringFilter>;
};

export type Prediction = {
  __typename?: 'Prediction';
  chainId?: Maybe<Scalars['Int']['output']>;
  condition: Condition;
  conditionId: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  limitOrder?: Maybe<LimitOrder>;
  limitOrderId?: Maybe<Scalars['Int']['output']>;
  outcomeYes: Scalars['Boolean']['output'];
  position?: Maybe<Position>;
  positionId?: Maybe<Scalars['Int']['output']>;
};


export type PredictionLimitOrderArgs = {
  where?: InputMaybe<LimitOrderWhereInput>;
};


export type PredictionPositionArgs = {
  where?: InputMaybe<PositionWhereInput>;
};

export type PredictionLimitOrderIdConditionIdCompoundUniqueInput = {
  conditionId: Scalars['String']['input'];
  limitOrderId: Scalars['Int']['input'];
};

export type PredictionListRelationFilter = {
  every?: InputMaybe<PredictionWhereInput>;
  none?: InputMaybe<PredictionWhereInput>;
  some?: InputMaybe<PredictionWhereInput>;
};

export type PredictionOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type PredictionOrderByWithRelationInput = {
  chainId?: InputMaybe<SortOrderInput>;
  condition?: InputMaybe<ConditionOrderByWithRelationInput>;
  conditionId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  limitOrder?: InputMaybe<LimitOrderOrderByWithRelationInput>;
  limitOrderId?: InputMaybe<SortOrderInput>;
  outcomeYes?: InputMaybe<SortOrder>;
  position?: InputMaybe<PositionOrderByWithRelationInput>;
  positionId?: InputMaybe<SortOrderInput>;
};

export type PredictionPositionIdConditionIdCompoundUniqueInput = {
  conditionId: Scalars['String']['input'];
  positionId: Scalars['Int']['input'];
};

export type PredictionScalarFieldEnum =
  | 'chainId'
  | 'conditionId'
  | 'createdAt'
  | 'id'
  | 'limitOrderId'
  | 'outcomeYes'
  | 'positionId';

export type PredictionType = {
  __typename?: 'PredictionType';
  chainId?: Maybe<Scalars['Int']['output']>;
  condition?: Maybe<ConditionSummary>;
  conditionId: Scalars['String']['output'];
  outcomeYes: Scalars['Boolean']['output'];
};

export type PredictionWhereInput = {
  AND?: InputMaybe<Array<PredictionWhereInput>>;
  NOT?: InputMaybe<Array<PredictionWhereInput>>;
  OR?: InputMaybe<Array<PredictionWhereInput>>;
  chainId?: InputMaybe<IntNullableFilter>;
  condition?: InputMaybe<ConditionRelationFilter>;
  conditionId?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  limitOrder?: InputMaybe<LimitOrderNullableRelationFilter>;
  limitOrderId?: InputMaybe<IntNullableFilter>;
  outcomeYes?: InputMaybe<BoolFilter>;
  position?: InputMaybe<PositionNullableRelationFilter>;
  positionId?: InputMaybe<IntNullableFilter>;
};

export type PredictionWhereUniqueInput = {
  AND?: InputMaybe<Array<PredictionWhereInput>>;
  NOT?: InputMaybe<Array<PredictionWhereInput>>;
  OR?: InputMaybe<Array<PredictionWhereInput>>;
  chainId?: InputMaybe<IntNullableFilter>;
  condition?: InputMaybe<ConditionRelationFilter>;
  conditionId?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  limitOrder?: InputMaybe<LimitOrderNullableRelationFilter>;
  limitOrderId?: InputMaybe<IntNullableFilter>;
  limitOrderId_conditionId?: InputMaybe<PredictionLimitOrderIdConditionIdCompoundUniqueInput>;
  outcomeYes?: InputMaybe<BoolFilter>;
  position?: InputMaybe<PositionNullableRelationFilter>;
  positionId?: InputMaybe<IntNullableFilter>;
  positionId_conditionId?: InputMaybe<PredictionPositionIdConditionIdCompoundUniqueInput>;
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
  aggregateConditionGroup: AggregateConditionGroup;
  aggregateUser: AggregateUser;
  allTimeProfitLeaderboard: Array<AggregatedProfitEntryType>;
  attestation?: Maybe<Attestation>;
  attestations: Array<Attestation>;
  categories: Array<Category>;
  category?: Maybe<Category>;
  condition?: Maybe<Condition>;
  conditionGroup?: Maybe<ConditionGroup>;
  conditionGroups: Array<ConditionGroup>;
  conditions: Array<Condition>;
  findFirstAttestation?: Maybe<Attestation>;
  findFirstAttestationOrThrow?: Maybe<Attestation>;
  findFirstCategory?: Maybe<Category>;
  findFirstCategoryOrThrow?: Maybe<Category>;
  findFirstCondition?: Maybe<Condition>;
  findFirstConditionGroup?: Maybe<ConditionGroup>;
  findFirstConditionGroupOrThrow?: Maybe<ConditionGroup>;
  findFirstConditionOrThrow?: Maybe<Condition>;
  findFirstUser?: Maybe<User>;
  findFirstUserOrThrow?: Maybe<User>;
  forecasterScore?: Maybe<ForecasterScoreType>;
  getAttestation?: Maybe<Attestation>;
  getCategory?: Maybe<Category>;
  getCondition?: Maybe<Condition>;
  getConditionGroup?: Maybe<ConditionGroup>;
  getLeaderboard: Array<PnLType>;
  getUser?: Maybe<User>;
  groupByAttestation: Array<AttestationGroupBy>;
  groupByCategory: Array<CategoryGroupBy>;
  groupByCondition: Array<ConditionGroupBy>;
  groupByConditionGroup: Array<ConditionGroupGroupBy>;
  groupByUser: Array<UserGroupBy>;
  positions: Array<PositionType>;
  positionsByConditionId: Array<PositionType>;
  positionsCount: Scalars['Int']['output'];
  profitRankByAddress: ProfitRankType;
  topForecasters: Array<ForecasterScoreType>;
  user?: Maybe<User>;
  users: Array<User>;
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


export type QueryAggregateConditionGroupArgs = {
  cursor?: InputMaybe<ConditionGroupWhereUniqueInput>;
  orderBy?: InputMaybe<Array<ConditionGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionGroupWhereInput>;
};


export type QueryAggregateUserArgs = {
  cursor?: InputMaybe<UserWhereUniqueInput>;
  orderBy?: InputMaybe<Array<UserOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<UserWhereInput>;
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


export type QueryFindFirstConditionGroupArgs = {
  cursor?: InputMaybe<ConditionGroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionGroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionGroupWhereInput>;
};


export type QueryFindFirstConditionGroupOrThrowArgs = {
  cursor?: InputMaybe<ConditionGroupWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionGroupScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionGroupOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionGroupWhereInput>;
};


export type QueryFindFirstConditionOrThrowArgs = {
  cursor?: InputMaybe<ConditionWhereUniqueInput>;
  distinct?: InputMaybe<Array<ConditionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<ConditionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionWhereInput>;
};


export type QueryFindFirstUserArgs = {
  cursor?: InputMaybe<UserWhereUniqueInput>;
  distinct?: InputMaybe<Array<UserScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<UserOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<UserWhereInput>;
};


export type QueryFindFirstUserOrThrowArgs = {
  cursor?: InputMaybe<UserWhereUniqueInput>;
  distinct?: InputMaybe<Array<UserScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<UserOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<UserWhereInput>;
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


export type QueryGetConditionGroupArgs = {
  where: ConditionGroupWhereUniqueInput;
};


export type QueryGetLeaderboardArgs = {
  chainId: Scalars['Int']['input'];
  marketAddress: Scalars['String']['input'];
};


export type QueryGetUserArgs = {
  where: UserWhereUniqueInput;
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


export type QueryGroupByConditionGroupArgs = {
  by: Array<ConditionGroupScalarFieldEnum>;
  having?: InputMaybe<ConditionGroupScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<ConditionGroupOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<ConditionGroupWhereInput>;
};


export type QueryGroupByUserArgs = {
  by: Array<UserScalarFieldEnum>;
  having?: InputMaybe<UserScalarWhereWithAggregatesInput>;
  orderBy?: InputMaybe<Array<UserOrderByWithAggregationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<UserWhereInput>;
};


export type QueryPositionsArgs = {
  address?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  endsAtGte?: InputMaybe<Scalars['Int']['input']>;
  marketAddress?: InputMaybe<Scalars['String']['input']>;
  nftTokenId?: InputMaybe<Scalars['String']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  take?: Scalars['Int']['input'];
};


export type QueryPositionsByConditionIdArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  conditionId: Scalars['String']['input'];
  endsAtGte?: InputMaybe<Scalars['Int']['input']>;
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  take?: Scalars['Int']['input'];
};


export type QueryPositionsCountArgs = {
  address: Scalars['String']['input'];
  chainId?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryProfitRankByAddressArgs = {
  owner: Scalars['String']['input'];
};


export type QueryTopForecastersArgs = {
  limit?: Scalars['Int']['input'];
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

export type QueryMode =
  | 'default'
  | 'insensitive';

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

export type UserAvgAggregate = {
  __typename?: 'UserAvgAggregate';
  id?: Maybe<Scalars['Float']['output']>;
  maxReferrals?: Maybe<Scalars['Float']['output']>;
  referredById?: Maybe<Scalars['Float']['output']>;
};

export type UserAvgOrderByAggregateInput = {
  id?: InputMaybe<SortOrder>;
  maxReferrals?: InputMaybe<SortOrder>;
  referredById?: InputMaybe<SortOrder>;
};

export type UserCount = {
  __typename?: 'UserCount';
  referrals: Scalars['Int']['output'];
};


export type UserCountReferralsArgs = {
  where?: InputMaybe<UserWhereInput>;
};

export type UserCountAggregate = {
  __typename?: 'UserCountAggregate';
  _all: Scalars['Int']['output'];
  address: Scalars['Int']['output'];
  createdAt: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  maxReferrals: Scalars['Int']['output'];
  refCodeHash: Scalars['Int']['output'];
  referredById: Scalars['Int']['output'];
  updatedAt: Scalars['Int']['output'];
};

export type UserCountOrderByAggregateInput = {
  address?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  maxReferrals?: InputMaybe<SortOrder>;
  refCodeHash?: InputMaybe<SortOrder>;
  referredById?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type UserGroupBy = {
  __typename?: 'UserGroupBy';
  _avg?: Maybe<UserAvgAggregate>;
  _count?: Maybe<UserCountAggregate>;
  _max?: Maybe<UserMaxAggregate>;
  _min?: Maybe<UserMinAggregate>;
  _sum?: Maybe<UserSumAggregate>;
  address: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  maxReferrals: Scalars['Int']['output'];
  refCodeHash?: Maybe<Scalars['String']['output']>;
  referredById?: Maybe<Scalars['Int']['output']>;
  updatedAt: Scalars['DateTimeISO']['output'];
};

export type UserListRelationFilter = {
  every?: InputMaybe<UserWhereInput>;
  none?: InputMaybe<UserWhereInput>;
  some?: InputMaybe<UserWhereInput>;
};

export type UserMaxAggregate = {
  __typename?: 'UserMaxAggregate';
  address?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  maxReferrals?: Maybe<Scalars['Int']['output']>;
  refCodeHash?: Maybe<Scalars['String']['output']>;
  referredById?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['DateTimeISO']['output']>;
};

export type UserMaxOrderByAggregateInput = {
  address?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  maxReferrals?: InputMaybe<SortOrder>;
  refCodeHash?: InputMaybe<SortOrder>;
  referredById?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type UserMinAggregate = {
  __typename?: 'UserMinAggregate';
  address?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTimeISO']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  maxReferrals?: Maybe<Scalars['Int']['output']>;
  refCodeHash?: Maybe<Scalars['String']['output']>;
  referredById?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['DateTimeISO']['output']>;
};

export type UserMinOrderByAggregateInput = {
  address?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  maxReferrals?: InputMaybe<SortOrder>;
  refCodeHash?: InputMaybe<SortOrder>;
  referredById?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type UserNullableRelationFilter = {
  is?: InputMaybe<UserWhereInput>;
  isNot?: InputMaybe<UserWhereInput>;
};

export type UserOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type UserOrderByWithAggregationInput = {
  _avg?: InputMaybe<UserAvgOrderByAggregateInput>;
  _count?: InputMaybe<UserCountOrderByAggregateInput>;
  _max?: InputMaybe<UserMaxOrderByAggregateInput>;
  _min?: InputMaybe<UserMinOrderByAggregateInput>;
  _sum?: InputMaybe<UserSumOrderByAggregateInput>;
  address?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  maxReferrals?: InputMaybe<SortOrder>;
  refCodeHash?: InputMaybe<SortOrderInput>;
  referredById?: InputMaybe<SortOrderInput>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type UserOrderByWithRelationInput = {
  address?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  maxReferrals?: InputMaybe<SortOrder>;
  refCodeHash?: InputMaybe<SortOrderInput>;
  referrals?: InputMaybe<UserOrderByRelationAggregateInput>;
  referredBy?: InputMaybe<UserOrderByWithRelationInput>;
  referredById?: InputMaybe<SortOrderInput>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type UserScalarFieldEnum =
  | 'address'
  | 'createdAt'
  | 'id'
  | 'maxReferrals'
  | 'refCodeHash'
  | 'referredById'
  | 'updatedAt';

export type UserScalarWhereWithAggregatesInput = {
  AND?: InputMaybe<Array<UserScalarWhereWithAggregatesInput>>;
  NOT?: InputMaybe<Array<UserScalarWhereWithAggregatesInput>>;
  OR?: InputMaybe<Array<UserScalarWhereWithAggregatesInput>>;
  address?: InputMaybe<StringWithAggregatesFilter>;
  createdAt?: InputMaybe<DateTimeWithAggregatesFilter>;
  id?: InputMaybe<IntWithAggregatesFilter>;
  maxReferrals?: InputMaybe<IntWithAggregatesFilter>;
  refCodeHash?: InputMaybe<StringNullableWithAggregatesFilter>;
  referredById?: InputMaybe<IntNullableWithAggregatesFilter>;
  updatedAt?: InputMaybe<DateTimeWithAggregatesFilter>;
};

export type UserSumAggregate = {
  __typename?: 'UserSumAggregate';
  id?: Maybe<Scalars['Int']['output']>;
  maxReferrals?: Maybe<Scalars['Int']['output']>;
  referredById?: Maybe<Scalars['Int']['output']>;
};

export type UserSumOrderByAggregateInput = {
  id?: InputMaybe<SortOrder>;
  maxReferrals?: InputMaybe<SortOrder>;
  referredById?: InputMaybe<SortOrder>;
};

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
  referredById?: InputMaybe<IntNullableFilter>;
  updatedAt?: InputMaybe<DateTimeFilter>;
};
