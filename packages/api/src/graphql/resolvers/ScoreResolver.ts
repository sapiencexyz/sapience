import {
  Resolver,
  Query,
  Arg,
  Int,
  ObjectType,
  Field,
  Float,
  Directive,
} from 'type-graphql';
import prisma from '../../db';
import { TtlCache } from '../../utils/ttlCache';

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
  // Keep a small TTL cache to protect DB on bursts
  private static accuracyCache = new TtlCache<string, number>({
    ttlMs: 60_000,
    maxSize: 5000,
  });

  @Query(() => ForecasterScoreType, { nullable: true })
  @Directive('@cacheControl(maxAge: 60)')
  async forecasterScore(
    @Arg('attester', () => String) attester: string
  ): Promise<ForecasterScoreType | null> {
    const a = attester.toLowerCase();

    // Aggregate TW error across markets for this attester
    const rows = await prisma.attesterMarketTwError.findMany({
      where: { attester: a },
      select: { twError: true },
    });
    if (rows.length === 0) return null;

    const numTimeWeighted = rows.length;
    const sumTimeWeightedError = rows.reduce(
      (acc, r) => acc + (r.twError || 0),
      0
    );
    const mean = sumTimeWeightedError / numTimeWeighted;
    const accuracyScore = mean > 0 ? 1 / mean : 0;

    // Legacy fields retained for schema compatibility
    return {
      attester: a,
      numScored: 0,
      sumErrorSquared: 0,
      numTimeWeighted,
      sumTimeWeightedError,
      accuracyScore,
    };
  }

  @Query(() => [ForecasterScoreType])
  @Directive('@cacheControl(maxAge: 60)')
  async topForecasters(
    @Arg('limit', () => Int, { defaultValue: 10 }) limit: number
  ): Promise<ForecasterScoreType[]> {
    const capped = Math.max(1, Math.min(limit, 100));

    // Compute 1/avg(tw_error) using SQL aggregation
    const agg = await prisma.attesterMarketTwError.groupBy({
      by: ['attester'],
      _avg: { twError: true },
    });

    const results = agg.map((row) => {
      const mean = (row._avg.twError as number | null) ?? null;
      const score = mean && mean > 0 ? 1 / mean : 0;
      return {
        attester: (row.attester as string).toLowerCase(),
        numScored: 0,
        sumErrorSquared: 0,
        numTimeWeighted: 0,
        sumTimeWeightedError: 0,
        accuracyScore: score,
      } as ForecasterScoreType;
    });

    results.sort((a, b) => b.accuracyScore - a.accuracyScore);
    return results.slice(0, capped);
  }

  @Query(() => AccuracyRankType)
  @Directive('@cacheControl(maxAge: 60)')
  async accuracyRankByAddress(
    @Arg('attester', () => String) attester: string
  ): Promise<AccuracyRankType> {
    const target = attester.toLowerCase();

    const agg = await prisma.attesterMarketTwError.groupBy({
      by: ['attester'],
      _avg: { twError: true },
    });

    const scores = agg.map((row) => {
      const mean = (row._avg.twError as number | null) ?? null;
      const accuracyScore = mean && mean > 0 ? 1 / mean : 0;
      return {
        attester: (row.attester as string).toLowerCase(),
        accuracyScore,
      };
    });

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
