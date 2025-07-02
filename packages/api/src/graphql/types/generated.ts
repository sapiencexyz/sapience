import { GraphQLResolveInfo } from 'graphql';
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
  id: Scalars['ID']['output'];
  marketGroups?: Maybe<Array<MarketGroup>>;
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type Market = {
  __typename?: 'Market';
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  currentPrice?: Maybe<Scalars['String']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  marketGroup?: Maybe<MarketGroup>;
  marketId: Scalars['Int']['output'];
  marketParamsAssertionliveness?: Maybe<Scalars['String']['output']>;
  marketParamsBondamount?: Maybe<Scalars['String']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsClaimstatement?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  optionName?: Maybe<Scalars['String']['output']>;
  poolAddress?: Maybe<Scalars['String']['output']>;
  positions?: Maybe<Array<Position>>;
  public: Scalars['Boolean']['output'];
  question?: Maybe<Scalars['String']['output']>;
  rules?: Maybe<Scalars['String']['output']>;
  settled?: Maybe<Scalars['Boolean']['output']>;
  settlementPriceD18?: Maybe<Scalars['String']['output']>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['String']['output']>;
};

export type MarketFilterInput = {
  endTimestamp_gt?: InputMaybe<Scalars['String']['input']>;
};

export type MarketGroup = {
  __typename?: 'MarketGroup';
  address?: Maybe<Scalars['String']['output']>;
  baseTokenName?: Maybe<Scalars['String']['output']>;
  category?: Maybe<Category>;
  chainId: Scalars['Int']['output'];
  collateralAsset?: Maybe<Scalars['String']['output']>;
  collateralDecimals?: Maybe<Scalars['Int']['output']>;
  collateralSymbol?: Maybe<Scalars['String']['output']>;
  deployTimestamp?: Maybe<Scalars['Int']['output']>;
  deployTxnBlockNumber?: Maybe<Scalars['Int']['output']>;
  factoryAddress?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  initializationNonce?: Maybe<Scalars['String']['output']>;
  isCumulative: Scalars['Boolean']['output'];
  isYin: Scalars['Boolean']['output'];
  marketParamsAssertionliveness?: Maybe<Scalars['String']['output']>;
  marketParamsBondamount?: Maybe<Scalars['String']['output']>;
  marketParamsBondcurrency?: Maybe<Scalars['String']['output']>;
  marketParamsClaimstatement?: Maybe<Scalars['String']['output']>;
  marketParamsFeerate?: Maybe<Scalars['Int']['output']>;
  marketParamsOptimisticoraclev3?: Maybe<Scalars['String']['output']>;
  marketParamsUniswappositionmanager?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapquoter?: Maybe<Scalars['String']['output']>;
  marketParamsUniswapswaprouter?: Maybe<Scalars['String']['output']>;
  markets?: Maybe<Array<Market>>;
  minTradeSize?: Maybe<Scalars['String']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  quoteTokenName?: Maybe<Scalars['String']['output']>;
  resource?: Maybe<Resource>;
  vaultAddress?: Maybe<Scalars['String']['output']>;
};

<<<<<<< HEAD
<<<<<<< HEAD
export type MarketGroupMarketsArgs = {
=======
=======

>>>>>>> main
export type MarketGroupTypeMarketsArgs = {
>>>>>>> main
  filter?: InputMaybe<MarketFilterInput>;
  orderBy?: InputMaybe<MarketOrderInput>;
};

export type MarketOrderInput = {
  direction: Scalars['String']['input'];
  field: Scalars['String']['input'];
};

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
  baseToken?: Maybe<Scalars['String']['output']>;
  borrowedBaseToken?: Maybe<Scalars['String']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['String']['output']>;
  collateral?: Maybe<Scalars['String']['output']>;
  highPriceTick?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isLP: Scalars['Boolean']['output'];
  isSettled?: Maybe<Scalars['Boolean']['output']>;
  lowPriceTick?: Maybe<Scalars['String']['output']>;
  lpBaseToken?: Maybe<Scalars['String']['output']>;
  lpQuoteToken?: Maybe<Scalars['String']['output']>;
  market?: Maybe<Market>;
  owner?: Maybe<Scalars['String']['output']>;
  positionId: Scalars['Int']['output'];
  quoteToken?: Maybe<Scalars['String']['output']>;
  transactions?: Maybe<Array<Transaction>>;
};

