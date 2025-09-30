import { Resolver, Query, Arg, Int, ObjectType, Field } from 'type-graphql';
import prisma from '../../db';

type PredictionMintedLogData = {
  eventType: 'PredictionMinted';
  maker: string;
  taker: string;
  makerNftTokenId: string;
  takerNftTokenId: string;
  makerCollateral: string;
  takerCollateral: string;
  totalCollateral: string;
  refCode: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp: number;
};

@ObjectType()
class ConditionSummary {
  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  question?: string | null;

  @Field(() => String, { nullable: true })
  shortName?: string | null;

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
  makerCollateral?: string | null;

  @Field(() => String, { nullable: true })
  takerCollateral?: string | null;

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
          select: { id: true, question: true, shortName: true, endTime: true },
        })
      : [];
    const condMap = new Map(conditions.map((c) => [c.id, c]));

    // Preload mint events for the set of mint timestamps to derive maker/taker collateral
    const mintTimestamps = Array.from(
      new Set(rows.map((r) => BigInt(r.mintedAt)))
    );
    const mintEvents = mintTimestamps.length
      ? await prisma.event.findMany({
          where: {
            marketGroupId: null,
            timestamp: { in: mintTimestamps },
          },
        })
      : [];

    // Build lookup by maker/taker NFT ids
    const mintKeyToEvent = new Map<string, PredictionMintedLogData>();
    for (const ev of mintEvents) {
      try {
        const data = ev.logData as unknown as PredictionMintedLogData;
        if (!data || data.eventType !== 'PredictionMinted') continue;
        const key = `${String(data.makerNftTokenId)}-${String(data.takerNftTokenId)}`;
        mintKeyToEvent.set(key, data);
      } catch {
        // ignore malformed rows
      }
    }

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
      const mintKey = `${r.makerNftTokenId}-${r.takerNftTokenId}`;
      const mintData = mintKeyToEvent.get(mintKey);
      return {
        id: r.id,
        chainId: r.chainId,
        marketAddress: r.marketAddress,
        maker: r.maker,
        taker: r.taker,
        makerNftTokenId: r.makerNftTokenId,
        takerNftTokenId: r.takerNftTokenId,
        totalCollateral: r.totalCollateral,
        makerCollateral: mintData?.makerCollateral?.toString?.() ?? null,
        takerCollateral: mintData?.takerCollateral?.toString?.() ?? null,
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
