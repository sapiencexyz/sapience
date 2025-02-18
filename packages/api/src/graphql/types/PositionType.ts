import { Field, ObjectType, ID, Int, Directive } from 'type-graphql';
import { EpochType } from './EpochType';
import { TransactionType } from './TransactionType';

@Directive('@cacheControl(maxAge: 300)')
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

  @Field(() => String, { nullable: true })
  lowPriceTick: string | null;

  @Field(() => String, { nullable: true })
  highPriceTick: string | null;
}