export type Query = {
  __typename?: 'Query';
  categories: Array<Category>;
  getMarketLeaderboard: Array<PnLType>;
  indexCandlesFromCache: CandleAndTimestampType;
  indexPriceAtTime?: Maybe<CandleType>;
  legacyMarketCandles: Array<CandleType>;
  marketCandlesFromCache: CandleAndTimestampType;
  marketGroup?: Maybe<MarketGroup>;
  marketGroups: Array<MarketGroup>;
  marketGroupsByCategory: Array<MarketGroup>;
  markets: Array<Market>;
  positions: Array<Position>;
  resource?: Maybe<Resource>;
  resourceCandlesFromCache: CandleAndTimestampType;
  resourcePrices: Array<ResourcePrice>;
  resourceTrailingAverageCandlesFromCache: CandleAndTimestampType;
  resources: Array<Resource>;
  totalVolumeByMarket: Scalars['Float']['output'];
  transactions: Array<Transaction>;
};


export type QueryGetMarketLeaderboardArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  marketId: Scalars['String']['input'];
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


export type QueryMarketGroupsByCategoryArgs = {
  slug: Scalars['String']['input'];
};


export type QueryMarketsArgs = {
  chainId: Scalars['Int']['input'];
  marketAddress: Scalars['String']['input'];
  marketId: Scalars['Int']['input'];
};


