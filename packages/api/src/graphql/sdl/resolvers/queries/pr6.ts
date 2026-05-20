/* eslint-disable @typescript-eslint/no-explicit-any */
import type { QueryResolvers } from '../../__generated__/resolvers';
import { ActivityType, LeaderboardMetric } from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { encodeCursor, decodeCursor } from '../../../relay/cursor';
import { synthesizeAccount } from '../accountSynthesis';
import { mapPrediction, type PredictionWithPickConfig } from './escrow';
import { mapTrade, type Trade } from './trade';
import { clampTake } from './pagination';
import {
  getMerged,
  rankedFor,
  resolveWindow,
  type AccountStatsLeaderboardEntry,
} from './accountStats';
import { getLeaderboardScores } from './score';
import { AccountStatsMetric } from '../../__generated__/resolvers';

const emptyPageInfo = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

const metricToLegacy = (metric: LeaderboardMetric): AccountStatsMetric => {
  switch (metric) {
    case LeaderboardMetric.Volume:
      return AccountStatsMetric.Volume;
    case LeaderboardMetric.Pnl:
    case LeaderboardMetric.Roi:
    default:
      return AccountStatsMetric.NetPnl;
  }
};

const valueForMetric = (
  entry: AccountStatsLeaderboardEntry,
  metric: LeaderboardMetric
): string => {
  // Unit polymorphism is intentional: PNL is signed wUSDe, VOLUME is positive
  // wUSDe, ROI is a ratio, and ACCURACY is the raw Brier-derived score.
  if (metric === LeaderboardMetric.Volume) return entry.volume;
  if (metric === LeaderboardMetric.Roi) {
    const volume = Number(BigInt(entry.volume || '0'));
    if (!Number.isFinite(volume) || volume === 0) return '0';
    return String(Number(BigInt(entry.netPnL || '0')) / volume);
  }
  return entry.netPnL;
};

