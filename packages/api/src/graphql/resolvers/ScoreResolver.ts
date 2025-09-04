import {
  Resolver,
  Query,
  Arg,
  Int,
  ObjectType,
  Field,
  Float,
} from 'type-graphql';
import { prisma } from '../resolvers/GeneratedResolvers';

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
    const row = await prisma.forecasterScore.findUnique({
      where: { attester: attester.toLowerCase() },
    });
    if (!row) return null;
    return {
      attester: row.attester,
      numScored: row.numScored,
      sumErrorSquared: row.sumErrorSquared,
      meanBrier: row.meanBrier,
      numTimeWeighted: row.numTimeWeighted,
      sumTimeWeightedError: row.sumTimeWeightedError,
      timeWeightedMeanBrier: row.timeWeightedMeanBrier,
    };
  }

  @Query(() => [ForecasterScoreType])
  async topForecasters(
    @Arg('limit', () => Int, { defaultValue: 10 }) limit: number
  ): Promise<ForecasterScoreType[]> {
    const rows = await prisma.forecasterScore.findMany({
      orderBy: { timeWeightedMeanBrier: 'asc' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    return rows.map((r) => ({
      attester: r.attester,
      numScored: r.numScored,
      sumErrorSquared: r.sumErrorSquared,
      meanBrier: r.meanBrier,
      numTimeWeighted: r.numTimeWeighted,
      sumTimeWeightedError: r.sumTimeWeightedError,
      timeWeightedMeanBrier: r.timeWeightedMeanBrier,
    }));
  }
}
