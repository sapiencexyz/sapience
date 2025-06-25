import { Field, ObjectType, ID, Int, Directive } from 'type-graphql';
import { MarketGroupType } from './MarketGroupType';
import { PositionType } from './PositionType';

@Directive('@cacheControl(maxAge: 300)')
@ObjectType()
export class MarketType {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  marketId: number;

  @Field(() => Int, { nullable: true })
  startTimestamp: number | null;

  @Field(() => Int, { nullable: true })
  endTimestamp: number | null;

  @Field(() => MarketGroupType, { nullable: true })
  marketGroup: MarketGroupType | null;

  @Field(() => [PositionType])
  positions: PositionType[];

  @Directive('@cacheControl(maxAge: 60)')
  @Field(() => Boolean, { nullable: true })
  settled: boolean | null;

  @Directive('@cacheControl(maxAge: 60)')
  @Field(() => String, { nullable: true })
  settlementPriceD18: string | null;

  @Field(() => String, { nullable: true })
  poolAddress: string | null;

  @Field(() => String, { nullable: true })
  startingSqrtPriceX96: string | null;

  @Field(() => Int, { nullable: true })
  marketParamsFeerate: number | null;

  @Field(() => String, { nullable: true })
  marketParamsAssertionliveness: string | null;

  @Field(() => String, { nullable: true })
  marketParamsBondcurrency: string | null;

  @Field(() => String, { nullable: true })
  marketParamsBondamount: string | null;

  @Field(() => String, { nullable: true })
  marketParamsClaimstatement: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswappositionmanager: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswapswaprouter: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswapquoter: string | null;

  @Field(() => String, { nullable: true })
  marketParamsOptimisticoraclev3: string | null;

  @Field(() => Boolean)
  public: boolean;

  @Field(() => String, { nullable: true })
  question: string | null;

  @Field(() => String, { nullable: true })
  rules: string | null;

  @Field(() => Int, { nullable: true })
  baseAssetMinPriceTick: number | null;

  @Field(() => Int, { nullable: true })
  baseAssetMaxPriceTick: number | null;

  @Field(() => String, { nullable: true })
  optionName: string | null;

  @Field(() => String, { nullable: true })
  currentPrice: string | null;
}
