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
import { computeTimeWeightedForAttesterSummary } from '../../helpers/scoringService';

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

@ObjectType()
class AccuracyRankType {
  @Field(() => String)
  attester!: string;

  @Field(() => Float)
  accuracyScore!: number;

  @Field(() => Int, { nullable: true })
  rank!: number | null;

  @Field(() => Int)
  totalForecasters!: number;
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

    // Compute time-weighted across markets using batched summary
    const { sumTimeWeightedError, numTimeWeighted } =
      await computeTimeWeightedForAttesterSummary(a);
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

    // Compute time-weighted across markets per attester with bounded concurrency
    const results: ForecasterScoreType[] = [];
    const attesters = agg.map((row) => row.attester as string);
    const concurrency = 10;
    for (let i = 0; i < attesters.length; i += concurrency) {
      const batch = attesters.slice(i, i + concurrency);
      const batchAgg = agg.slice(i, i + concurrency);
      const summaries = await Promise.all(
        batch.map((a) => computeTimeWeightedForAttesterSummary(a))
      );
      for (let j = 0; j < batch.length; j++) {
        const a = batch[j];
        const row = batchAgg[j];
        const numScored = row._count._all ?? 0;
        const sumErrorSquared = (row._sum.errorSquared as number | null) ?? 0;
        const meanError = numScored > 0 ? sumErrorSquared / numScored : null;
        const { sumTimeWeightedError, numTimeWeighted } = summaries[j];
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
    }

    // Order by accuracyScore desc (higher is better)
    results.sort((a, b) => b.accuracyScore - a.accuracyScore);
    return results.slice(0, capped);
  }

  @Query(() => AccuracyRankType)
  async accuracyRankByAddress(
    @Arg('attester', () => String) attester: string
  ): Promise<AccuracyRankType> {
    const target = attester.toLowerCase();

    // Base aggregation for all attesters with scored entries
    const agg = await prisma.attestationScore.groupBy({
      by: ['attester'],
      where: { errorSquared: { not: null } },
      _count: { _all: true },
      _sum: { errorSquared: true },
    });

    // Compute horizon-weighted accuracy for each attester
    type Scored = { attester: string; accuracyScore: number };
    const scores: Scored[] = [];
    const attesters = agg.map((row) => (row.attester as string).toLowerCase());
    const concurrency = 10;
    for (let i = 0; i < attesters.length; i += concurrency) {
      const batch = attesters.slice(i, i + concurrency);
      const batchAgg = agg.slice(i, i + concurrency);
      const summaries = await Promise.all(
        batch.map((a) => computeTimeWeightedForAttesterSummary(a))
      );
      for (let j = 0; j < batch.length; j++) {
        const a = batch[j];
        const row = batchAgg[j];
        const numScored = row._count._all ?? 0;
        const sumErrorSquared = (row._sum.errorSquared as number | null) ?? 0;
        const meanError = numScored > 0 ? sumErrorSquared / numScored : null;
        const { sumTimeWeightedError, numTimeWeighted } = summaries[j];
        const horizonWeightedMeanError =
          numTimeWeighted > 0
            ? sumTimeWeightedError / numTimeWeighted
            : meanError;
        const accuracyScore =
          horizonWeightedMeanError && horizonWeightedMeanError > 0
            ? 1 / horizonWeightedMeanError
            : 0;
        scores.push({ attester: a, accuracyScore });
      }
    }

    // Sort desc and compute rank
    scores.sort((x, y) => y.accuracyScore - x.accuracyScore);
    const totalForecasters = scores.length;
    const idx = scores.findIndex((s) => s.attester === target);
    const rank = idx >= 0 ? idx + 1 : null;
    const accuracyScore = idx >= 0 ? scores[idx].accuracyScore : 0;

    return {
      attester: target,
      accuracyScore,
      rank,
      totalForecasters,
    } as AccuracyRankType;
  }
}
