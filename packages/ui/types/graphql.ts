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


export type MarketGroupMarketsArgs = {
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
