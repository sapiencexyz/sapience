import { ObjectType, Field, ID, Int } from 'type-graphql';
// TypeGraphQL ObjectTypes that mirror Prisma models but with GraphQL-friendly types

@ObjectType()
export class MarketGroup {
  @Field(() => ID)
  id: number;

  @Field(() => String, { nullable: true })
  address?: string | null;

  @Field(() => String, { nullable: true })
  vaultAddress?: string | null;

  @Field(() => Int)
  chainId: number;

  @Field(() => Boolean)
  isYin: boolean;

  @Field(() => Boolean)
  isCumulative: boolean;

  @Field(() => [Market], { nullable: true })
  markets?: Market[];

  @Field(() => Resource, { nullable: true })
  resource?: Resource | null;

  @Field(() => Category, { nullable: true })
  category?: Category | null;

  @Field(() => Int, { nullable: true })
  deployTimestamp?: number | null;

  @Field(() => Int, { nullable: true })
  deployTxnBlockNumber?: number | null;

  @Field(() => String, { nullable: true })
  owner?: string | null;

  @Field(() => String, { nullable: true })
  collateralAsset?: string | null;

  @Field(() => String, { nullable: true })
  collateralSymbol?: string | null;

  @Field(() => Int, { nullable: true })
  collateralDecimals?: number | null;

  @Field(() => String, { nullable: true })
  minTradeSize?: string | null;

  @Field(() => String, { nullable: true })
  factoryAddress?: string | null;

  @Field(() => String, { nullable: true })
  initializationNonce?: string | null;

  @Field(() => String, { nullable: true })
  question?: string | null;

  @Field(() => String, { nullable: true })
  baseTokenName?: string | null;

  @Field(() => String, { nullable: true })
  quoteTokenName?: string | null;

  @Field(() => Int, { nullable: true })
  marketParamsFeerate?: number | null;

  @Field(() => String, { nullable: true })
  marketParamsAssertionliveness?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsBondcurrency?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsBondamount?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsClaimstatement?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswappositionmanager?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswapswaprouter?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswapquoter?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsOptimisticoraclev3?: string | null;
}

@ObjectType()
export class Resource {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => String)
  slug: string;

  @Field(() => Category, { nullable: true })
  category?: Category | null;

  @Field(() => [MarketGroup], { nullable: true })
  marketGroups?: MarketGroup[];

  @Field(() => [ResourcePrice], { nullable: true })
  resourcePrices?: ResourcePrice[];
}

@ObjectType()
export class Category {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => String)
  slug: string;

  @Field(() => [MarketGroup], { nullable: true })
  marketGroups?: MarketGroup[];
}

@ObjectType()
export class Market {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  marketId: number;

  @Field(() => Int, { nullable: true })
  startTimestamp?: number | null;

  @Field(() => Int, { nullable: true })
  endTimestamp?: number | null;

  @Field(() => MarketGroup, { nullable: true })
  marketGroup?: MarketGroup | null;

  @Field(() => [Position], { nullable: true })
  positions?: Position[];

  @Field(() => Boolean, { nullable: true })
  settled?: boolean | null;

  @Field(() => String, { nullable: true })
  settlementPriceD18?: string | null;

  @Field(() => Boolean)
  public: boolean;

  @Field(() => String, { nullable: true })
  question?: string | null;

  @Field(() => Int, { nullable: true })
  baseAssetMinPriceTick?: number | null;

  @Field(() => Int, { nullable: true })
  baseAssetMaxPriceTick?: number | null;

  @Field(() => String, { nullable: true })
  poolAddress?: string | null;

  @Field(() => String, { nullable: true })
  optionName?: string | null;

  @Field(() => String, { nullable: true })
  startingSqrtPriceX96?: string | null;

  @Field(() => String, { nullable: true })
  rules?: string | null;

  @Field(() => Int, { nullable: true })
  marketParamsFeerate?: number | null;

  @Field(() => String, { nullable: true })
  marketParamsAssertionliveness?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsBondcurrency?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsBondamount?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsClaimstatement?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswappositionmanager?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswapswaprouter?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswapquoter?: string | null;

  @Field(() => String, { nullable: true })
  marketParamsOptimisticoraclev3?: string | null;
}

@ObjectType()
export class Position {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  positionId: number;

  @Field(() => String, { nullable: true })
  owner?: string | null;

  @Field(() => Boolean)
  isLP: boolean;

  @Field(() => String, { nullable: true })
  baseToken?: string | null;

  @Field(() => String, { nullable: true })
  quoteToken?: string | null;

  @Field(() => String, { nullable: true })
  collateral?: string | null;

  @Field(() => Market, { nullable: true })
  market?: Market | null;

  @Field(() => [Transaction], { nullable: true })
  transactions?: Transaction[];

  @Field(() => String, { nullable: true })
  borrowedBaseToken?: string | null;

  @Field(() => String, { nullable: true })
  borrowedQuoteToken?: string | null;

  @Field(() => String, { nullable: true })
  lpBaseToken?: string | null;

  @Field(() => String, { nullable: true })
  lpQuoteToken?: string | null;

  @Field(() => Boolean, { nullable: true })
  isSettled?: boolean | null;

  @Field(() => String, { nullable: true })
  lowPriceTick?: string | null;

  @Field(() => String, { nullable: true })
  highPriceTick?: string | null;
}

@ObjectType()
export class Transaction {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  type: string;

  @Field(() => Int, { nullable: true })
  timestamp?: number | null;

  @Field(() => String, { nullable: true })
  transactionHash?: string | null;

  @Field(() => Position, { nullable: true })
  position?: Position | null;

  @Field(() => String, { nullable: true })
  baseToken?: string | null;

  @Field(() => String, { nullable: true })
  quoteToken?: string | null;

  @Field(() => String, { nullable: true })
  collateral?: string | null;

  @Field(() => String, { nullable: true })
  lpBaseDeltaToken?: string | null;

  @Field(() => String, { nullable: true })
  lpQuoteDeltaToken?: string | null;

  @Field(() => String, { nullable: true })
  tradeRatioD18?: string | null;
}

@ObjectType()
export class ResourcePrice {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  timestamp: number;

  @Field(() => String)
  value: string;

  @Field(() => Resource, { nullable: true })
  resource?: Resource | null;

  @Field(() => Int)
  blockNumber: number;
}
