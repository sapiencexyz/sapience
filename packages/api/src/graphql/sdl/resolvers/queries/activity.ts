/**
 * Query.accountActivity — unified feed interleaving predictions and
 * secondary-market trades by timestamp. When `address` is omitted the
 * feed is global; `type` filters to just predictions or just trades.
 *
 * Supports optional scoping by `pickConfigId` and/or `conditionId`.
 * Predictions filter directly by pickConfigId; trades filter via the
 * in-scope pick config token set because secondary trades have no
 * pickConfigId foreign key.
 */

import type {
  QueryResolvers,
  ResolversParentTypes,
} from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { mapPickConfig } from '../pickConfigHelpers';

const MAX_SKIP = 500;

export const accountActivity: NonNullable<
  QueryResolvers['accountActivity']
> = async (
  _parent,
  { address, take, skip, type, pickConfigId, conditionId }
) => {
  const cappedTake = Math.max(1, Math.min(take ?? 20, 100));
  const cappedSkip = Math.max(0, Math.min(skip ?? 0, MAX_SKIP));
  const addr = address?.toLowerCase();
  const pickConfigIdLower = pickConfigId?.toLowerCase();
  const conditionIdLower = conditionId?.toLowerCase();

  const includePredictions = !type || type === 'prediction';
  const includeTrades = !type || type === 'trade';
  const fetchSize = cappedSkip + cappedTake;

  let scopedPickConfigIds: string[] | null = null;
  if (conditionIdLower) {
    const matchingPicks = await prisma.pick.findMany({
      where: { conditionId: conditionIdLower },
      select: { pickConfigId: true },
      distinct: ['pickConfigId'],
    });
    scopedPickConfigIds = matchingPicks.map((p) => p.pickConfigId);
    if (pickConfigIdLower) {
      scopedPickConfigIds = scopedPickConfigIds.filter(
        (id) => id === pickConfigIdLower
      );
    }
  } else if (pickConfigIdLower) {
    scopedPickConfigIds = [pickConfigIdLower];
  }

  if (scopedPickConfigIds !== null && scopedPickConfigIds.length === 0) {
    return [];
  }

  const scopedTokens: string[] = [];
  if (scopedPickConfigIds !== null) {
    const configs = await prisma.picks.findMany({
      where: { id: { in: scopedPickConfigIds } },
      select: { predictorToken: true, counterpartyToken: true },
    });
    const seen = new Set<string>();
    for (const c of configs) {
      for (const raw of [c.predictorToken, c.counterpartyToken]) {
        if (!raw) continue;
        const token = raw.toLowerCase();
        if (!seen.has(token)) {
          seen.add(token);
          scopedTokens.push(token);
        }
      }
    }
  }

  const addressPredictionClause = addr
    ? { OR: [{ predictor: addr }, { counterparty: addr }] }
    : null;
  const addressTradeClause = addr
    ? { OR: [{ seller: addr }, { buyer: addr }] }
    : null;

  const pickConfigIdClause =
    scopedPickConfigIds !== null
      ? scopedPickConfigIds.length === 1
        ? { pickConfigId: scopedPickConfigIds[0] }
        : { pickConfigId: { in: scopedPickConfigIds } }
      : null;

  const tokenClause =
    scopedPickConfigIds !== null ? { token: { in: scopedTokens } } : null;

  const predictionWhere = pickConfigIdClause
    ? addressPredictionClause
      ? { AND: [addressPredictionClause, pickConfigIdClause] }
      : pickConfigIdClause
    : (addressPredictionClause ?? {});

  const tradeWhere = tokenClause
    ? addressTradeClause
      ? { AND: [addressTradeClause, tokenClause] }
      : tokenClause
    : (addressTradeClause ?? {});

  const shouldFetchTrades =
    includeTrades && (scopedPickConfigIds === null || scopedTokens.length > 0);

  const [predictions, trades] = await Promise.all([
    includePredictions
      ? prisma.prediction.findMany({
          where: predictionWhere,
          orderBy: { createdAt: 'desc' },
          take: fetchSize,
          include: { pickConfiguration: { include: { picks: true } } },
        })
      : Promise.resolve([]),
    shouldFetchTrades
      ? prisma.secondaryTrade.findMany({
          where: tradeWhere,
          orderBy: { executedAt: 'desc' },
          take: fetchSize,
        })
      : Promise.resolve([]),
  ]);

  const tradeTokens = [...new Set(trades.map((t) => t.token.toLowerCase()))];
  const tradePickConfigs =
    tradeTokens.length > 0
      ? await prisma.picks.findMany({
          where: {
            OR: [
              { predictorToken: { in: tradeTokens } },
              { counterpartyToken: { in: tradeTokens } },
            ],
          },
          include: { picks: true },
        })
      : [];

  // Pick.condition uses the per-request conditionById DataLoader to batch
  // every conditionId touched by this page's picks (predictions + trades)
  // into a single findMany on first access — no eager preload needed here.

  const pickConfigsByToken = new Map<
    string,
    ResolversParentTypes['PickConfiguration']
  >();
  for (const pc of tradePickConfigs) {
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

  const items: ResolversParentTypes['ActivityItem'][] = [];

  for (const r of predictions) {
    const ts =
      r.collateralDepositedAt ?? Math.floor(r.createdAt.getTime() / 1000);
    const prediction: ResolversParentTypes['Prediction'] = {
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
      result: r.result as ResolversParentTypes['Prediction']['result'],
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
    };
    items.push({
      type: 'prediction',
      timestamp: ts,
      prediction,
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

  items.sort((a, b) => b.timestamp - a.timestamp);
  return items.slice(cappedSkip, cappedSkip + cappedTake);
};
