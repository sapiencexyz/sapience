/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `Query.activity` — Relay-shaped unified feed interleaving Predictions and
 * secondary-market Trades, sorted by `createdAt` (predictions) /
 * `executedAt` (trades) descending. The activity feed is a derived view
 * (no `Node` membership); identity within a page is the cursor.
 *
 * Cursor format: opaque base64 over `{ k: ISO timestamp, id: "<TYPE>:<rowId>" }`.
 * The keyset predicate is pushed into Prisma on each side so deep pagination
 * doesn't re-fetch the whole history every page; the subsecond branch on
 * the cross-type case (`Math.floor(predictionMs / 1000)`) prevents a
 * trade at the same second from being skipped after a subsecond prediction
 * cursor.
 *
 * Filter scoping:
 *  - `account`: OR across `predictor`/`counterparty` for predictions and
 *    `buyer`/`seller` for trades.
 *  - `conditionId` / `conditionIds`: walk Condition → Pick →
 *    PickConfiguration to derive the pickConfigId set (for predictions)
 *    and the predictor/counterparty token set (for trades).
 *  - `conditionGroupId`: expanded into its member condition ids, then
 *    treated as above.
 *  - `pickConfigId`: intersect with the condition-derived set if both
 *    are present.
 *  - `createdAt`: epoch-seconds range applied via Prisma to both sides
 *    (Predictions store DateTime, Trades store Int — bounds project to
 *    the right type per side).
 *  - `types: []` is an explicit zero-result query.
 *
 * `Forecast` is intentionally not in the union (see the redesign doc's
 * "Activity model" section).
 */
import type { QueryResolvers } from '../../__generated__/resolvers';
import { ActivityType } from '../../__generated__/resolvers';
import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { encodeCursor, decodeCursor } from '../../../relay/cursor';
import { synthesizeAccount } from '../accountSynthesis';
import { mapPrediction, type PredictionWithPickConfig } from './escrow';
import { mapTrade, type Trade } from './trade';
import { clampTake } from './pagination';

const emptyPageInfo = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

const activityCursorPredicate = (
  cursor: { k?: string; id?: string } | null,
  sourceType: ActivityType
): Prisma.PredictionWhereInput | Prisma.SecondaryTradeWhereInput | null => {
  if (!cursor?.k || !cursor.id) return null;
  const createdAt = new Date(cursor.k);
  const [cursorType, ...idParts] = String(cursor.id).split(':');
  const cursorSourceId = idParts.join(':');
  if (!Number.isFinite(createdAt.getTime()) || !cursorType || !cursorSourceId)
    return null;
  const sourceTypeIsAfterCursorType = sourceType < (cursorType as ActivityType);
  const sameSourceType = sourceType === cursorType;
  if (sourceType === ActivityType.Prediction) {
    return {
      OR: [
        { createdAt: { lt: createdAt } },
        ...(sourceTypeIsAfterCursorType
          ? [
              {
                createdAt: { equals: createdAt },
              } as Prisma.PredictionWhereInput,
            ]
          : []),
        ...(sameSourceType
          ? [
              {
                AND: [
                  { createdAt: { equals: createdAt } },
                  { predictionId: { lt: cursorSourceId } },
                ],
              } as Prisma.PredictionWhereInput,
            ]
          : []),
      ],
    };
  }
  const executedAt = Math.floor(createdAt.getTime() / 1000);
  const hasSubsecondCursor = createdAt.getTime() % 1000 !== 0;
  return {
    OR: [
      {
        executedAt: hasSubsecondCursor
          ? { lte: executedAt }
          : { lt: executedAt },
      },
      ...(sourceTypeIsAfterCursorType
        ? [
            {
              executedAt: { equals: executedAt },
            } as Prisma.SecondaryTradeWhereInput,
          ]
        : []),
      ...(sameSourceType
        ? [
            {
              AND: [
                { executedAt: { equals: executedAt } },
                { id: { lt: Number(cursorSourceId) } },
              ],
            } as Prisma.SecondaryTradeWhereInput,
          ]
        : []),
    ],
  };
};

