import { Field, ObjectType, ID, Int, Directive } from 'type-graphql';
import { MarketType } from './MarketType';
import { PositionType } from './PositionType';

@Directive('@cacheControl(maxAge: 300)')
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

  @Directive('@cacheControl(maxAge: 60)')
  @Field(() => Boolean, { nullable: true })
  settled: boolean | null;

  @Directive('@cacheControl(maxAge: 60)')
  @Field(() => String, { nullable: true })
  settlementPriceD18: string | null;

  @Field(() => Boolean)
  public: boolean;
}
