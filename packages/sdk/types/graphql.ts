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

/** Accuracy rank for an address on the forecasting leaderboard */
export type AccuracyRank = {
  __typename?: 'AccuracyRank';
  accuracyScore: Scalars['Float']['output'];
  address: Scalars['String']['output'];
  rank?: Maybe<Scalars['Int']['output']>;
  totalForecasters: Scalars['Int']['output'];
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

/** Time-bucketed balance snapshot showing deployed and claimable collateral */
export type BalanceDataPoint = {
  __typename?: 'BalanceDataPoint';
  /** Collateral available to claim from settled positions (wei) */
  claimableCollateral: Scalars['String']['output'];
  /** Active collateral deployed in open positions (wei) */
  deployedCollateral: Scalars['String']['output'];
  /** Unix epoch timestamp (seconds) for the start of this bucket */
  timestamp: Scalars['Int']['output'];
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
  name?: InputMaybe<StringFilter>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

/** Record of a settled prediction redemption where a holder burns tokens for collateral */
export type Claim = {
  __typename?: 'Claim';
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

/** Record of a position close where both sides burn tokens and receive payouts */
export type Close = {
  __typename?: 'Close';
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

export type CollateralBalanceSnapshotType = {
  __typename?: 'CollateralBalanceSnapshotType';
  atBlock: Scalars['Int']['output'];
  balance: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  timestamp?: Maybe<Scalars['DateTimeISO']['output']>;
};

export type CollateralBalanceType = {
  __typename?: 'CollateralBalanceType';
  address: Scalars['String']['output'];
  atBlock?: Maybe<Scalars['Int']['output']>;
  balance: Scalars['String']['output'];
  chainId: Scalars['Int']['output'];
};

export type CollateralTransferType = {
  __typename?: 'CollateralTransferType';
  blockNumber: Scalars['Int']['output'];
  chainId: Scalars['Int']['output'];
  from: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  timestamp: Scalars['DateTimeISO']['output'];
  to: Scalars['String']['output'];
  transactionHash: Scalars['String']['output'];
  value: Scalars['String']['output'];
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
  conditionGroup?: Maybe<ConditionGroup>;
  conditionGroupId?: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTimeISO']['output'];
  description: Scalars['String']['output'];
  displayOrder?: Maybe<Scalars['Int']['output']>;
  endTime: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  nonDecisive: Scalars['Boolean']['output'];
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
  tags: Array<Scalars['String']['output']>;
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
  conditionGroup?: InputMaybe<ConditionGroupOrderByWithRelationInput>;
  conditionGroupId?: InputMaybe<SortOrderInput>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  displayOrder?: InputMaybe<SortOrderInput>;
  endTime?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  nonDecisive?: InputMaybe<SortOrder>;
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
  tags?: InputMaybe<SortOrder>;
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
  | 'id'
  | 'nonDecisive'
  | 'openInterest'
  | 'predictionCount'
  | 'public'
  | 'question'
  | 'resolvedToYes'
  | 'resolver'
  | 'settled'
  | 'settledAt'
  | 'shortName'
  | 'similarMarkets'
  | 'tags';

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
  conditionGroup?: InputMaybe<ConditionGroupNullableRelationFilter>;
  conditionGroupId?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  description?: InputMaybe<StringFilter>;
  displayOrder?: InputMaybe<IntNullableFilter>;
  endTime?: InputMaybe<IntFilter>;
  id?: InputMaybe<StringFilter>;
  nonDecisive?: InputMaybe<BoolFilter>;
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
  tags?: InputMaybe<StringNullableListFilter>;
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
  conditionGroup?: InputMaybe<ConditionGroupNullableRelationFilter>;
  conditionGroupId?: InputMaybe<IntNullableFilter>;
  createdAt?: InputMaybe<DateTimeFilter>;
  description?: InputMaybe<StringFilter>;
  displayOrder?: InputMaybe<IntNullableFilter>;
  endTime?: InputMaybe<IntFilter>;
  id?: InputMaybe<Scalars['String']['input']>;
  nonDecisive?: InputMaybe<BoolFilter>;
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

/** Accuracy score for a forecaster, aggregated across all scored markets */
export type ForecasterScore = {
  __typename?: 'ForecasterScore';
  accuracyScore: Scalars['Float']['output'];
  address: Scalars['String']['output'];
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

/** Individual outcome pick within a pick configuration */
export type Pick = {
  __typename?: 'Pick';
  conditionId: Scalars['String']['output'];
  conditionResolver: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  pickConfigId: Scalars['String']['output'];
  predictedOutcome: Scalars['Int']['output'];
};

/** Group of outcome picks forming a combined prediction position, with collateral and settlement tracking */
export type PickConfiguration = {
  __typename?: 'PickConfiguration';
  chainId: Scalars['Int']['output'];
  claimedCounterpartyCollateral: Scalars['String']['output'];
  claimedPredictorCollateral: Scalars['String']['output'];
  counterpartyToken?: Maybe<Scalars['String']['output']>;
  endsAt?: Maybe<Scalars['Int']['output']>;
  id: Scalars['String']['output'];
  isLegacy: Scalars['Boolean']['output'];
  marketAddress: Scalars['String']['output'];
  picks: Array<Pick>;
  predictionId?: Maybe<Scalars['String']['output']>;
  predictorToken?: Maybe<Scalars['String']['output']>;
  resolved: Scalars['Boolean']['output'];
  resolvedAt?: Maybe<Scalars['Int']['output']>;
  result: SettlementResult;
  totalCounterpartyCollateral: Scalars['String']['output'];
  totalPredictorCollateral: Scalars['String']['output'];
};

/** Time-bucketed PnL data point with cumulative tracking */
export type PnlDataPoint = {
  __typename?: 'PnlDataPoint';
  /** Running cumulative PnL in wei */
  cumulativePnl: Scalars['String']['output'];
  /** PnL for this bucket in wei */
  pnl: Scalars['String']['output'];
  /** Unix epoch timestamp (seconds) for the start of this bucket */
  timestamp: Scalars['Int']['output'];
};

/** ERC-20 token balance representing a side of a prediction position */
export type Position = {
  __typename?: 'Position';
  balance: Scalars['String']['output'];
  chainId: Scalars['Int']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  holder: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  isPredictorToken: Scalars['Boolean']['output'];
  pickConfig?: Maybe<PickConfiguration>;
  pickConfigId: Scalars['String']['output'];
  tokenAddress: Scalars['String']['output'];
  totalPayout?: Maybe<Scalars['String']['output']>;
  userCollateral?: Maybe<Scalars['String']['output']>;
};

/** Field to sort positions by */
export type PositionSortField =
  | 'CREATED_AT'
  | 'UPDATED_AT';

/** Escrow-based prediction record between a predictor and counterparty, with collateral and settlement tracking */
export type Prediction = {
  __typename?: 'Prediction';
  chainId: Scalars['Int']['output'];
  collateralDeposited?: Maybe<Scalars['String']['output']>;
  collateralDepositedAt?: Maybe<Scalars['Int']['output']>;
  counterparty: Scalars['String']['output'];
  counterpartyClaimable?: Maybe<Scalars['String']['output']>;
  counterpartyCollateral: Scalars['String']['output'];
  counterpartyToken: Scalars['String']['output'];
  createTxHash: Scalars['String']['output'];
  createdAt: Scalars['DateTimeISO']['output'];
  id: Scalars['Int']['output'];
  isLegacy: Scalars['Boolean']['output'];
  marketAddress: Scalars['String']['output'];
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
  settledAt?: Maybe<Scalars['Int']['output']>;
};

/** Time-bucketed prediction count with outcome breakdown, bucketed by creation time */
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
  /** Total predictions created in this bucket */
  total: Scalars['Int']['output'];
  /** Predictions won in this bucket */
  won: Scalars['Int']['output'];
};

/** Field to sort predictions by */
export type PredictionSortField =
  | 'CREATED_AT'
  | 'SETTLED_AT';

/** Aggregated profit/loss entry for a single address across all positions */
export type ProfitEntry = {
  __typename?: 'ProfitEntry';
  address: Scalars['String']['output'];
  totalPnL: Scalars['String']['output'];
};

/** Profit rank and total PnL for an address on the leaderboard */
export type ProfitRank = {
  __typename?: 'ProfitRank';
  address: Scalars['String']['output'];
  rank?: Maybe<Scalars['Int']['output']>;
  totalParticipants: Scalars['Int']['output'];
  totalPnL: Scalars['String']['output'];
};

/** Daily protocol-wide statistics snapshot including vault metrics, volume, and PnL */
export type ProtocolStat = {
  __typename?: 'ProtocolStat';
  cumulativeVolume: Scalars['String']['output'];
  dailyPnL: Scalars['String']['output'];
  dailyVolume: Scalars['String']['output'];
  escrowBalance: Scalars['String']['output'];
  openInterest: Scalars['String']['output'];
  /** Unix epoch timestamp (seconds) for midnight UTC of the snapshot day */
  timestamp: Scalars['Int']['output'];
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
  /** Accuracy score for a single forecaster address, or null if no scored attestations exist */
  accountAccuracy?: Maybe<ForecasterScore>;
  /** Accuracy rank and score for a single address relative to all forecasters */
  accountAccuracyRank: AccuracyRank;
  /** Time-bucketed balance snapshots for a single address showing deployed and claimable collateral */
  accountBalance: Array<BalanceDataPoint>;
  /** Time-bucketed profit and loss for a single address with cumulative tracking */
  accountPnl: Array<PnlDataPoint>;
  /** Time-bucketed prediction count with outcome breakdown for a single address, bucketed by creation time */
  accountPredictionCount: Array<PredictionCountDataPoint>;
  /** Profit rank and total PnL for a single address relative to all participants */
  accountProfitRank: ProfitRank;
  /** Total lifetime trading volume in wei for the given address across all prediction types */
  accountTotalVolume: Scalars['String']['output'];
  /** Time-bucketed trading volume for a single address */
  accountVolume: Array<VolumeDataPoint>;
  /** Top forecasters ranked by accuracy score */
  accuracyLeaderboard: Array<ForecasterScore>;
  attestations: Array<Attestation>;
  categories: Array<Category>;
  /** Paginated list of prediction claim (redemption) records, filterable by holder, prediction, and chain */
  claims: Array<Claim>;
  /** Paginated list of position close (burn) records, filterable by address, pick config, and chain */
  closes: Array<Close>;
  collateralBalance: CollateralBalanceType;
  collateralBalanceHistory: Array<CollateralBalanceSnapshotType>;
  collateralTransfers: Array<CollateralTransferType>;
  condition?: Maybe<Condition>;
  conditionGroup?: Maybe<ConditionGroup>;
  conditionGroups: Array<ConditionGroup>;
  conditions: Array<Condition>;
  /** Look up a single pick configuration by ID */
  pickConfiguration?: Maybe<PickConfiguration>;
  /** Paginated list of pick configurations, filterable by chain, resolution status, and result */
  pickConfigurations: Array<PickConfiguration>;
  /** Paginated list of token position balances, filterable by holder, condition, chain, pick config, settlement, date range, collateral range, and won/lost status */
  positions: Array<Position>;
  /** Look up a single prediction by its on-chain prediction ID */
  prediction?: Maybe<Prediction>;
  /** Count of escrow predictions involving the given address */
  predictionCount: Scalars['Int']['output'];
  /** Paginated list of escrow-based predictions, filterable by address, condition, chain, and settlement status */
  predictions: Array<Prediction>;
  /** Profit leaderboard — addresses ranked by total PnL across all positions */
  profitLeaderboard: Array<ProfitEntry>;
  /** Daily protocol statistics time series (last 90 days) — vault balance, volume, PnL, and open interest */
  protocolStats: Array<ProtocolStat>;
  /** Time-bucketed total protocol trading volume across all users */
  protocolVolume: Array<VolumeDataPoint>;
  /** Sorted, paginated list of questions — groups and ungrouped conditions interleaved by the chosen sort field */
  questions: Array<Question>;
  /** Look up a single secondary market trade by its trade hash */
  trade?: Maybe<Trade>;
  /** Count of secondary market trades matching the given filters */
  tradeCount: Scalars['Int']['output'];
  /** Paginated list of secondary market trades, filterable by seller, buyer, token, and chain */
  trades: Array<Trade>;
  user?: Maybe<User>;
  users: Array<User>;
};


export type QueryAccountAccuracyArgs = {
  address: Scalars['String']['input'];
};


export type QueryAccountAccuracyRankArgs = {
  address: Scalars['String']['input'];
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


export type QueryAccountTotalVolumeArgs = {
  address: Scalars['String']['input'];
};


export type QueryAccountVolumeArgs = {
  address: Scalars['String']['input'];
  from?: InputMaybe<Scalars['DateTimeISO']['input']>;
  interval: TimeInterval;
  to?: InputMaybe<Scalars['DateTimeISO']['input']>;
};


export type QueryAccuracyLeaderboardArgs = {
  limit?: Scalars['Int']['input'];
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


export type QueryCollateralBalanceArgs = {
  address: Scalars['String']['input'];
  atBlock?: InputMaybe<Scalars['Int']['input']>;
  chainId: Scalars['Int']['input'];
};


export type QueryCollateralBalanceHistoryArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  count?: Scalars['Int']['input'];
  currentBlock?: InputMaybe<Scalars['Int']['input']>;
  intervalHours?: Scalars['Int']['input'];
};


export type QueryCollateralTransfersArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
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


export type QueryPredictionArgs = {
  id: Scalars['String']['input'];
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


export type QueryProfitLeaderboardArgs = {
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
};


export type QueryProtocolVolumeArgs = {
  from?: InputMaybe<Scalars['DateTimeISO']['input']>;
  interval: TimeInterval;
  to?: InputMaybe<Scalars['DateTimeISO']['input']>;
};


export type QueryQuestionsArgs = {
  categorySlugs?: InputMaybe<Array<Scalars['String']['input']>>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  minEndTime?: InputMaybe<Scalars['Int']['input']>;
  resolutionStatus?: InputMaybe<ResolutionStatus>;
  search?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  sortDirection?: SortOrder;
  sortField?: InputMaybe<QuestionSortField>;
  take?: Scalars['Int']['input'];
};


export type QueryTradeArgs = {
  id: Scalars['String']['input'];
};


export type QueryTradeCountArgs = {
  buyer?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  seller?: InputMaybe<Scalars['String']['input']>;
  token?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTradesArgs = {
  buyer?: InputMaybe<Scalars['String']['input']>;
  chainId?: InputMaybe<Scalars['Int']['input']>;
  seller?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  take?: Scalars['Int']['input'];
  token?: InputMaybe<Scalars['String']['input']>;
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

/** A question item — either a group of related conditions or a single ungrouped condition */
export type Question = {
  __typename?: 'Question';
  condition?: Maybe<Condition>;
  group?: Maybe<ConditionGroup>;
  predictionCount?: Maybe<Scalars['Int']['output']>;
  questionType: QuestionItemType;
};

/** Whether a question is a group of related conditions or a single condition */
export type QuestionItemType =
  | 'condition'
  | 'group';

/** Field to sort questions by */
export type QuestionSortField =
  | 'createdAt'
  | 'endTime'
  | 'openInterest'
  | 'predictionCount';

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

/** Time interval for bucketing time-series data */
export type TimeInterval =
  | 'DAY'
  | 'HOUR'
  | 'MONTH'
  | 'WEEK';

/** Secondary market trade record where position tokens are exchanged between users */
export type Trade = {
  __typename?: 'Trade';
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

/** Time-bucketed volume data point for charts */
export type VolumeDataPoint = {
  __typename?: 'VolumeDataPoint';
  /** Unix epoch timestamp (seconds) for the start of this bucket */
  timestamp: Scalars['Int']['output'];
  /** Total volume in wei for this bucket */
  volume: Scalars['String']['output'];
};
