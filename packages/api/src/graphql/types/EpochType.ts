import { Field, ObjectType, ID, Int } from 'type-graphql';
import { MarketType } from './MarketType';
import { PositionType } from './PositionType';
import { IndexPriceType } from './IndexPriceType';

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