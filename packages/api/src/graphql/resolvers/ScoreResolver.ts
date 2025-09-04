import {
  Resolver,
  Query,
  Arg,
  Int,
  ObjectType,
  Field,
  Float,
} from 'type-graphql';
import prisma from '../../db';
import { computeTimeWeightedForAttesterMarketValue } from '../../helpers/scoringService';

@ObjectType()
class ForecasterScoreType {
  @Field(() => String)
  attester!: string;

  @Field(() => Int)
  numScored!: number;

  @Field(() => Float)
  sumErrorSquared!: number;

  @Field(() => Float)
  meanBrier!: number;

  @Field(() => Int)
  numTimeWeighted!: number;

  @Field(() => Float)
  sumTimeWeightedError!: number;

  @Field(() => Float)
  timeWeightedMeanBrier!: number;
}

@Resolver()
export class ScoreResolver {
  @Query(() => ForecasterScoreType, { nullable: true })
  async forecasterScore(
    @Arg('attester', () => String) attester: string
  ): Promise<ForecasterScoreType | null> {
    const a = attester.toLowerCase();

    const agg = await prisma.attestationScore.groupBy({
      by: ['attester'],
      where: { attester: a, errorSquared: { not: null } },
      _count: { _all: true },
      _sum: { errorSquared: true },
    });
    if (agg.length === 0) return null;
    const numScored = agg[0]._count._all ?? 0;
    const sumErrorSquared = (agg[0]._sum.errorSquared as number | null) ?? 0;
    const meanBrier = numScored > 0 ? sumErrorSquared / numScored : 0;

    // Compute time-weighted across markets on the fly
    const markets = await prisma.attestationScore.findMany({
      where: { attester: a },
      distinct: ['marketAddress', 'marketId'],
      select: { marketAddress: true, marketId: true },
    });
    let sumTimeWeightedError = 0;
    let numTimeWeighted = 0;
    for (const m of markets) {
      const v = await computeTimeWeightedForAttesterMarketValue(
        m.marketAddress,
        m.marketId,
        a
      );
      if (v != null) {
        sumTimeWeightedError += v;
        numTimeWeighted += 1;
      }
    }
    const timeWeightedMeanBrier =
      numTimeWeighted > 0 ? sumTimeWeightedError / numTimeWeighted : meanBrier;

    return {
      attester: a,
      numScored,
      sumErrorSquared,
      meanBrier,
      numTimeWeighted,
      sumTimeWeightedError,
      timeWeightedMeanBrier,
    };
  }

  @Query(() => [ForecasterScoreType])
  async topForecasters(
    @Arg('limit', () => Int, { defaultValue: 10 }) limit: number
  ): Promise<ForecasterScoreType[]> {
    const capped = Math.max(1, Math.min(limit, 100));

    // Base aggregation order by meanBrier (simple) as a fallback
    const agg = await prisma.attestationScore.groupBy({
      by: ['attester'],
      where: { errorSquared: { not: null } },
      _count: { _all: true },
      _sum: { errorSquared: true },
    });

    // Compute time-weighted across markets per attester
    const results: ForecasterScoreType[] = [];
    for (const row of agg) {
      const a = row.attester as string;
      const numScored = row._count._all ?? 0;
      const sumErrorSquared = (row._sum.errorSquared as number | null) ?? 0;
      const meanBrier = numScored > 0 ? sumErrorSquared / numScored : 0;

      const markets = await prisma.attestationScore.findMany({
        where: { attester: a },
        distinct: ['marketAddress', 'marketId'],
        select: { marketAddress: true, marketId: true },
      });
      let sumTimeWeightedError = 0;
      let numTimeWeighted = 0;
      for (const m of markets) {
        const v = await computeTimeWeightedForAttesterMarketValue(
          m.marketAddress,
          m.marketId,
          a
        );
        if (v != null) {
          sumTimeWeightedError += v;
          numTimeWeighted += 1;
        }
      }
      const timeWeightedMeanBrier =
        numTimeWeighted > 0
          ? sumTimeWeightedError / numTimeWeighted
          : meanBrier;

      results.push({
        attester: a,
        numScored,
        sumErrorSquared,
        meanBrier,
        numTimeWeighted,
        sumTimeWeightedError,
        timeWeightedMeanBrier,
      });
    }

    // Order by timeWeightedMeanBrier asc
    results.sort((a, b) => a.timeWeightedMeanBrier - b.timeWeightedMeanBrier);
    return results.slice(0, capped);
  }
}
