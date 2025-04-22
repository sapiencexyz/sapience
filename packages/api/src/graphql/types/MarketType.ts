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

  @Field(() => Boolean)
  public: boolean;

  @Field(() => String, { nullable: true })
  question: string | null;
}
