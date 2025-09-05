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

  @Field(() => Int)
  numTimeWeighted!: number;

  @Field(() => Float)
  sumTimeWeightedError!: number;

  // Higher is better. Defined as 1 / (horizon-weighted mean error),
  // falling back to 1 / (mean error) when horizon weighting is unavailable.
  @Field(() => Float)
  accuracyScore!: number;
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
    const meanError = numScored > 0 ? sumErrorSquared / numScored : null;

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
    // Prefer horizon-weighted mean error when available
    const horizonWeightedMeanError =
      numTimeWeighted > 0 ? sumTimeWeightedError / numTimeWeighted : meanError;

    const accuracyScore =
      horizonWeightedMeanError && horizonWeightedMeanError > 0
        ? 1 / horizonWeightedMeanError
        : 0;

    return {
      attester: a,
      numScored,
      sumErrorSquared,
      numTimeWeighted,
      sumTimeWeightedError,
      accuracyScore,
    };
  }

  @Query(() => [ForecasterScoreType])
  async topForecasters(
    @Arg('limit', () => Int, { defaultValue: 10 }) limit: number
  ): Promise<ForecasterScoreType[]> {
    const capped = Math.max(1, Math.min(limit, 100));

    // Base aggregation to compute mean error as a fallback
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
      const meanError = numScored > 0 ? sumErrorSquared / numScored : null;

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
      const horizonWeightedMeanError =
        numTimeWeighted > 0
          ? sumTimeWeightedError / numTimeWeighted
          : meanError;

      const accuracyScore =
        horizonWeightedMeanError && horizonWeightedMeanError > 0
          ? 1 / horizonWeightedMeanError
          : 0;

      results.push({
        attester: a,
        numScored,
        sumErrorSquared,
        numTimeWeighted,
        sumTimeWeightedError,
        accuracyScore,
      });
    }

    // Order by accuracyScore desc (higher is better)
    results.sort((a, b) => b.accuracyScore - a.accuracyScore);
    return results.slice(0, capped);
  }
}
