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

@ObjectType('ForecasterScore', {
  description:
    'Accuracy score for a forecaster, aggregated across all scored markets',
})
class ForecasterScoreType {
  @Field(() => String)
  address!: string;

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

@ObjectType('AccuracyRank', {
  description: 'Accuracy rank for an address on the forecasting leaderboard',
})
class AccuracyRankType {
  @Field(() => String)
  address!: string;

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

  // Cache for the full leaderboard aggregation (shared by accuracyLeaderboard + accountAccuracyRank)
  private static leaderboardCache = new TtlCache<
    string,
    { attester: string; accuracyScore: number }[]
  >({
    ttlMs: 60_000,
    maxSize: 1,
  });

  private static async getLeaderboardScores(): Promise<
    { attester: string; accuracyScore: number }[]
  > {
    const cached = ScoreResolver.leaderboardCache.get('leaderboard');
    if (cached) return cached;

    const agg = await prisma.attesterMarketTwError.groupBy({
      by: ['attester'],
      _avg: { twError: true },
    });

    const scores = agg
      .map((row) => ({
        attester: (row.attester as string).toLowerCase(),
        accuracyScore: (row._avg.twError as number | null) ?? 0,
      }))
      .sort((a, b) => b.accuracyScore - a.accuracyScore);

    ScoreResolver.leaderboardCache.set('leaderboard', scores);
    return scores;
  }

  @Query(() => ForecasterScoreType, {
    nullable: true,
    description:
      'Accuracy score for a single forecaster address, or null if no scored attestations exist',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async accountAccuracy(
    @Arg('address', () => String) address: string
  ): Promise<ForecasterScoreType | null> {
    const a = address.toLowerCase();

    // Aggregate accuracy scores across markets for this attester
    // twError now stores accuracy scores directly (higher is better)
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
    // twError now stores (1 - brierScore) * tau, so mean is the accuracy score
    const accuracyScore = sumTimeWeightedError / numTimeWeighted;

    return {
      address: a,
      numScored: 0,
      sumErrorSquared: 0,
      numTimeWeighted,
      sumTimeWeightedError,
      accuracyScore,
    };
  }

  @Query(() => [ForecasterScoreType], {
    description: 'Top forecasters ranked by accuracy score',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async accuracyLeaderboard(
    @Arg('limit', () => Int, { defaultValue: 10 }) limit: number
  ): Promise<ForecasterScoreType[]> {
    const capped = Math.max(1, Math.min(limit, 100));

    const scores = await ScoreResolver.getLeaderboardScores();

    return scores.slice(0, capped).map((s) => ({
      address: s.attester,
      numScored: 0,
      sumErrorSquared: 0,
      numTimeWeighted: 0,
      sumTimeWeightedError: 0,
      accuracyScore: s.accuracyScore,
    }));
  }

  @Query(() => AccuracyRankType, {
    description:
      'Accuracy rank and score for a single address relative to all forecasters',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async accountAccuracyRank(
    @Arg('address', () => String) address: string
  ): Promise<AccuracyRankType> {
    const target = address.toLowerCase();

    const scores = await ScoreResolver.getLeaderboardScores();

    const totalForecasters = scores.length;
    const idx = scores.findIndex((s) => s.attester === target);
    const rank = idx >= 0 ? idx + 1 : null;
    const accuracyScore = idx >= 0 ? scores[idx].accuracyScore : 0;

    return {
      address: target,
      accuracyScore,
      rank,
      totalForecasters,
    } as AccuracyRankType;
  }
}
