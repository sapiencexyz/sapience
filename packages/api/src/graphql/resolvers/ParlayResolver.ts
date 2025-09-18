import { Resolver, Query, Arg, Int, ObjectType, Field } from 'type-graphql';
import prisma from '../../db';

@ObjectType()
class ConditionSummary {
  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  question?: string | null;

  @Field(() => Int, { nullable: true })
  endTime?: number | null;
}

@ObjectType()
class PredictedOutcomeType {
  @Field(() => String)
  conditionId!: string;

  @Field(() => Boolean)
  prediction!: boolean;

  @Field(() => ConditionSummary, { nullable: true })
  condition?: ConditionSummary | null;
}

@ObjectType()
class ParlayType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  marketAddress!: string;

  @Field(() => String)
  maker!: string;

  @Field(() => String)
  taker!: string;

  @Field(() => String)
  makerNftTokenId!: string;

  @Field(() => String)
  takerNftTokenId!: string;

  @Field(() => String)
  totalCollateral!: string;

  @Field(() => String, { nullable: true })
  refCode?: string | null;

  @Field(() => String)
  status!: 'active' | 'settled' | 'consolidated';

  @Field(() => Boolean, { nullable: true })
  makerWon?: boolean | null;

  @Field(() => Int)
  mintedAt!: number;

  @Field(() => Int, { nullable: true })
  settledAt?: number | null;

  @Field(() => Int, { nullable: true })
  endsAt?: number | null;

  @Field(() => [PredictedOutcomeType])
  predictedOutcomes!: PredictedOutcomeType[];
}

@Resolver()
export class ParlayResolver {
  @Query(() => [ParlayType])
  async userParlays(
    @Arg('address', () => String) address: string,
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number
  ): Promise<ParlayType[]> {
    const addr = address.toLowerCase();
    const rows = await prisma.parlay.findMany({
      where: { OR: [{ maker: addr }, { taker: addr }] },
      orderBy: { mintedAt: 'desc' },
      take,
      skip,
    });

    // Collect condition ids
    const conditionSet = new Set<string>();
    for (const r of rows) {
      const outcomes =
        (r.predictedOutcomes as unknown as { conditionId: string }[]) || [];
      for (const o of outcomes) conditionSet.add(o.conditionId);
    }
    const conditionIds = Array.from(conditionSet);
    const conditions = conditionIds.length
      ? await prisma.condition.findMany({
          where: { id: { in: conditionIds } },
          select: { id: true, question: true, endTime: true },
        })
      : [];
    const condMap = new Map(conditions.map((c) => [c.id, c]));

    return rows.map((r) => {
      const outcomesRaw =
        (r.predictedOutcomes as unknown as {
          conditionId: string;
          prediction: boolean;
        }[]) || [];
      const outcomes: PredictedOutcomeType[] = outcomesRaw.map((o) => ({
        conditionId: o.conditionId,
        prediction: o.prediction,
        condition: condMap.get(o.conditionId) || null,
      }));
      return {
        id: r.id,
        chainId: r.chainId,
        marketAddress: r.marketAddress,
        maker: r.maker,
        taker: r.taker,
        makerNftTokenId: r.makerNftTokenId,
        takerNftTokenId: r.takerNftTokenId,
        totalCollateral: r.totalCollateral,
        refCode: r.refCode,
        status: r.status as unknown as ParlayType['status'],
        makerWon: r.makerWon,
        mintedAt: r.mintedAt,
        settledAt: r.settledAt ?? null,
        endsAt: r.endsAt ?? null,
        predictedOutcomes: outcomes,
      };
    });
  }
}
