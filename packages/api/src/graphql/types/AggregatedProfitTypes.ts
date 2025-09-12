import { Field, Int, Float, ObjectType, Directive } from 'type-graphql';

@Directive('@cacheControl(maxAge: 60)')
@ObjectType()
export class AggregatedProfitEntryType {
  @Field(() => String)
  owner!: string;

  // Total realized profit in USD-equivalent (assumes $1 per token)
  @Field(() => Float)
  totalPnL!: number;
}

@Directive('@cacheControl(maxAge: 60)')
@ObjectType()
export class ProfitRankType {
  @Field(() => String)
  owner!: string;

  // Total realized profit in USD-equivalent (assumes $1 per token)
  @Field(() => Float)
  totalPnL!: number;

  // 1-based rank in the global leaderboard; null if not ranked (e.g., zero activity)
  @Field(() => Int, { nullable: true })
  rank!: number | null;

  // Number of distinct participants in the aggregated leaderboard
  @Field(() => Int)
  totalParticipants!: number;
}