type ActivityRow =
  | {
      sourceType: ActivityType.Prediction;
      sourceId: string;
      createdAt: Date;
      source: ReturnType<typeof mapPrediction>;
    }
  | {
      sourceType: ActivityType.Trade;
      sourceId: string;
      createdAt: Date;
      source: ReturnType<typeof mapTrade>;
    };

type CreatedAtFilterShape = {
  gte?: number | null;
  gt?: number | null;
  lte?: number | null;
  lt?: number | null;
  equals?: number | null;
} | null;

const projectPredictionCreatedAt = (
  raw: CreatedAtFilterShape
): Prisma.DateTimeFilter | null => {
  if (!raw) return null;
  const out: Prisma.DateTimeFilter = {};
  if (raw.gte != null) out.gte = new Date(raw.gte * 1000);
  if (raw.gt != null) out.gt = new Date(raw.gt * 1000);
  if (raw.lte != null) out.lte = new Date(raw.lte * 1000);
  if (raw.lt != null) out.lt = new Date(raw.lt * 1000);
  if (raw.equals != null) out.equals = new Date(raw.equals * 1000);
  return Object.keys(out).length ? out : null;
};

const projectTradeExecutedAt = (
  raw: CreatedAtFilterShape
): Prisma.IntFilter | null => {
  if (!raw) return null;
  const out: Prisma.IntFilter = {};
  if (raw.gte != null) out.gte = raw.gte;
  if (raw.gt != null) out.gt = raw.gt;
  if (raw.lte != null) out.lte = raw.lte;
  if (raw.lt != null) out.lt = raw.lt;
  if (raw.equals != null) out.equals = raw.equals;
  return Object.keys(out).length ? out : null;
};

