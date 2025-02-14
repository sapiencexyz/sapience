import { Field, ObjectType, ID, Int } from 'type-graphql';
import { MarketType } from './MarketType';
import { PositionType } from './PositionType';

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

  @Field(() => MarketType, { nullable: true })
  market: MarketType | null;

  @Field(() => [PositionType])
  positions: PositionType[];

  @Field(() => Boolean, { nullable: true })
  settled: boolean | null;

  @Field(() => String, { nullable: true })
  settlementPriceD18: string | null;
}
