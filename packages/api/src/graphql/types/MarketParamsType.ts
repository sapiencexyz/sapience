import { Field, ObjectType, Int } from 'type-graphql';

@ObjectType()
export class MarketParamsType {
  @Field(() => Int, { nullable: true })
  feeRate: number | null;

  @Field(() => String, { nullable: true }) // Use String for large numbers
  assertionLiveness: string | null;

  @Field(() => String, { nullable: true })
  bondCurrency: string | null;

  @Field(() => String, { nullable: true }) // Use String for large numbers
  bondAmount: string | null;

  @Field(() => String, { nullable: true })
  claimStatement: string | null;

  @Field(() => String, { nullable: true })
  uniswapPositionManager: string | null;

  @Field(() => String, { nullable: true })
  uniswapSwapRouter: string | null;

  @Field(() => String, { nullable: true })
  uniswapQuoter: string | null;

  @Field(() => String, { nullable: true })
  optimisticOracleV3: string | null;
}
