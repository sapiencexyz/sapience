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
  indexCandles: Array<CandleType>;
  indexCandlesFromCache: CandleAndTimestampType;
  indexPriceAtTime?: Maybe<CandleType>;
  legacyMarketCandles: Array<CandleType>;
  marketCandles: Array<CandleType>;
  marketCandlesFromCache: CandleAndTimestampType;
  marketGroup?: Maybe<MarketGroupType>;
  marketGroups: Array<MarketGroupType>;
  marketGroupsByCategory: Array<MarketGroupType>;
  markets: Array<MarketType>;
  positions: Array<PositionType>;
  resource?: Maybe<ResourceType>;
  resourceCandles: Array<CandleType>;
  resourceCandlesFromCache: CandleAndTimestampType;
  resourcePrices: Array<ResourcePriceType>;
  resourceTrailingAverageCandles: Array<CandleType>;
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


export type QueryIndexCandlesArgs = {
  address: Scalars['String']['input'];
  chainId: Scalars['Int']['input'];
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  marketId: Scalars['String']['input'];
  to: Scalars['Int']['input'];
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


export type QueryMarketCandlesArgs = {
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


export type QueryResourceCandlesArgs = {
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  slug: Scalars['String']['input'];
  to: Scalars['Int']['input'];
};


export type QueryResourceCandlesFromCacheArgs = {
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  slug: Scalars['String']['input'];
  to: Scalars['Int']['input'];
};


export type QueryResourceTrailingAverageCandlesArgs = {
  from: Scalars['Int']['input'];
  interval: Scalars['Int']['input'];
  slug: Scalars['String']['input'];
  to: Scalars['Int']['input'];
  trailingAvgTime: Scalars['Int']['input'];
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
