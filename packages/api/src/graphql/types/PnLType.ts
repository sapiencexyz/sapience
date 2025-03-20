import { Field, ObjectType, Int, Directive } from 'type-graphql';

@Directive('@cacheControl(maxAge: 300)')
@ObjectType()
export class PnLType {
  @Field(() => Int)
  epochId: number;

  @Field(() => String)
  owner: string;

  @Field(() => String)
  totalDeposits: string;

  @Field(() => String)
  totalWithdrawals: string;

  @Field(() => String)
  openPositionsPnL: string;

  @Field(() => String)
  totalPnL: string;

  @Field(() => [Int])
  positions: number[];
}
