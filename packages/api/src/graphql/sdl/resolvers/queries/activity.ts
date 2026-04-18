/**
 * Query.accountActivity — unified feed interleaving predictions and
 * secondary-market trades by timestamp. When `address` is omitted the
 * feed is global; `type` filters to just predictions or just trades.
 *
 * Strategy: fetch `skip + take` from each source (since we don't know
 * the interleave beforehand), merge client-side by timestamp desc,
 * then apply skip/take on the merged list. Capped at take=100 /
 * skip=500 to protect the DB.
 *
 * Pick configurations for trade tokens are resolved in a single batched
 * query and memoized by lowercased token address.
 */

import type {
  QueryResolvers,
  ActivityItem,
  PickConfiguration,
  Prediction,
} from '../../__generated__/resolvers';
import prisma from '../../../../db';
import { mapPickConfig } from '../pickConfigHelpers';

const MAX_SKIP = 500;

export const accountActivity: NonNullable<
  QueryResolvers['accountActivity']
> = async (_parent, { address, take, skip, type }) => {
  const cappedTake = Math.max(1, Math.min(take ?? 20, 100));
  const cappedSkip = Math.max(0, Math.min(skip ?? 0, MAX_SKIP));
  const addr = address?.toLowerCase();
  const includePredictions = !type || type === 'prediction';
  const includeTrades = !type || type === 'trade';
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

  // Batch-resolve pick configurations for all trade tokens.
  const tradeTokens = [...new Set(trades.map((t) => t.token.toLowerCase()))];
  const pickConfigsByToken = new Map<string, PickConfiguration>();
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

  const items: ActivityItem[] = [];

  for (const r of predictions) {
    const ts =
      r.collateralDepositedAt ?? Math.floor(r.createdAt.getTime() / 1000);
    const prediction: Prediction = {
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
      result: r.result as Prediction['result'],
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
