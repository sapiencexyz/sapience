import { Field, ObjectType, ID, Int, Directive } from 'type-graphql';
import { PositionType } from './PositionType';

@Directive('@cacheControl(maxAge: 300)')
@ObjectType()
export class TransactionType {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  type: string;

  @Field(() => Int)
  timestamp: number;

  @Field(() => String, { nullable: true })
  transactionHash: string | null;

  @Field(() => PositionType, { nullable: true })
  position: PositionType | null;

  @Field(() => String, { nullable: true })
  baseToken: string | null;

  @Field(() => String, { nullable: true })
  quoteToken: string | null;

  @Field(() => String, { nullable: true })
  collateral: string | null;

  @Field(() => String, { nullable: true })
  lpBaseDeltaToken: string | null;

  @Field(() => String, { nullable: true })
  lpQuoteDeltaToken: string | null;

  @Field(() => String, { nullable: true })
  baseTokenDelta: string | null;

  @Field(() => String, { nullable: true })
  quoteTokenDelta: string | null;

  @Field(() => String, { nullable: true })
  collateralDelta: string | null;

  @Field(() => String, { nullable: true })
  tradeRatioD18: string | null;
}