export const leaderboard = (async (
  _parent: unknown,
  { metric, first, after, filter }: any
) => {
  const cappedFirst = clampTake(first ?? 25, { defaultTake: 25, maxTake: 100 });
  const offsetPayload = after ? decodeCursor(after) : null;
  const start = offsetPayload ? Number(offsetPayload.k) + 1 : 0;

  let ranked: { address: string; value: string }[];
  if (metric === LeaderboardMetric.Accuracy) {
    ranked = (await getLeaderboardScores()).map((s) => ({
      address: s.attester,
      value: String(s.accuracyScore),
    }));
  } else {
    const { fromEpoch, toEpochResolved } = resolveWindow(filter?.from, filter?.to);
    ranked = rankedFor(await getMerged(fromEpoch, toEpochResolved), metricToLegacy(metric)).map(
      (e) => ({ address: e.address, value: valueForMetric(e, metric) })
    );
  }

  const slice = ranked.slice(start, start + cappedFirst);
  const nodes = slice.map((e, index) => ({
    account: synthesizeAccount(e.address) as never,
    rank: start + index + 1,
    value: e.value,
  }));
  const edges = nodes.map((node, index) => ({
    node,
    cursor: encodeCursor({ k: String(start + index), id: (node.account as any).address }),
  }));
  return {
    metric,
    nodes,
    edges,
    pageInfo: {
      hasNextPage: start + slice.length < ranked.length,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
}) as any as NonNullable<QueryResolvers['leaderboard']>;

type ActivityRow =
  | { sourceType: ActivityType.Prediction; sourceId: string; createdAt: Date; source: ReturnType<typeof mapPrediction> }
  | { sourceType: ActivityType.Trade; sourceId: string; createdAt: Date; source: ReturnType<typeof mapTrade> };

export const activity = (async (
  _parent: unknown,
  { first, after, filter }: any
) => {
  const cappedFirst = clampTake(first ?? 50, { defaultTake: 50, maxTake: 100 });
  const types = filter?.types ?? [ActivityType.Prediction, ActivityType.Trade];
  if (types.length === 0) return { edges: [], nodes: [], pageInfo: emptyPageInfo };
  const includePredictions = types.includes(ActivityType.Prediction);
  const includeTrades = types.includes(ActivityType.Trade);
  const address = filter?.account?.toLowerCase();
  const pickConfigId = filter?.pickConfigId?.toLowerCase();
  const conditionId = filter?.conditionId?.toLowerCase();
  let pickConfigIds: string[] | null = pickConfigId ? [pickConfigId] : null;
  if (conditionId) {
    const picks = await prisma.pick.findMany({
      where: { conditionId },
      select: { pickConfigId: true },
      distinct: ['pickConfigId'],
    });
    const fromCondition = picks.map((p) => p.pickConfigId.toLowerCase());
    pickConfigIds = pickConfigIds
      ? pickConfigIds.filter((id) => fromCondition.includes(id))
      : fromCondition;
  }
  if (pickConfigIds && pickConfigIds.length === 0) {
    return { edges: [], nodes: [], pageInfo: emptyPageInfo };
  }
  const configs = pickConfigIds
    ? await prisma.picks.findMany({
        where: { id: { in: pickConfigIds } },
        select: { predictorToken: true, counterpartyToken: true },
      })
    : [];
  const tokens = configs.flatMap((c) => [c.predictorToken, c.counterpartyToken]).filter(Boolean).map((t) => t!.toLowerCase());

  const predictionWhere: Prisma.PredictionWhereInput = {
    ...(address ? { OR: [{ predictor: address }, { counterparty: address }] } : {}),
    ...(pickConfigIds ? { pickConfigId: { in: pickConfigIds } } : {}),
  };
  const tradeWhere: Prisma.SecondaryTradeWhereInput = {
    ...(address ? { OR: [{ buyer: address }, { seller: address }] } : {}),
    ...(pickConfigIds ? { token: { in: tokens } } : {}),
  };

  const [predictions, trades] = await Promise.all([
    includePredictions
      ? prisma.prediction.findMany({
          where: predictionWhere,
          orderBy: [{ createdAt: 'desc' }, { predictionId: 'desc' }],
          take: cappedFirst + 1,
          include: { pickConfiguration: { include: { picks: true } } },
        })
      : Promise.resolve([]),
    includeTrades
      ? prisma.secondaryTrade.findMany({
          where: tradeWhere,
          orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
          take: cappedFirst + 1,
        })
      : Promise.resolve([]),
  ]);

  const cursor = after ? decodeCursor(after) : null;
  const afterKey = cursor ? `${cursor.k}:${String(cursor.id).split(':')[0]}:${String(cursor.id).split(':').slice(1).join(':')}` : null;
  const rows: ActivityRow[] = [
    ...predictions.map((p: PredictionWithPickConfig) => ({
      sourceType: ActivityType.Prediction as const,
      sourceId: p.predictionId,
      createdAt: p.createdAt,
      source: mapPrediction(p),
    })),
    ...trades.map((t: Trade) => ({
      sourceType: ActivityType.Trade as const,
      sourceId: String(t.id),
      createdAt: new Date(t.executedAt * 1000),
      source: mapTrade(t),
    })),
  ].sort((a, b) => {
    const byTime = b.createdAt.getTime() - a.createdAt.getTime();
    if (byTime !== 0) return byTime;
    const byType = b.sourceType.localeCompare(a.sourceType);
    return byType !== 0 ? byType : b.sourceId.localeCompare(a.sourceId);
  });
  const filtered = afterKey
    ? rows.filter((r) => `${r.createdAt.toISOString()}:${r.sourceType}:${r.sourceId}` < afterKey)
    : rows;
  const pageRows = filtered.slice(0, cappedFirst);
  const nodes = pageRows.map((r) => ({ source: r.source, createdAt: r.createdAt, account: synthesizeAccount('predictor' in r.source ? r.source.predictor : r.source.buyer) as never }));
  const edges = nodes.map((node, index) => {
    const r = pageRows[index];
    return {
      node,
      cursor: encodeCursor({ k: r.createdAt.toISOString(), id: `${r.sourceType}:${r.sourceId}` }),
    };
  });
  return {
    edges,
    nodes,
    pageInfo: {
      hasNextPage: filtered.length > cappedFirst,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
}) as any as NonNullable<QueryResolvers['activity']>;
