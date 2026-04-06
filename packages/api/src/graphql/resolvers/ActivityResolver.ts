import { Arg, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import prisma from '../../db';
import {
  PredictionType,
  PickConfigurationType,
  mapPickConfig,
} from './EscrowResolver';

// ============================================================================
// GraphQL Object Types
// ============================================================================

@ObjectType('ActivityTrade', {
  description: 'Trade fields embedded in an activity item',
})
class ActivityTradeType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  tradeHash!: string;

  @Field(() => String)
  seller!: string;

  @Field(() => String)
  buyer!: string;

  @Field(() => String)
  token!: string;

  @Field(() => String)
  collateral!: string;

  @Field(() => String)
  tokenAmount!: string;

  @Field(() => String)
  price!: string;

  @Field(() => Int)
  executedAt!: number;

  @Field(() => String)
  txHash!: string;

  @Field(() => Int)
  blockNumber!: number;

  @Field(() => PickConfigurationType, { nullable: true })
  pickConfig?: PickConfigurationType | null;
}

@ObjectType('ActivityItem', {
  description:
    'A single activity entry — either a prediction or a trade, sorted by timestamp',
})
class ActivityItemType {
  @Field(() => String)
  type!: 'prediction' | 'trade';

  @Field(() => Int, { description: 'Unix seconds timestamp for sorting' })
  timestamp!: number;

  @Field(() => PredictionType, { nullable: true })
  prediction?: PredictionType | null;

  @Field(() => ActivityTradeType, { nullable: true })
  trade?: ActivityTradeType | null;
}

// ============================================================================
// Resolver
// ============================================================================

const MAX_SKIP = 500;

@Resolver()
export class ActivityResolver {
  @Query(() => [ActivityItemType], {
    description:
      'Unified activity feed — predictions and trades merged by timestamp. ' +
      'When address is provided, scopes to that account; otherwise returns recent global activity.',
  })
  async accountActivity(
    @Arg('address', () => String, { nullable: true }) address?: string,
    @Arg('take', () => Int, { defaultValue: 20 }) take?: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip?: number,
    @Arg('type', () => String, { nullable: true }) type?: string
  ): Promise<ActivityItemType[]> {
    const cappedTake = Math.max(1, Math.min(take ?? 20, 100));
    const cappedSkip = Math.max(0, Math.min(skip ?? 0, MAX_SKIP));
    const addr = address?.toLowerCase();

    const includePredictions = !type || type === 'prediction';
    const includeTrades = !type || type === 'trade';

    // Fetch skip + take from each source — guarantees correct merged results
    // for any interleaving of the two timestamp-sorted streams.
    const fetchSize = cappedSkip + cappedTake;

    const predictionWhere = addr
      ? { OR: [{ predictor: addr }, { counterparty: addr }] }
      : {};
    const tradeWhere = addr ? { OR: [{ seller: addr }, { buyer: addr }] } : {};

    const [predictions, trades] = await Promise.all([
      includePredictions
        ? prisma.prediction.findMany({
            where: predictionWhere,
            orderBy: { createdAt: 'desc' },
            take: fetchSize,
            include: { pickConfiguration: { include: { picks: true } } },
          })
        : Promise.resolve([]),
      includeTrades
        ? prisma.secondaryTrade.findMany({
            where: tradeWhere,
            orderBy: { executedAt: 'desc' },
            take: fetchSize,
          })
        : Promise.resolve([]),
    ]);

    // Resolve pick configs for trade tokens in a single batch query
    const tradeTokens = [...new Set(trades.map((t) => t.token.toLowerCase()))];
    const pickConfigsByToken = new Map<string, PickConfigurationType>();
    if (tradeTokens.length > 0) {
      const pickConfigs = await prisma.picks.findMany({
        where: {
          OR: [
            { predictorToken: { in: tradeTokens } },
            { counterpartyToken: { in: tradeTokens } },
          ],
        },
        include: { picks: true },
      });
      for (const pc of pickConfigs) {
        const mapped = mapPickConfig(pc);
        if (
          pc.predictorToken &&
          tradeTokens.includes(pc.predictorToken.toLowerCase())
        ) {
          pickConfigsByToken.set(pc.predictorToken.toLowerCase(), mapped);
        }
        if (
          pc.counterpartyToken &&
          tradeTokens.includes(pc.counterpartyToken.toLowerCase())
        ) {
          pickConfigsByToken.set(pc.counterpartyToken.toLowerCase(), mapped);
        }
      }
    }

    // Map to unified items
    const items: ActivityItemType[] = [];

    for (const r of predictions) {
      const ts =
        r.collateralDepositedAt ?? Math.floor(r.createdAt.getTime() / 1000);
      items.push({
        type: 'prediction',
        timestamp: ts,
        prediction: {
          id: r.id,
          predictionId: r.predictionId,
          chainId: r.chainId,
          marketAddress: r.marketAddress,
          predictor: r.predictor,
          counterparty: r.counterparty,
          predictorToken: r.pickConfiguration?.predictorToken ?? '',
          counterpartyToken: r.pickConfiguration?.counterpartyToken ?? '',
          predictorCollateral: r.predictorCollateral,
          counterpartyCollateral: r.counterpartyCollateral,
          collateralDeposited: r.collateralDeposited ?? null,
          collateralDepositedAt: r.collateralDepositedAt ?? null,
          settled: r.settled,
          settledAt: r.settledAt ?? null,
          result: r.result,
          predictorClaimable: r.predictorClaimable ?? null,
          counterpartyClaimable: r.counterpartyClaimable ?? null,
          createdAt: r.createdAt,
          createTxHash: r.createTxHash,
          settleTxHash: r.settleTxHash ?? null,
          refCode: r.refCode ?? null,
          isLegacy: r.isLegacy,
          pickConfig: r.pickConfiguration
            ? mapPickConfig(r.pickConfiguration)
            : null,
        },
        trade: null,
      });
    }

    for (const t of trades) {
      items.push({
        type: 'trade',
        timestamp: t.executedAt,
        trade: {
          id: t.id,
          chainId: t.chainId,
          tradeHash: t.tradeHash,
          seller: t.seller,
          buyer: t.buyer,
          token: t.token,
          collateral: t.collateral,
          tokenAmount: t.tokenAmount,
          price: t.price,
          executedAt: t.executedAt,
          txHash: t.txHash,
          blockNumber: t.blockNumber,
          pickConfig: pickConfigsByToken.get(t.token.toLowerCase()) ?? null,
        },
        prediction: null,
      });
    }

    // Sort by timestamp descending, apply skip/take
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items.slice(cappedSkip, cappedSkip + cappedTake);
  }
}
