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

export type AttestationListRelationFilter = {
  every?: InputMaybe<AttestationWhereInput>;
  none?: InputMaybe<AttestationWhereInput>;
  some?: InputMaybe<AttestationWhereInput>;
};

export type AttestationOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
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

export type CategoryNullableRelationFilter = {
  is?: InputMaybe<CategoryWhereInput>;
  isNot?: InputMaybe<CategoryWhereInput>;
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
  name?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type ClaimType = {
  __typename?: 'ClaimType';
  chainId: Scalars['Int']['output'];
  collateralPaid: Scalars['String']['output'];
  holder: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  positionToken: Scalars['String']['output'];
  predictionId: Scalars['String']['output'];
  redeemedAt: Scalars['Int']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  tokensBurned: Scalars['String']['output'];
  txHash: Scalars['String']['output'];
};

export type CloseType = {
  __typename?: 'CloseType';
  burnedAt: Scalars['Int']['output'];
  chainId: Scalars['Int']['output'];
  counterpartyHolder: Scalars['String']['output'];
  counterpartyPayout: Scalars['String']['output'];
  counterpartyTokensBurned: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  pickConfigId: Scalars['String']['output'];
  predictorHolder: Scalars['String']['output'];
  predictorPayout: Scalars['String']['output'];
  predictorTokensBurned: Scalars['String']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  txHash: Scalars['String']['output'];
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
  predictionCount: Scalars['Int']['output'];
  predictions: Array<LegacyPrediction>;
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
  cursor?: InputMaybe<LegacyPredictionWhereUniqueInput>;
  distinct?: InputMaybe<Array<LegacyPredictionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<LegacyPredictionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<LegacyPredictionWhereInput>;
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
  where?: InputMaybe<LegacyPredictionWhereInput>;
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
  similarMarkets: Array<Scalars['String']['output']>;
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

export type ConditionGroupCount = {
  __typename?: 'ConditionGroupCount';
  condition: Scalars['Int']['output'];
};


export type ConditionGroupCountConditionArgs = {
  where?: InputMaybe<ConditionWhereInput>;
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

export type ConditionGroupOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type ConditionGroupOrderByWithRelationInput = {
  category?: InputMaybe<CategoryOrderByWithRelationInput>;
  categoryId?: InputMaybe<SortOrderInput>;
  conditions?: InputMaybe<ConditionOrderByRelationAggregateInput>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  similarMarkets?: InputMaybe<SortOrder>;
};

export type ConditionGroupScalarFieldEnum =
  | 'categoryId'
  | 'createdAt'
  | 'id'
  | 'name'
  | 'similarMarkets';

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
  similarMarkets?: InputMaybe<StringNullableListFilter>;
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
  similarMarkets?: InputMaybe<StringNullableListFilter>;
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

export type ConditionOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
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
  predictionCount?: InputMaybe<SortOrder>;
  predictions?: InputMaybe<LegacyPredictionOrderByRelationAggregateInput>;
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
  | 'predictionCount'
  | 'public'
  | 'question'
  | 'resolvedToYes'
  | 'resolver'
  | 'settled'
  | 'settledAt'
  | 'shortName'
  | 'similarMarkets';

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
  predictionCount?: InputMaybe<IntFilter>;
  predictions?: InputMaybe<LegacyPredictionListRelationFilter>;
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
  predictionCount?: InputMaybe<IntFilter>;
  predictions?: InputMaybe<LegacyPredictionListRelationFilter>;
  public?: InputMaybe<BoolFilter>;
  question?: InputMaybe<StringFilter>;
  resolvedToYes?: InputMaybe<BoolFilter>;
  resolver?: InputMaybe<StringNullableFilter>;
  settled?: InputMaybe<BoolFilter>;
  settledAt?: InputMaybe<IntNullableFilter>;
  shortName?: InputMaybe<StringNullableFilter>;
  similarMarkets?: InputMaybe<StringNullableListFilter>;
};

export type DailyVolume = {
  __typename?: 'DailyVolume';
  timestamp: Scalars['String']['output'];
  volume: Scalars['String']['output'];
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

export type EnumLegacyPositionStatusFilter = {
  equals?: InputMaybe<LegacyPositionStatus>;
  in?: InputMaybe<Array<LegacyPositionStatus>>;
  not?: InputMaybe<NestedEnumLegacyPositionStatusFilter>;
  notIn?: InputMaybe<Array<LegacyPositionStatus>>;
};

export type EnumLimitOrderStatusFilter = {
  equals?: InputMaybe<LimitOrderStatus>;
  in?: InputMaybe<Array<LimitOrderStatus>>;
  not?: InputMaybe<NestedEnumLimitOrderStatusFilter>;
  notIn?: InputMaybe<Array<LimitOrderStatus>>;
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

export type LegacyCategorySummary = {
  __typename?: 'LegacyCategorySummary';
  slug: Scalars['String']['output'];
};

export type LegacyConditionSummary = {
  __typename?: 'LegacyConditionSummary';
  category?: Maybe<LegacyCategorySummary>;
  endTime?: Maybe<Scalars['Int']['output']>;
  id: Scalars['String']['output'];
  question?: Maybe<Scalars['String']['output']>;
  resolvedToYes: Scalars['Boolean']['output'];
  resolver?: Maybe<Scalars['String']['output']>;
  settled: Scalars['Boolean']['output'];
  shortName?: Maybe<Scalars['String']['output']>;
};

/** Legacy position model (NFT-based, V1) */
export type LegacyPosition = {
  __typename?: 'LegacyPosition';
  _count?: Maybe<LegacyPositionCount>;
  chainId: Scalars['Int']['output'];
  counterparty: Scalars['String']['output'];
  counterpartyCollateral?: Maybe<Scalars['String']['output']>;
  counterpartyNftTokenId: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  endsAt?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  mintedAt: Scalars['Int']['output'];
  predictions: Array<LegacyPrediction>;
  predictor: Scalars['String']['output'];
  predictorCollateral?: Maybe<Scalars['String']['output']>;
  predictorNftTokenId: Scalars['String']['output'];
  /** True when the predictor's submitted outcomes were correct (previously makerWon) */
  predictorWon?: Maybe<Scalars['Boolean']['output']>;
  refCode?: Maybe<Scalars['String']['output']>;
  settledAt?: Maybe<Scalars['Int']['output']>;
  status: LegacyPositionStatus;
  totalCollateral: Scalars['String']['output'];
};


/** Legacy position model (NFT-based, V1) */
export type LegacyPositionPredictionsArgs = {
  cursor?: InputMaybe<LegacyPredictionWhereUniqueInput>;
  distinct?: InputMaybe<Array<LegacyPredictionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<LegacyPredictionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<LegacyPredictionWhereInput>;
};

export type LegacyPositionCount = {
  __typename?: 'LegacyPositionCount';
  predictions: Scalars['Int']['output'];
};


export type LegacyPositionCountPredictionsArgs = {
  where?: InputMaybe<LegacyPredictionWhereInput>;
};

export type LegacyPositionNullableRelationFilter = {
  is?: InputMaybe<LegacyPositionWhereInput>;
  isNot?: InputMaybe<LegacyPositionWhereInput>;
};

export type LegacyPositionOrderByWithRelationInput = {
  chainId?: InputMaybe<SortOrder>;
  counterparty?: InputMaybe<SortOrder>;
  counterpartyCollateral?: InputMaybe<SortOrderInput>;
  counterpartyNftTokenId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  endsAt?: InputMaybe<SortOrderInput>;
  id?: InputMaybe<SortOrder>;
  marketAddress?: InputMaybe<SortOrder>;
  mintedAt?: InputMaybe<SortOrder>;
  predictions?: InputMaybe<LegacyPredictionOrderByRelationAggregateInput>;
  predictor?: InputMaybe<SortOrder>;
  predictorCollateral?: InputMaybe<SortOrderInput>;
  predictorNftTokenId?: InputMaybe<SortOrder>;
  predictorWon?: InputMaybe<SortOrderInput>;
  refCode?: InputMaybe<SortOrderInput>;
  settledAt?: InputMaybe<SortOrderInput>;
  status?: InputMaybe<SortOrder>;
  totalCollateral?: InputMaybe<SortOrder>;
};

export type LegacyPositionStatus =
  | 'active'
  | 'consolidated'
  | 'settled';

export type LegacyPositionType = {
  __typename?: 'LegacyPositionType';
  chainId: Scalars['Int']['output'];
  counterparty: Scalars['String']['output'];
  counterpartyCollateral?: Maybe<Scalars['String']['output']>;
  counterpartyNftTokenId: Scalars['String']['output'];
  endsAt?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  mintedAt: Scalars['Int']['output'];
  predictions: Array<LegacyPredictionType>;
  predictor: Scalars['String']['output'];
  predictorCollateral?: Maybe<Scalars['String']['output']>;
  predictorNftTokenId: Scalars['String']['output'];
  predictorWon?: Maybe<Scalars['Boolean']['output']>;
  refCode?: Maybe<Scalars['String']['output']>;
  settledAt?: Maybe<Scalars['Int']['output']>;
  status: Scalars['String']['output'];
  totalCollateral: Scalars['String']['output'];
};

export type LegacyPositionWhereInput = {
  AND?: InputMaybe<Array<LegacyPositionWhereInput>>;
  NOT?: InputMaybe<Array<LegacyPositionWhereInput>>;
  OR?: InputMaybe<Array<LegacyPositionWhereInput>>;
  chainId?: InputMaybe<IntFilter>;
  counterparty?: InputMaybe<StringFilter>;
  counterpartyCollateral?: InputMaybe<StringNullableFilter>;
  counterpartyNftTokenId?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  endsAt?: InputMaybe<IntNullableFilter>;
  id?: InputMaybe<IntFilter>;
  marketAddress?: InputMaybe<StringFilter>;
  mintedAt?: InputMaybe<IntFilter>;
  predictions?: InputMaybe<LegacyPredictionListRelationFilter>;
  predictor?: InputMaybe<StringFilter>;
  predictorCollateral?: InputMaybe<StringNullableFilter>;
  predictorNftTokenId?: InputMaybe<StringFilter>;
  predictorWon?: InputMaybe<BoolNullableFilter>;
  refCode?: InputMaybe<StringNullableFilter>;
  settledAt?: InputMaybe<IntNullableFilter>;
  status?: InputMaybe<EnumLegacyPositionStatusFilter>;
  totalCollateral?: InputMaybe<StringFilter>;
};

export type LegacyPrediction = {
  __typename?: 'LegacyPrediction';
  chainId?: Maybe<Scalars['Int']['output']>;
  condition: Condition;
  conditionId: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  limitOrder?: Maybe<LimitOrder>;
  limitOrderId?: Maybe<Scalars['Int']['output']>;
  outcomeYes: Scalars['Boolean']['output'];
  position?: Maybe<LegacyPosition>;
  positionId?: Maybe<Scalars['Int']['output']>;
};


export type LegacyPredictionLimitOrderArgs = {
  where?: InputMaybe<LimitOrderWhereInput>;
};


export type LegacyPredictionPositionArgs = {
  where?: InputMaybe<LegacyPositionWhereInput>;
};

export type LegacyPredictionLimitOrderIdConditionIdCompoundUniqueInput = {
  conditionId: Scalars['String']['input'];
  limitOrderId: Scalars['Int']['input'];
};

export type LegacyPredictionListRelationFilter = {
  every?: InputMaybe<LegacyPredictionWhereInput>;
  none?: InputMaybe<LegacyPredictionWhereInput>;
  some?: InputMaybe<LegacyPredictionWhereInput>;
};

export type LegacyPredictionOrderByRelationAggregateInput = {
  _count?: InputMaybe<SortOrder>;
};

export type LegacyPredictionOrderByWithRelationInput = {
  chainId?: InputMaybe<SortOrderInput>;
  condition?: InputMaybe<ConditionOrderByWithRelationInput>;
  conditionId?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  limitOrder?: InputMaybe<LimitOrderOrderByWithRelationInput>;
  limitOrderId?: InputMaybe<SortOrderInput>;
  outcomeYes?: InputMaybe<SortOrder>;
  position?: InputMaybe<LegacyPositionOrderByWithRelationInput>;
  positionId?: InputMaybe<SortOrderInput>;
};

export type LegacyPredictionPositionIdConditionIdCompoundUniqueInput = {
  conditionId: Scalars['String']['input'];
  positionId: Scalars['Int']['input'];
};

export type LegacyPredictionScalarFieldEnum =
  | 'chainId'
  | 'conditionId'
  | 'createdAt'
  | 'id'
  | 'limitOrderId'
  | 'outcomeYes'
  | 'positionId';

export type LegacyPredictionType = {
  __typename?: 'LegacyPredictionType';
  chainId?: Maybe<Scalars['Int']['output']>;
  condition?: Maybe<LegacyConditionSummary>;
  conditionId: Scalars['String']['output'];
  outcomeYes: Scalars['Boolean']['output'];
};

export type LegacyPredictionWhereInput = {
  AND?: InputMaybe<Array<LegacyPredictionWhereInput>>;
  NOT?: InputMaybe<Array<LegacyPredictionWhereInput>>;
  OR?: InputMaybe<Array<LegacyPredictionWhereInput>>;
  chainId?: InputMaybe<IntNullableFilter>;
  condition?: InputMaybe<ConditionRelationFilter>;
  conditionId?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<IntFilter>;
  limitOrder?: InputMaybe<LimitOrderNullableRelationFilter>;
  limitOrderId?: InputMaybe<IntNullableFilter>;
  outcomeYes?: InputMaybe<BoolFilter>;
  position?: InputMaybe<LegacyPositionNullableRelationFilter>;
  positionId?: InputMaybe<IntNullableFilter>;
};

export type LegacyPredictionWhereUniqueInput = {
  AND?: InputMaybe<Array<LegacyPredictionWhereInput>>;
  NOT?: InputMaybe<Array<LegacyPredictionWhereInput>>;
  OR?: InputMaybe<Array<LegacyPredictionWhereInput>>;
  chainId?: InputMaybe<IntNullableFilter>;
  condition?: InputMaybe<ConditionRelationFilter>;
  conditionId?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<Scalars['Int']['input']>;
  limitOrder?: InputMaybe<LimitOrderNullableRelationFilter>;
  limitOrderId?: InputMaybe<IntNullableFilter>;
  limitOrderId_conditionId?: InputMaybe<LegacyPredictionLimitOrderIdConditionIdCompoundUniqueInput>;
  outcomeYes?: InputMaybe<BoolFilter>;
  position?: InputMaybe<LegacyPositionNullableRelationFilter>;
  positionId?: InputMaybe<IntNullableFilter>;
  positionId_conditionId?: InputMaybe<LegacyPredictionPositionIdConditionIdCompoundUniqueInput>;
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
  predictions: Array<LegacyPrediction>;
  predictor: Scalars['String']['output'];
  predictorCollateral: Scalars['String']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  resolver: Scalars['String']['output'];
  status: LimitOrderStatus;
};


export type LimitOrderPredictionsArgs = {
  cursor?: InputMaybe<LegacyPredictionWhereUniqueInput>;
  distinct?: InputMaybe<Array<LegacyPredictionScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<LegacyPredictionOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<LegacyPredictionWhereInput>;
};

export type LimitOrderCount = {
  __typename?: 'LimitOrderCount';
  predictions: Scalars['Int']['output'];
};


export type LimitOrderCountPredictionsArgs = {
  where?: InputMaybe<LegacyPredictionWhereInput>;
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
  predictions?: InputMaybe<LegacyPredictionOrderByRelationAggregateInput>;
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
  predictions?: InputMaybe<LegacyPredictionListRelationFilter>;
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

export type NestedEnumLegacyPositionStatusFilter = {
  equals?: InputMaybe<LegacyPositionStatus>;
  in?: InputMaybe<Array<LegacyPositionStatus>>;
  not?: InputMaybe<NestedEnumLegacyPositionStatusFilter>;
  notIn?: InputMaybe<Array<LegacyPositionStatus>>;
};

export type NestedEnumLimitOrderStatusFilter = {
  equals?: InputMaybe<LimitOrderStatus>;
  in?: InputMaybe<Array<LimitOrderStatus>>;
  not?: InputMaybe<NestedEnumLimitOrderStatusFilter>;
  notIn?: InputMaybe<Array<LimitOrderStatus>>;
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

export type NullsOrder =
  | 'first'
  | 'last';

export type PickType = {
  __typename?: 'PickType';
  conditionId: Scalars['String']['output'];
  conditionResolver: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  pickConfigId: Scalars['String']['output'];
  predictedOutcome: Scalars['Int']['output'];
};

export type PicksType = {
  __typename?: 'PicksType';
  chainId: Scalars['Int']['output'];
  claimedCounterpartyCollateral: Scalars['String']['output'];
  claimedPredictorCollateral: Scalars['String']['output'];
  counterpartyToken?: Maybe<Scalars['String']['output']>;
  endsAt?: Maybe<Scalars['Int']['output']>;
  id: Scalars['String']['output'];
  marketAddress: Scalars['String']['output'];
  picks: Array<PickType>;
  predictionId?: Maybe<Scalars['String']['output']>;
  predictorToken?: Maybe<Scalars['String']['output']>;
  resolved: Scalars['Boolean']['output'];
  resolvedAt?: Maybe<Scalars['Int']['output']>;
  result: Scalars['String']['output'];
  totalCounterpartyCollateral: Scalars['String']['output'];
  totalPredictorCollateral: Scalars['String']['output'];
};

export type PositionType = {
  __typename?: 'PositionType';
  balance: Scalars['String']['output'];
  chainId: Scalars['Int']['output'];
  holder: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  isPredictorToken: Scalars['Boolean']['output'];
  pickConfig?: Maybe<PicksType>;
  pickConfigId: Scalars['String']['output'];
  tokenAddress: Scalars['String']['output'];
};

export type PredictionType = {
  __typename?: 'PredictionType';
  chainId: Scalars['Int']['output'];
  collateralDeposited?: Maybe<Scalars['String']['output']>;
  collateralDepositedAt?: Maybe<Scalars['Int']['output']>;
  counterparty: Scalars['String']['output'];
  counterpartyClaimable?: Maybe<Scalars['String']['output']>;
  counterpartyCollateral: Scalars['String']['output'];
  counterpartyToken: Scalars['String']['output'];
  createTxHash: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  marketAddress: Scalars['String']['output'];
  predictionId: Scalars['String']['output'];
  predictor: Scalars['String']['output'];
  predictorClaimable?: Maybe<Scalars['String']['output']>;
  predictorCollateral: Scalars['String']['output'];
  predictorToken: Scalars['String']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  result: Scalars['String']['output'];
  settleTxHash?: Maybe<Scalars['String']['output']>;
  settled: Scalars['Boolean']['output'];
  settledAt?: Maybe<Scalars['Int']['output']>;
};

export type ProfitRankType = {
  __typename?: 'ProfitRankType';
  owner: Scalars['String']['output'];
  rank?: Maybe<Scalars['Int']['output']>;
  totalParticipants: Scalars['Int']['output'];
  totalPnL: Scalars['Float']['output'];
};

export type ProtocolStat = {
  __typename?: 'ProtocolStat';
  cumulativeVolume: Scalars['String']['output'];
  escrowBalance: Scalars['String']['output'];
  openInterest: Scalars['String']['output'];
  timestamp: Scalars['String']['output'];
  vaultAirdropGains: Scalars['String']['output'];
  vaultAvailableAssets: Scalars['String']['output'];
  vaultBalance: Scalars['String']['output'];
  vaultCumulativePnL: Scalars['String']['output'];
  vaultDeployed: Scalars['String']['output'];
  vaultDeposits: Scalars['String']['output'];
  vaultPositionsLost: Scalars['Int']['output'];
  vaultPositionsWon: Scalars['Int']['output'];
  vaultWithdrawals: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  accuracyRankByAddress: AccuracyRankType;
  allTimeProfitLeaderboard: Array<AggregatedProfitEntryType>;
  attestations: Array<Attestation>;
  categories: Array<Category>;
  claims: Array<ClaimType>;
  closes: Array<CloseType>;
  condition?: Maybe<Condition>;
  conditionGroup?: Maybe<ConditionGroup>;
  conditionGroups: Array<ConditionGroup>;
  conditions: Array<Condition>;
  dailyVolumes: Array<DailyVolume>;
  forecasterScore?: Maybe<ForecasterScoreType>;
  legacyPositions: Array<LegacyPositionType>;
  legacyPositionsByConditionId: Array<LegacyPositionType>;
  legacyPositionsCount: Scalars['Int']['output'];
  pickConfiguration?: Maybe<PicksType>;
  pickConfigurations: Array<PicksType>;
  positions: Array<PositionType>;
  prediction?: Maybe<PredictionType>;
  predictions: Array<PredictionType>;
  predictionsCount: Scalars['Int']['output'];
  profitRankByAddress: ProfitRankType;
  protocolStats: Array<ProtocolStat>;
  questionsSorted: Array<Question>;
  /** Returns the most recently created legacy positions globally, ordered by mintedAt descending. */
  recentLegacyPositions: Array<LegacyPositionType>;
  secondaryTrade?: Maybe<SecondaryTradeType>;
  secondaryTrades: Array<SecondaryTradeType>;
  secondaryTradesByAddress: Array<SecondaryTradeType>;
  secondaryTradesCount: Scalars['Int']['output'];
  topForecasters: Array<ForecasterScoreType>;
  tradingVolumeByAddress: Scalars['String']['output'];
  user?: Maybe<User>;
  users: Array<User>;
};


export type QueryAccuracyRankByAddressArgs = {
  attester: Scalars['String']['input'];
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


export type QueryForecasterScoreArgs = {
  attester: Scalars['String']['input'];
};


export type QueryLegacyPositionsArgs = {
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


export type QueryLegacyPositionsByConditionIdArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  conditionId: Scalars['String']['input'];
  endsAtGte?: InputMaybe<Scalars['Int']['input']>;
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  take?: Scalars['Int']['input'];
};


export type QueryLegacyPositionsCountArgs = {
  address: Scalars['String']['input'];
  chainId?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryPickConfigurationArgs = {
  id: Scalars['String']['input'];
};


export type QueryPickConfigurationsArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  resolved?: InputMaybe<Scalars['Boolean']['input']>;
  result?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QueryPositionsArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  conditionId?: InputMaybe<Scalars['String']['input']>;
  holder?: InputMaybe<Scalars['String']['input']>;
  pickConfigId?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QueryPredictionArgs = {
  predictionId: Scalars['String']['input'];
};


export type QueryPredictionsArgs = {
  address?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  conditionId?: InputMaybe<Scalars['String']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  settled?: InputMaybe<Scalars['Boolean']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QueryPredictionsCountArgs = {
  address: Scalars['String']['input'];
  chainId?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryProfitRankByAddressArgs = {
  owner: Scalars['String']['input'];
};


export type QueryQuestionsSortedArgs = {
  categorySlugs?: InputMaybe<Array<Scalars['String']['input']>>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  minEndTime?: InputMaybe<Scalars['Int']['input']>;
  resolutionStatus?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  skip: Scalars['Int']['input'];
  sortDirection: Scalars['String']['input'];
  sortField?: InputMaybe<Scalars['String']['input']>;
  take: Scalars['Int']['input'];
};


export type QueryRecentLegacyPositionsArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  take?: Scalars['Int']['input'];
};


export type QuerySecondaryTradeArgs = {
  tradeHash: Scalars['String']['input'];
};


export type QuerySecondaryTradesArgs = {
  buyer?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  seller?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
  token?: InputMaybe<Scalars['String']['input']>;
};


export type QuerySecondaryTradesByAddressArgs = {
  address: Scalars['String']['input'];
  chainId?: InputMaybe<Scalars['Int']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
};


export type QuerySecondaryTradesCountArgs = {
  buyer?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  seller?: InputMaybe<Scalars['String']['input']>;
  token?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTopForecastersArgs = {
  limit?: Scalars['Int']['input'];
};


export type QueryTradingVolumeByAddressArgs = {
  address: Scalars['String']['input'];
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

export type Question = {
  __typename?: 'Question';
  condition?: Maybe<Condition>;
  group?: Maybe<ConditionGroup>;
  predictionCount?: Maybe<Scalars['Int']['output']>;
  questionType: Scalars['String']['output'];
};

export type ReferralCode = {
  __typename?: 'ReferralCode';
  _count?: Maybe<ReferralCodeCount>;
  claimedBy: Array<User>;
  codeHash: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  createdBy: Scalars['String']['output'];
  creatorType: Scalars['String']['output'];
  expiresAt?: Maybe<Scalars['Int']['output']>;
  id: Scalars['Int']['output'];
  isActive: Scalars['Boolean']['output'];
  maxClaims: Scalars['Int']['output'];
  updatedAt: Scalars['DateTimeISO']['output'];
};


export type ReferralCodeClaimedByArgs = {
  cursor?: InputMaybe<UserWhereUniqueInput>;
  distinct?: InputMaybe<Array<UserScalarFieldEnum>>;
  orderBy?: InputMaybe<Array<UserOrderByWithRelationInput>>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<UserWhereInput>;
};

export type ReferralCodeCount = {
  __typename?: 'ReferralCodeCount';
  claimedBy: Scalars['Int']['output'];
};


export type ReferralCodeCountClaimedByArgs = {
  where?: InputMaybe<UserWhereInput>;
};

export type ReferralCodeNullableRelationFilter = {
  is?: InputMaybe<ReferralCodeWhereInput>;
  isNot?: InputMaybe<ReferralCodeWhereInput>;
};

export type ReferralCodeOrderByWithRelationInput = {
  claimedBy?: InputMaybe<UserOrderByRelationAggregateInput>;
  codeHash?: InputMaybe<SortOrder>;
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
  claimedBy?: InputMaybe<UserListRelationFilter>;
  codeHash?: InputMaybe<StringFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  createdBy?: InputMaybe<StringFilter>;
  creatorType?: InputMaybe<StringFilter>;
  expiresAt?: InputMaybe<IntNullableFilter>;
  id?: InputMaybe<IntFilter>;
  isActive?: InputMaybe<BoolFilter>;
  maxClaims?: InputMaybe<IntFilter>;
  updatedAt?: InputMaybe<DateTimeFilter>;
};

export type SecondaryTradeType = {
  __typename?: 'SecondaryTradeType';
  blockNumber: Scalars['Int']['output'];
  buyer: Scalars['String']['output'];
  chainId: Scalars['Int']['output'];
  collateral: Scalars['String']['output'];
  executedAt: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  price: Scalars['String']['output'];
  refCode?: Maybe<Scalars['String']['output']>;
  seller: Scalars['String']['output'];
  token: Scalars['String']['output'];
  tokenAmount: Scalars['String']['output'];
  tradeHash: Scalars['String']['output'];
  txHash: Scalars['String']['output'];
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
