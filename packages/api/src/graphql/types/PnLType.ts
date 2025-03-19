import { Field, ObjectType, Int, Directive } from 'type-graphql';

@Directive('@cacheControl(maxAge: 300)')
@ObjectType()
export class PnLType {
  @Field(() => Int)
  epochId: number;

  @Field(() => Int)
  timestamp: number;

  @Field(() => String)
  owner: string;

  @Field(() => Int)
  totalDeposits: number;

  @Field(() => Int)
  totalWithdrawals: number;
  
  @Field(() => Int)
  openPositionsPnL: number;

  @Field(() => Int)
  totalPnL: number;

  @Field(() => [Int])
  positions: number;
}
