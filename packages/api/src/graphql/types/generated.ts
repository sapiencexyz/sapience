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

export type CategoryType = {
  __typename?: 'CategoryType';
  id: Scalars['ID']['output'];
  marketGroups: Array<MarketGroupType>;
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type MarketFilterInput = {
  endTimestamp_gt?: InputMaybe<Scalars['String']['input']>;
};

export type MarketGroupType = {
  __typename?: 'MarketGroupType';
  address?: Maybe<Scalars['String']['output']>;
  baseTokenName?: Maybe<Scalars['String']['output']>;
  category?: Maybe<CategoryType>;
  chainId: Scalars['Int']['output'];
  claimStatement?: Maybe<Scalars['String']['output']>;
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
  marketParams?: Maybe<MarketParamsType>;
  markets: Array<MarketType>;
  minTradeSize?: Maybe<Scalars['String']['output']>;
  owner?: Maybe<Scalars['String']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  quoteTokenName?: Maybe<Scalars['String']['output']>;
  resource?: Maybe<ResourceType>;
  vaultAddress?: Maybe<Scalars['String']['output']>;
};


export type MarketGroupTypeMarketsArgs = {
  filter?: InputMaybe<MarketFilterInput>;
  orderBy?: InputMaybe<MarketOrderInput>;
};

export type MarketOrderInput = {
  direction: Scalars['String']['input'];
  field: Scalars['String']['input'];
};

export type MarketParamsType = {
  __typename?: 'MarketParamsType';
  assertionLiveness?: Maybe<Scalars['String']['output']>;
  bondAmount?: Maybe<Scalars['String']['output']>;
  bondCurrency?: Maybe<Scalars['String']['output']>;
  claimStatement?: Maybe<Scalars['String']['output']>;
  feeRate?: Maybe<Scalars['Int']['output']>;
  optimisticOracleV3?: Maybe<Scalars['String']['output']>;
  uniswapPositionManager?: Maybe<Scalars['String']['output']>;
  uniswapQuoter?: Maybe<Scalars['String']['output']>;
  uniswapSwapRouter?: Maybe<Scalars['String']['output']>;
};

export type MarketType = {
  __typename?: 'MarketType';
  baseAssetMaxPriceTick?: Maybe<Scalars['Int']['output']>;
  baseAssetMinPriceTick?: Maybe<Scalars['Int']['output']>;
  currentPrice?: Maybe<Scalars['String']['output']>;
  endTimestamp?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  marketGroup?: Maybe<MarketGroupType>;
  marketId: Scalars['Int']['output'];
  marketParams?: Maybe<MarketParamsType>;
  optionName?: Maybe<Scalars['String']['output']>;
  poolAddress?: Maybe<Scalars['String']['output']>;
  positions: Array<PositionType>;
  public: Scalars['Boolean']['output'];
  question?: Maybe<Scalars['String']['output']>;
  rules?: Maybe<Scalars['String']['output']>;
  settled?: Maybe<Scalars['Boolean']['output']>;
  settlementPriceD18?: Maybe<Scalars['String']['output']>;
  startTimestamp?: Maybe<Scalars['Int']['output']>;
  startingSqrtPriceX96?: Maybe<Scalars['String']['output']>;
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

export type PositionType = {
  __typename?: 'PositionType';
  baseToken: Scalars['String']['output'];
  borrowedBaseToken?: Maybe<Scalars['String']['output']>;
  borrowedQuoteToken?: Maybe<Scalars['String']['output']>;
  collateral: Scalars['String']['output'];
  highPriceTick?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isLP: Scalars['Boolean']['output'];
  isSettled?: Maybe<Scalars['Boolean']['output']>;
  lowPriceTick?: Maybe<Scalars['String']['output']>;
  lpBaseToken?: Maybe<Scalars['String']['output']>;
  lpQuoteToken?: Maybe<Scalars['String']['output']>;
  market: MarketType;
  owner: Scalars['String']['output'];
  positionId: Scalars['Int']['output'];
  quoteToken: Scalars['String']['output'];
  transactions: Array<TransactionType>;
};

export type Query = {
  __typename?: 'Query';
  categories: Array<CategoryType>;
  getMarketLeaderboard: Array<PnLType>;
  indexCandlesFromCache: CandleAndTimestampType;
  indexPriceAtTime?: Maybe<CandleType>;
  legacyMarketCandles: Array<CandleType>;
  marketCandlesFromCache: CandleAndTimestampType;
  marketGroup?: Maybe<MarketGroupType>;
  marketGroups: Array<MarketGroupType>;
  marketGroupsByCategory: Array<MarketGroupType>;
  markets: Array<MarketType>;
  positions: Array<PositionType>;
  resource?: Maybe<ResourceType>;
  resourceCandlesFromCache: CandleAndTimestampType;
  resourcePrices: Array<ResourcePriceType>;
  resourceTrailingAverageCandlesFromCache: CandleAndTimestampType;
  resources: Array<ResourceType>;
  totalVolumeByMarket: Scalars['Float']['output'];
  transactions: Array<TransactionType>;
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

export type ResourcePriceType = {
  __typename?: 'ResourcePriceType';
  blockNumber: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  resource?: Maybe<ResourceType>;
  timestamp: Scalars['Int']['output'];
  value: Scalars['String']['output'];
};

export type ResourceType = {
  __typename?: 'ResourceType';
  category?: Maybe<CategoryType>;
  id: Scalars['ID']['output'];
  marketGroups: Array<MarketGroupType>;
  name: Scalars['String']['output'];
  resourcePrices: Array<ResourcePriceType>;
  slug: Scalars['String']['output'];
};

export type TransactionType = {
  __typename?: 'TransactionType';
  baseToken?: Maybe<Scalars['String']['output']>;
  baseTokenDelta?: Maybe<Scalars['String']['output']>;
  collateral?: Maybe<Scalars['String']['output']>;
  collateralDelta?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lpBaseDeltaToken?: Maybe<Scalars['String']['output']>;
  lpQuoteDeltaToken?: Maybe<Scalars['String']['output']>;
  position?: Maybe<PositionType>;
  quoteToken?: Maybe<Scalars['String']['output']>;
  quoteTokenDelta?: Maybe<Scalars['String']['output']>;
  timestamp: Scalars['Int']['output'];
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
  CategoryType: ResolverTypeWrapper<Category>;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  MarketFilterInput: MarketFilterInput;
  MarketGroupType: ResolverTypeWrapper<MarketGroup>;
  MarketOrderInput: MarketOrderInput;
  MarketParamsType: ResolverTypeWrapper<MarketParamsType>;
  MarketType: ResolverTypeWrapper<Market>;
  PnLType: ResolverTypeWrapper<PnLType>;
  PositionType: ResolverTypeWrapper<Position>;
  Query: ResolverTypeWrapper<{}>;
  ResourcePriceType: ResolverTypeWrapper<ResourcePrice>;
  ResourceType: ResolverTypeWrapper<Resource>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  TransactionType: ResolverTypeWrapper<Transaction>;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Boolean: Scalars['Boolean']['output'];
  CandleAndTimestampType: CandleAndTimestampType;
  CandleType: CandleType;
  CategoryType: Category;
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  MarketFilterInput: MarketFilterInput;
  MarketGroupType: MarketGroup;
  MarketOrderInput: MarketOrderInput;
  MarketParamsType: MarketParamsType;
  MarketType: Market;
  PnLType: PnLType;
  PositionType: Position;
  Query: {};
  ResourcePriceType: ResourcePrice;
  ResourceType: Resource;
  String: Scalars['String']['output'];
  TransactionType: Transaction;
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

export type CategoryTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['CategoryType'] = ResolversParentTypes['CategoryType']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  marketGroups?: Resolver<Array<ResolversTypes['MarketGroupType']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

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
  marketGroup?: Resolver<Maybe<ResolversTypes['MarketGroupType']>, ParentType, ContextType>;
  marketId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  marketParams?: Resolver<Maybe<ResolversTypes['MarketParamsType']>, ParentType, ContextType>;
  optionName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  poolAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  positions?: Resolver<Array<ResolversTypes['PositionType']>, ParentType, ContextType>;
  public?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  question?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rules?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  settled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  settlementPriceD18?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  startTimestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  startingSqrtPriceX96?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
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
  market?: Resolver<ResolversTypes['MarketType'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  positionId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  quoteToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ResourceTypeResolvers<ContextType = ApolloContext, ParentType extends ResolversParentTypes['ResourceType'] = ResolversParentTypes['ResourceType']> = ResolversObject<{
  category?: Resolver<Maybe<ResolversTypes['CategoryType']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  marketGroups?: Resolver<Array<ResolversTypes['MarketGroupType']>, ParentType, ContextType>;
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
  lpBaseDeltaToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lpQuoteDeltaToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  position?: Resolver<Maybe<ResolversTypes['PositionType']>, ParentType, ContextType>;
  quoteToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quoteTokenDelta?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tradeRatioD18?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  transactionHash?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resolvers<ContextType = ApolloContext> = ResolversObject<{
  CandleAndTimestampType?: CandleAndTimestampTypeResolvers<ContextType>;
  CandleType?: CandleTypeResolvers<ContextType>;
  CategoryType?: CategoryTypeResolvers<ContextType>;
  MarketGroupType?: MarketGroupTypeResolvers<ContextType>;
  MarketParamsType?: MarketParamsTypeResolvers<ContextType>;
  MarketType?: MarketTypeResolvers<ContextType>;
  PnLType?: PnLTypeResolvers<ContextType>;
  PositionType?: PositionTypeResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  ResourcePriceType?: ResourcePriceTypeResolvers<ContextType>;
  ResourceType?: ResourceTypeResolvers<ContextType>;
  TransactionType?: TransactionTypeResolvers<ContextType>;
}>;