export const activity = (async (
  _parent: unknown,
  { first, after, filter }: any
) => {
  const cappedFirst = clampTake(first ?? 50, { defaultTake: 50, maxTake: 100 });
  const types = filter?.types ?? [ActivityType.Prediction, ActivityType.Trade];
  if (types.length === 0)
    return { edges: [], nodes: [], totalCount: 0, pageInfo: emptyPageInfo };
  const includePredictions = types.includes(ActivityType.Prediction);
  const includeTrades = types.includes(ActivityType.Trade);
  const address = filter?.account?.toLowerCase();
  const pickConfigId = filter?.pickConfigId?.toLowerCase();
  const conditionId = filter?.conditionId?.toLowerCase();
  const conditionIds = (filter?.conditionIds ?? []).map((id: string) =>
    id.toLowerCase()
  );
  const conditionGroupId = filter?.conditionGroupId ?? null;
  const createdAtFilter = (filter?.createdAt ?? null) as CreatedAtFilterShape;
  let pickConfigIds: string[] | null = pickConfigId ? [pickConfigId] : null;
  if (conditionGroupId != null) {
    const conditions = await prisma.condition.findMany({
      where: { conditionGroupId: Number(conditionGroupId) },
      select: { id: true },
    });
    conditionIds.push(
      ...conditions.map((condition) => condition.id.toLowerCase())
    );
  }
  if (conditionId) conditionIds.push(conditionId);
  if (conditionIds.length > 0) {
    const picks = await prisma.pick.findMany({
      where: { conditionId: { in: Array.from(new Set(conditionIds)) } },
      select: { pickConfigId: true },
      distinct: ['pickConfigId'],
    });
    const fromCondition = picks.map((p) => p.pickConfigId.toLowerCase());
    pickConfigIds = pickConfigIds
      ? pickConfigIds.filter((id) => fromCondition.includes(id))
      : fromCondition;
  }
  if (pickConfigIds && pickConfigIds.length === 0) {
    return { edges: [], nodes: [], totalCount: 0, pageInfo: emptyPageInfo };
  }
  const configs = pickConfigIds
    ? await prisma.picks.findMany({
        where: { id: { in: pickConfigIds } },
        select: { predictorToken: true, counterpartyToken: true },
      })
    : [];
  const tokens = configs
    .flatMap((c) => [c.predictorToken, c.counterpartyToken])
    .filter(Boolean)
    .map((t) => t!.toLowerCase());

  const predictionCreatedAt = projectPredictionCreatedAt(createdAtFilter);
  const tradeExecutedAt = projectTradeExecutedAt(createdAtFilter);
  const predictionWhere: Prisma.PredictionWhereInput = {
    ...(address
      ? { OR: [{ predictor: address }, { counterparty: address }] }
      : {}),
    ...(pickConfigIds ? { pickConfigId: { in: pickConfigIds } } : {}),
    ...(predictionCreatedAt ? { createdAt: predictionCreatedAt } : {}),
  };
  const tradeWhere: Prisma.SecondaryTradeWhereInput = {
    ...(address ? { OR: [{ buyer: address }, { seller: address }] } : {}),
    ...(pickConfigIds ? { token: { in: tokens } } : {}),
    ...(tradeExecutedAt ? { executedAt: tradeExecutedAt } : {}),
  };

  const cursor = after ? decodeCursor(after) : null;
  const predictionCursorWhere = activityCursorPredicate(
    cursor,
    ActivityType.Prediction
  ) as Prisma.PredictionWhereInput | null;
  const tradeCursorWhere = activityCursorPredicate(
    cursor,
    ActivityType.Trade
  ) as Prisma.SecondaryTradeWhereInput | null;
  const pagePredictionWhere: Prisma.PredictionWhereInput = predictionCursorWhere
    ? { AND: [predictionWhere, predictionCursorWhere] }
    : predictionWhere;
  const pageTradeWhere: Prisma.SecondaryTradeWhereInput = tradeCursorWhere
    ? { AND: [tradeWhere, tradeCursorWhere] }
    : tradeWhere;

  // `predictionWhere` / `tradeWhere` (no cursor predicate) define the
  // underlying ranked set; the cursor-aware variants are only for slicing
  // this page. Counts run against the unfiltered-by-cursor predicates so
  // `totalCount` matches the filter, not the current page position.
  const [predictions, trades, predictionTotal, tradeTotal] = await Promise.all([
    includePredictions
      ? prisma.prediction.findMany({
          where: pagePredictionWhere,
          orderBy: [{ createdAt: 'desc' }, { predictionId: 'desc' }],
          take: cappedFirst + 1,
          include: { pickConfiguration: { include: { picks: true } } },
        })
      : Promise.resolve([]),
    includeTrades
      ? prisma.secondaryTrade.findMany({
          where: pageTradeWhere,
          orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
          take: cappedFirst + 1,
        })
      : Promise.resolve([]),
    includePredictions
      ? prisma.prediction.count({ where: predictionWhere })
      : Promise.resolve(0),
    includeTrades
      ? prisma.secondaryTrade.count({ where: tradeWhere })
      : Promise.resolve(0),
  ]);
  const totalCount = predictionTotal + tradeTotal;

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
  const pageRows = rows.slice(0, cappedFirst);
  const nodes = pageRows.map((r) => {
    let actor = 'predictor' in r.source ? r.source.predictor : r.source.buyer;
    if (
      address &&
      'seller' in r.source &&
      (r.source.seller as string).toLowerCase() === address
    ) {
      actor = r.source.seller;
    }
    return {
      source: r.source,
      createdAt: r.createdAt,
      account: synthesizeAccount(actor) as never,
    };
  });
  const edges = nodes.map((node, index) => {
    const r = pageRows[index];
    return {
      node,
      cursor: encodeCursor({
        k: r.createdAt.toISOString(),
        id: `${r.sourceType}:${r.sourceId}`,
      }),
    };
  });
  return {
    edges,
    nodes,
    totalCount,
    pageInfo: {
      hasNextPage: rows.length > cappedFirst,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
}) as any as NonNullable<QueryResolvers['activity']>;