export type QueryPositionsArgs = {
  chainId?: InputMaybe<Scalars['Int']['input']>;
  marketAddress?: InputMaybe<Scalars['String']['input']>;
  owner?: InputMaybe<Scalars['String']['input']>;
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


export type QueryResourcesArgs = {
  categorySlug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTotalVolumeByMarketArgs = {
  chainId: Scalars['Int']['input'];
  marketAddress: Scalars['String']['input'];
  marketId: Scalars['Int']['input'];
};


export type QueryTransactionsArgs = {
  positionId?: InputMaybe<Scalars['Int']['input']>;
};

export type Resource = {
  __typename?: 'Resource';
  category?: Maybe<Category>;
  id: Scalars['ID']['output'];
  marketGroups?: Maybe<Array<MarketGroup>>;
  name: Scalars['String']['output'];
  resourcePrices?: Maybe<Array<ResourcePrice>>;
  slug: Scalars['String']['output'];
};

export type ResourcePrice = {
  __typename?: 'ResourcePrice';
  blockNumber: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  resource?: Maybe<Resource>;
  timestamp: Scalars['Int']['output'];
  value: Scalars['String']['output'];
};

export type Transaction = {
  __typename?: 'Transaction';
  baseToken?: Maybe<Scalars['String']['output']>;
  collateral?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lpBaseDeltaToken?: Maybe<Scalars['String']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['String']['output']>;
  position?: Maybe<Position>;
  quoteToken?: Maybe<Scalars['String']['output']>;
  timestamp?: Maybe<Scalars['Int']['output']>;
  tradeRatioD18?: Maybe<Scalars['String']['output']>;
  transactionHash?: Maybe<Scalars['String']['output']>;
  type: Scalars['String']['output'];
};

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
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  CandleAndTimestampType: ResolverTypeWrapper<CandleAndTimestampType>;
  CandleType: ResolverTypeWrapper<CandleType>;
  Category: ResolverTypeWrapper<Category>;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Market: ResolverTypeWrapper<Market>;
  MarketFilterInput: MarketFilterInput;
  MarketGroup: ResolverTypeWrapper<MarketGroup>;
  MarketOrderInput: MarketOrderInput;
  PnLType: ResolverTypeWrapper<PnLType>;
  Position: ResolverTypeWrapper<Position>;
  Query: ResolverTypeWrapper<{}>;
  Resource: ResolverTypeWrapper<Resource>;
  ResourcePrice: ResolverTypeWrapper<ResourcePrice>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Transaction: ResolverTypeWrapper<Transaction>;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Boolean: Scalars['Boolean']['output'];
  CandleAndTimestampType: CandleAndTimestampType;
  CandleType: CandleType;
  Category: Category;
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Market: Market;
  MarketFilterInput: MarketFilterInput;
  MarketGroup: MarketGroup;
  MarketOrderInput: MarketOrderInput;
  PnLType: PnLType;
  Position: Position;
  Query: {};
  Resource: Resource;
  ResourcePrice: ResourcePrice;
  String: Scalars['String']['output'];
  Transaction: Transaction;
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

<<<<<<< HEAD
<<<<<<< HEAD
export type CategoryResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['Category'] = ResolversParentTypes['Category'],
> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  marketGroups?: Resolver<
    Maybe<Array<ResolversTypes['MarketGroup']>>,
=======
export type CategoryTypeResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['CategoryType'] = ResolversParentTypes['CategoryType'],
> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  marketGroups?: Resolver<
    Array<ResolversTypes['MarketGroupType']>,
>>>>>>> main
    ParentType,
    ContextType
  >;
=======
export type CategoryTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CategoryType'] = ResolversParentTypes['CategoryType']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  marketGroups?: Resolver<Array<ResolversTypes['MarketGroupType']>, ParentType, ContextType>;
>>>>>>> main
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

<<<<<<< HEAD
<<<<<<< HEAD
export type MarketResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['Market'] = ResolversParentTypes['Market'],
> = ResolversObject<{
  baseAssetMaxPriceTick?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  baseAssetMinPriceTick?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  currentPrice?: Resolver<
=======
export type MarketGroupTypeResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['MarketGroupType'] = ResolversParentTypes['MarketGroupType'],
> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  baseTokenName?: Resolver<
>>>>>>> main
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
<<<<<<< HEAD
  endTimestamp?: Resolver<
=======
  category?: Resolver<
    Maybe<ResolversTypes['CategoryType']>,
    ParentType,
    ContextType
  >;
  chainId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  claimStatement?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  collateralAsset?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  collateralDecimals?: Resolver<
>>>>>>> main
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
<<<<<<< HEAD
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  marketGroup?: Resolver<
    Maybe<ResolversTypes['MarketGroup']>,
=======
  collateralSymbol?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  deployTimestamp?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  deployTxnBlockNumber?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  factoryAddress?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
=======
export type MarketGroupTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['MarketGroupType'] = ResolversParentTypes['MarketGroupType']> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  baseTokenName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  category?: Resolver<Maybe<ResolversTypes['CategoryType']>, ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  claimStatement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  collateralAsset?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  collateralDecimals?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  collateralSymbol?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  deployTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  deployTxnBlockNumber?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  factoryAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
>>>>>>> main
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  initializationNonce?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  isCumulative?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isYin?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  marketParams?: Resolver<Maybe<ResolversTypes['MarketParamsType']>, ParentType, ContextType>;
  markets?: Resolver<Array<ResolversTypes['MarketType']>, ParentType, ContextType, Partial<MarketGroupTypeMarketsArgs>>;
  minTradeSize?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quoteTokenName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  resource?: Resolver<Maybe<ResolversTypes['ResourceType']>, ParentType, ContextType>;
  vaultAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MarketParamsTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['MarketParamsType'] = ResolversParentTypes['MarketParamsType']> = ResolversObject<{
  assertionLiveness?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  bondAmount?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  bondCurrency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  claimStatement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  feeRate?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  optimisticOracleV3?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  uniswapPositionManager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  uniswapQuoter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  uniswapSwapRouter?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MarketTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['MarketType'] = ResolversParentTypes['MarketType']> = ResolversObject<{
  baseAssetMaxPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  baseAssetMinPriceTick?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  currentPrice?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  endTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
<<<<<<< HEAD
  marketGroup?: Resolver<
    Maybe<ResolversTypes['MarketGroupType']>,
>>>>>>> main
    ParentType,
    ContextType
  >;
  marketId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
<<<<<<< HEAD
  marketParamsAssertionliveness?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsBondamount?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsBondcurrency?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsClaimstatement?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsFeerate?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  marketParamsOptimisticoraclev3?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsUniswappositionmanager?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsUniswapquoter?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsUniswapswaprouter?: Resolver<
    Maybe<ResolversTypes['String']>,
=======
  marketParams?: Resolver<
    Maybe<ResolversTypes['MarketParamsType']>,
>>>>>>> main
    ParentType,
    ContextType
  >;
  optionName?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  poolAddress?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  positions?: Resolver<
<<<<<<< HEAD
    Maybe<Array<ResolversTypes['Position']>>,
=======
    Array<ResolversTypes['PositionType']>,
>>>>>>> main
    ParentType,
    ContextType
  >;
=======
  marketGroup?: Resolver<Maybe<ResolversTypes['MarketGroupType']>, ParentType, ContextType>;
  marketId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParams?: Resolver<Maybe<ResolversTypes['MarketParamsType']>, ParentType, ContextType>;
  optionName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  poolAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  positions?: Resolver<Array<ResolversTypes['PositionType']>, ParentType, ContextType>;
>>>>>>> main
  public?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rules?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  settled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  settlementPriceD18?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  startTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  startingSqrtPriceX96?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

<<<<<<< HEAD
<<<<<<< HEAD
export type MarketGroupResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['MarketGroup'] = ResolversParentTypes['MarketGroup'],
> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  baseTokenName?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  category?: Resolver<
    Maybe<ResolversTypes['Category']>,
    ParentType,
    ContextType
  >;
  chainId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  collateralAsset?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  collateralDecimals?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  collateralSymbol?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  deployTimestamp?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  deployTxnBlockNumber?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  factoryAddress?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  initializationNonce?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  isCumulative?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isYin?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  marketParamsAssertionliveness?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsBondamount?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsBondcurrency?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsClaimstatement?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsFeerate?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  marketParamsOptimisticoraclev3?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsUniswappositionmanager?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsUniswapquoter?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  marketParamsUniswapswaprouter?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  markets?: Resolver<
    Maybe<Array<ResolversTypes['Market']>>,
    ParentType,
    ContextType,
    Partial<MarketGroupMarketsArgs>
  >;
  minTradeSize?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quoteTokenName?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  resource?: Resolver<
    Maybe<ResolversTypes['Resource']>,
    ParentType,
    ContextType
  >;
  vaultAddress?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

=======
>>>>>>> main
export type PnLTypeResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['PnLType'] = ResolversParentTypes['PnLType'],
> = ResolversObject<{
=======
export type PnLTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['PnLType'] = ResolversParentTypes['PnLType']> = ResolversObject<{
>>>>>>> main
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

<<<<<<< HEAD
<<<<<<< HEAD
export type PositionResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['Position'] = ResolversParentTypes['Position'],
> = ResolversObject<{
  baseToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
=======
export type PositionTypeResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['PositionType'] = ResolversParentTypes['PositionType'],
> = ResolversObject<{
  baseToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
>>>>>>> main
  borrowedBaseToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  borrowedQuoteToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
<<<<<<< HEAD
  collateral?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
=======
  collateral?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
>>>>>>> main
  highPriceTick?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isLP?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isSettled?: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >;
  lowPriceTick?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  lpBaseToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  lpQuoteToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
<<<<<<< HEAD
  market?: Resolver<Maybe<ResolversTypes['Market']>, ParentType, ContextType>;
  owner?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  positionId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  quoteToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  transactions?: Resolver<
    Maybe<Array<ResolversTypes['Transaction']>>,
=======
=======
export type PositionTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['PositionType'] = ResolversParentTypes['PositionType']> = ResolversObject<{
  baseToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  borrowedBaseToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  borrowedQuoteToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  collateral?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  highPriceTick?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isLP?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isSettled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  lowPriceTick?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lpBaseToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lpQuoteToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
>>>>>>> main
  market?: Resolver<ResolversTypes['MarketType'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  positionId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  quoteToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
<<<<<<< HEAD
  transactions?: Resolver<
    Array<ResolversTypes['TransactionType']>,
>>>>>>> main
    ParentType,
    ContextType
  >;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type QueryResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['Query'] = ResolversParentTypes['Query'],
> = ResolversObject<{
  categories?: Resolver<
<<<<<<< HEAD
    Array<ResolversTypes['Category']>,
=======
    Array<ResolversTypes['CategoryType']>,
>>>>>>> main
    ParentType,
    ContextType
  >;
  getMarketLeaderboard?: Resolver<
    Array<ResolversTypes['PnLType']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryGetMarketLeaderboardArgs,
      'address' | 'chainId' | 'marketId'
    >
  >;
  indexCandlesFromCache?: Resolver<
    ResolversTypes['CandleAndTimestampType'],
    ParentType,
    ContextType,
    RequireFields<
      QueryIndexCandlesFromCacheArgs,
      'address' | 'chainId' | 'from' | 'interval' | 'marketId' | 'to'
    >
  >;
  indexPriceAtTime?: Resolver<
    Maybe<ResolversTypes['CandleType']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryIndexPriceAtTimeArgs,
      'address' | 'chainId' | 'marketId' | 'timestamp'
    >
  >;
  legacyMarketCandles?: Resolver<
    Array<ResolversTypes['CandleType']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryLegacyMarketCandlesArgs,
      'address' | 'chainId' | 'from' | 'interval' | 'marketId' | 'to'
    >
  >;
  marketCandlesFromCache?: Resolver<
    ResolversTypes['CandleAndTimestampType'],
    ParentType,
    ContextType,
    RequireFields<
      QueryMarketCandlesFromCacheArgs,
      'address' | 'chainId' | 'from' | 'interval' | 'marketId' | 'to'
    >
  >;
  marketGroup?: Resolver<
<<<<<<< HEAD
    Maybe<ResolversTypes['MarketGroup']>,
=======
    Maybe<ResolversTypes['MarketGroupType']>,
>>>>>>> main
    ParentType,
    ContextType,
    RequireFields<QueryMarketGroupArgs, 'address' | 'chainId'>
  >;
  marketGroups?: Resolver<
<<<<<<< HEAD
    Array<ResolversTypes['MarketGroup']>,
=======
    Array<ResolversTypes['MarketGroupType']>,
>>>>>>> main
    ParentType,
    ContextType,
    Partial<QueryMarketGroupsArgs>
  >;
  marketGroupsByCategory?: Resolver<
<<<<<<< HEAD
    Array<ResolversTypes['MarketGroup']>,
=======
    Array<ResolversTypes['MarketGroupType']>,
>>>>>>> main
    ParentType,
    ContextType,
    RequireFields<QueryMarketGroupsByCategoryArgs, 'slug'>
  >;
  markets?: Resolver<
<<<<<<< HEAD
    Array<ResolversTypes['Market']>,
=======
    Array<ResolversTypes['MarketType']>,
>>>>>>> main
    ParentType,
    ContextType,
    RequireFields<QueryMarketsArgs, 'chainId' | 'marketAddress' | 'marketId'>
  >;
  positions?: Resolver<
<<<<<<< HEAD
    Array<ResolversTypes['Position']>,
=======
    Array<ResolversTypes['PositionType']>,
>>>>>>> main
    ParentType,
    ContextType,
    Partial<QueryPositionsArgs>
  >;
  resource?: Resolver<
<<<<<<< HEAD
    Maybe<ResolversTypes['Resource']>,
=======
    Maybe<ResolversTypes['ResourceType']>,
>>>>>>> main
    ParentType,
    ContextType,
    RequireFields<QueryResourceArgs, 'slug'>
  >;
  resourceCandlesFromCache?: Resolver<
    ResolversTypes['CandleAndTimestampType'],
    ParentType,
    ContextType,
    RequireFields<
      QueryResourceCandlesFromCacheArgs,
      'from' | 'interval' | 'slug' | 'to'
    >
  >;
  resourcePrices?: Resolver<
<<<<<<< HEAD
    Array<ResolversTypes['ResourcePrice']>,
=======
    Array<ResolversTypes['ResourcePriceType']>,
>>>>>>> main
    ParentType,
    ContextType
  >;
  resourceTrailingAverageCandlesFromCache?: Resolver<
    ResolversTypes['CandleAndTimestampType'],
    ParentType,
    ContextType,
    RequireFields<
      QueryResourceTrailingAverageCandlesFromCacheArgs,
      'from' | 'interval' | 'slug' | 'to' | 'trailingAvgTime'
    >
  >;
  resources?: Resolver<
<<<<<<< HEAD
    Array<ResolversTypes['Resource']>,
=======
    Array<ResolversTypes['ResourceType']>,
>>>>>>> main
    ParentType,
    ContextType,
    Partial<QueryResourcesArgs>
  >;
  totalVolumeByMarket?: Resolver<
    ResolversTypes['Float'],
    ParentType,
    ContextType,
    RequireFields<
      QueryTotalVolumeByMarketArgs,
      'chainId' | 'marketAddress' | 'marketId'
    >
  >;
  transactions?: Resolver<
<<<<<<< HEAD
    Array<ResolversTypes['Transaction']>,
=======
    Array<ResolversTypes['TransactionType']>,
>>>>>>> main
    ParentType,
    ContextType,
    Partial<QueryTransactionsArgs>
  >;
}>;

<<<<<<< HEAD
export type ResourceResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['Resource'] = ResolversParentTypes['Resource'],
> = ResolversObject<{
  category?: Resolver<
    Maybe<ResolversTypes['Category']>,
    ParentType,
    ContextType
  >;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  marketGroups?: Resolver<
    Maybe<Array<ResolversTypes['MarketGroup']>>,
    ParentType,
    ContextType
  >;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  resourcePrices?: Resolver<
    Maybe<Array<ResolversTypes['ResourcePrice']>>,
    ParentType,
    ContextType
  >;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ResourcePriceResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['ResourcePrice'] = ResolversParentTypes['ResourcePrice'],
=======
export type ResourcePriceTypeResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['ResourcePriceType'] = ResolversParentTypes['ResourcePriceType'],
>>>>>>> main
> = ResolversObject<{
  blockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  resource?: Resolver<
<<<<<<< HEAD
    Maybe<ResolversTypes['Resource']>,
=======
    Maybe<ResolversTypes['ResourceType']>,
>>>>>>> main
    ParentType,
    ContextType
  >;
=======
  transactions?: Resolver<Array<ResolversTypes['TransactionType']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  categories?: Resolver<Array<ResolversTypes['CategoryType']>, ParentType, ContextType>;
  getMarketLeaderboard?: Resolver<Array<ResolversTypes['PnLType']>, ParentType, ContextType, RequireFields<QueryGetMarketLeaderboardArgs, 'address' | 'chainId' | 'marketId'>>;
  indexCandlesFromCache?: Resolver<ResolversTypes['CandleAndTimestampType'], ParentType, ContextType, RequireFields<QueryIndexCandlesFromCacheArgs, 'address' | 'chainId' | 'from' | 'interval' | 'marketId' | 'to'>>;
  indexPriceAtTime?: Resolver<Maybe<ResolversTypes['CandleType']>, ParentType, ContextType, RequireFields<QueryIndexPriceAtTimeArgs, 'address' | 'chainId' | 'marketId' | 'timestamp'>>;
  legacyMarketCandles?: Resolver<Array<ResolversTypes['CandleType']>, ParentType, ContextType, RequireFields<QueryLegacyMarketCandlesArgs, 'address' | 'chainId' | 'from' | 'interval' | 'marketId' | 'to'>>;
  marketCandlesFromCache?: Resolver<ResolversTypes['CandleAndTimestampType'], ParentType, ContextType, RequireFields<QueryMarketCandlesFromCacheArgs, 'address' | 'chainId' | 'from' | 'interval' | 'marketId' | 'to'>>;
  marketGroup?: Resolver<Maybe<ResolversTypes['MarketGroupType']>, ParentType, ContextType, RequireFields<QueryMarketGroupArgs, 'address' | 'chainId'>>;
  marketGroups?: Resolver<Array<ResolversTypes['MarketGroupType']>, ParentType, ContextType, Partial<QueryMarketGroupsArgs>>;
  marketGroupsByCategory?: Resolver<Array<ResolversTypes['MarketGroupType']>, ParentType, ContextType, RequireFields<QueryMarketGroupsByCategoryArgs, 'slug'>>;
  markets?: Resolver<Array<ResolversTypes['MarketType']>, ParentType, ContextType, RequireFields<QueryMarketsArgs, 'chainId' | 'marketAddress' | 'marketId'>>;
  positions?: Resolver<Array<ResolversTypes['PositionType']>, ParentType, ContextType, Partial<QueryPositionsArgs>>;
  resource?: Resolver<Maybe<ResolversTypes['ResourceType']>, ParentType, ContextType, RequireFields<QueryResourceArgs, 'slug'>>;
  resourceCandlesFromCache?: Resolver<ResolversTypes['CandleAndTimestampType'], ParentType, ContextType, RequireFields<QueryResourceCandlesFromCacheArgs, 'from' | 'interval' | 'slug' | 'to'>>;
  resourcePrices?: Resolver<Array<ResolversTypes['ResourcePriceType']>, ParentType, ContextType>;
  resourceTrailingAverageCandlesFromCache?: Resolver<ResolversTypes['CandleAndTimestampType'], ParentType, ContextType, RequireFields<QueryResourceTrailingAverageCandlesFromCacheArgs, 'from' | 'interval' | 'slug' | 'to' | 'trailingAvgTime'>>;
  resources?: Resolver<Array<ResolversTypes['ResourceType']>, ParentType, ContextType, Partial<QueryResourcesArgs>>;
  totalVolumeByMarket?: Resolver<ResolversTypes['Float'], ParentType, ContextType, RequireFields<QueryTotalVolumeByMarketArgs, 'chainId' | 'marketAddress' | 'marketId'>>;
  transactions?: Resolver<Array<ResolversTypes['TransactionType']>, ParentType, ContextType, Partial<QueryTransactionsArgs>>;
}>;

export type ResourcePriceTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['ResourcePriceType'] = ResolversParentTypes['ResourcePriceType']> = ResolversObject<{
  blockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  resource?: Resolver<Maybe<ResolversTypes['ResourceType']>, ParentType, ContextType>;
>>>>>>> main
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

<<<<<<< HEAD
<<<<<<< HEAD
export type TransactionResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['Transaction'] = ResolversParentTypes['Transaction'],
> = ResolversObject<{
  baseToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  collateral?: Resolver<
    Maybe<ResolversTypes['String']>,
=======
export type ResourceTypeResolvers<
  ContextType = ApolloContext,
  ParentType extends
    ResolversParentTypes['ResourceType'] = ResolversParentTypes['ResourceType'],
> = ResolversObject<{
  category?: Resolver<
    Maybe<ResolversTypes['CategoryType']>,
>>>>>>> main
    ParentType,
    ContextType
  >;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
<<<<<<< HEAD
=======
  marketGroups?: Resolver<
    Array<ResolversTypes['MarketGroupType']>,
    ParentType,
    ContextType
  >;
=======
export type ResourceTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['ResourceType'] = ResolversParentTypes['ResourceType']> = ResolversObject<{
  category?: Resolver<Maybe<ResolversTypes['CategoryType']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  marketGroups?: Resolver<Array<ResolversTypes['MarketGroupType']>, ParentType, ContextType>;
>>>>>>> main
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  resourcePrices?: Resolver<Array<ResolversTypes['ResourcePriceType']>, ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TransactionTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['TransactionType'] = ResolversParentTypes['TransactionType']> = ResolversObject<{
  baseToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  baseTokenDelta?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  collateral?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  collateralDelta?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
<<<<<<< HEAD
>>>>>>> main
  lpBaseDeltaToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  lpQuoteDeltaToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  position?: Resolver<
<<<<<<< HEAD
    Maybe<ResolversTypes['Position']>,
=======
    Maybe<ResolversTypes['PositionType']>,
>>>>>>> main
    ParentType,
    ContextType
  >;
  quoteToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
<<<<<<< HEAD
  timestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
=======
  quoteTokenDelta?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
>>>>>>> main
  tradeRatioD18?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  transactionHash?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
=======
  lpBaseDeltaToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lpQuoteDeltaToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  position?: Resolver<Maybe<ResolversTypes['PositionType']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quoteTokenDelta?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tradeRatioD18?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  transactionHash?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
>>>>>>> main
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resolvers<ContextType = ApolloContext> = ResolversObject<{
  CandleAndTimestampType?: CandleAndTimestampTypeResolvers<ContextType>;
  CandleType?: CandleTypeResolvers<ContextType>;
  Category?: CategoryResolvers<ContextType>;
  Market?: MarketResolvers<ContextType>;
  MarketGroup?: MarketGroupResolvers<ContextType>;
  PnLType?: PnLTypeResolvers<ContextType>;
  Position?: PositionResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Resource?: ResourceResolvers<ContextType>;
  ResourcePrice?: ResourcePriceResolvers<ContextType>;
  Transaction?: TransactionResolvers<ContextType>;
}>;

