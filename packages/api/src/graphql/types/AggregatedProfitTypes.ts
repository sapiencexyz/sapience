import { Field, Int, ObjectType, Directive } from 'type-graphql';

@Directive('@cacheControl(maxAge: 60)')
@ObjectType('ProfitEntry', {
  description:
    'Aggregated profit/loss entry for a single address across all positions',
})
export class AggregatedProfitEntryType {
  @Field(() => String)
  address!: string;

  @Field(() => String)
  totalPnL!: string;
}

@Directive('@cacheControl(maxAge: 60)')
@ObjectType('ProfitRank', {
  description: 'Profit rank and total PnL for an address on the leaderboard',
})
export class ProfitRankType {
  @Field(() => String)
  address!: string;

  @Field(() => String)
  totalPnL!: string;

  // 1-based rank in the global leaderboard; null if not ranked (e.g., zero activity)
  @Field(() => Int, { nullable: true })
  rank!: number | null;

  // Number of distinct participants in the aggregated leaderboard
  @Field(() => Int)
  totalParticipants!: number;
}
