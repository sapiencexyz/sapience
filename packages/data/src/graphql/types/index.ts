import { Field, ObjectType, ID, Int } from "type-graphql";

@ObjectType()
export class MarketType {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  address: string;

  @Field(() => Int)
  chainId: number;

  @Field(() => Boolean)
  public: boolean;

  @Field(() => [EpochType])
  epochs: EpochType[];

  @Field(() => ResourceType, { nullable: true })
  resource: ResourceType | null;

  @Field(() => Int, { nullable: true })
  deployTimestamp: number | null;

  @Field(() => Int, { nullable: true })
  deployTxnBlockNumber: number | null;

  @Field(() => String, { nullable: true })
  owner: string | null;

  @Field(() => String, { nullable: true })
  collateralAsset: string | null;
}

@ObjectType()
export class ResourceType {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => String)
  slug: string;

  @Field(() => [MarketType])
  markets: MarketType[];

  @Field(() => [ResourcePriceType])
  resourcePrices: ResourcePriceType[];
}

@ObjectType()
export class PositionType {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  positionId: number;

  @Field(() => String)
  owner: string;

  @Field(() => Boolean)
  isLP: boolean;

  @Field(() => String)
  baseToken: string;

  @Field(() => String)
  quoteToken: string;

  @Field(() => String)
  collateral: string;

  @Field(() => EpochType)
  epoch: EpochType;

  @Field(() => [TransactionType])
  transactions: TransactionType[];

  @Field(() => String, { nullable: true })
  borrowedBaseToken: string | null;

  @Field(() => String, { nullable: true })
  borrowedQuoteToken: string | null;

  @Field(() => String, { nullable: true })
  lpBaseToken: string | null;

  @Field(() => String, { nullable: true })
  lpQuoteToken: string | null;

  @Field(() => Boolean, { nullable: true })
  isSettled: boolean | null;
}

@ObjectType()
export class TransactionType {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  type: string;

  @Field(() => Int)
  timestamp: number;

  @Field(() => PositionType, { nullable: true })
  position: PositionType | null;

  @Field(() => String, { nullable: true })
  baseToken: string | null;

  @Field(() => String, { nullable: true })
  quoteToken: string | null;

  @Field(() => String, { nullable: true })
  collateral: string | null;
}

@ObjectType()
export class EpochType {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  epochId: number;

  @Field(() => Int, { nullable: true })
  startTimestamp: number | null;

  @Field(() => Int, { nullable: true })
  endTimestamp: number | null;

  @Field(() => MarketType)
  market: MarketType;

  @Field(() => [PositionType])
  positions: PositionType[];

  @Field(() => [IndexPriceType])
  indexPrices: IndexPriceType[];

  @Field(() => Boolean, { nullable: true })
  settled: boolean | null;

  @Field(() => String, { nullable: true })
  settlementPriceD18: string | null;
}

@ObjectType()
export class ResourcePriceType {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  timestamp: number;

  @Field(() => String)
  value: string;

  @Field(() => ResourceType, { nullable: true })
  resource: ResourceType | null;

  @Field(() => Int)
  blockNumber: number;
}

@ObjectType()
export class IndexPriceType {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  timestamp: number;

  @Field(() => String)
  value: string;

  @Field(() => EpochType, { nullable: true })
  epoch: EpochType | null;
}
