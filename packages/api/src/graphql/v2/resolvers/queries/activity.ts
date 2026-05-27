/**
 * `Query.activity` — interleaved Prediction + Trade feed.
 *
 * Approach: fetch `first + 1` rows from each side under a unified
 * cursor predicate, merge in memory by timestamp DESC with stable
 * tie-break on `(type, id)`, slice to `first`, and emit a composite
 * cursor `{ k: <epoch-seconds>, id: "<type>:<id>" }`. The fetch-extra
 * pattern gives an accurate `hasNextPage` without an over-eager
 * second round-trip.
 *
 * Trades store `executedAt` as `Int` epoch seconds; Predictions store
 * `createdAt` as `DateTime`. Cursor key normalizes to seconds so a
 * subsecond prediction at the same boundary doesn't shadow a trade.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import {
  ActivityType,
  type QueryResolvers,
} from '../../__generated__/resolvers';
import { decodeCursor, encodeCursor } from '../../relay/cursor';
import { clampTake } from '../../relay/pagination';
import { getConditionTokenSet } from './conditionTokens';

const isType = (value: unknown): value is ActivityType =>
  value === ActivityType.Prediction || value === ActivityType.Trade;

type ActivityCursor = { ts: number; type: ActivityType; id: string };

const parseCursor = (
  after: string | null | undefined
): ActivityCursor | null => {
  if (!after) return null;
  const payload = decodeCursor(after);
  if (!payload) return null;
  const ts = Number(payload.k);
  const [type, ...idParts] = payload.id.split(':');
  const id = idParts.join(':');
  if (!Number.isFinite(ts) || !isType(type) || !id) return null;
  return { ts, type, id };
};

const predictionTs = (row: { createdAt: Date }) =>
  Math.floor(row.createdAt.getTime() / 1000);
const tradeTs = (row: { executedAt: number }) => row.executedAt;

const conditionIdsFor = async (
  conditionId: string | null | undefined,
  conditionIds: string[] | null | undefined
): Promise<string[] | null> => {
  const ids: string[] = [];
  if (conditionId) ids.push(conditionId.toLowerCase());
  if (conditionIds?.length)
    ids.push(...conditionIds.map((id) => id.toLowerCase()));
  return ids.length ? Array.from(new Set(ids)) : null;
};

export const activity: NonNullable<QueryResolvers['activity']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });

  // `types: []` is an explicit zero-result query.
  if (args.filter?.types && args.filter.types.length === 0) {
    return {
      edges: [],
      totalCount: 0,
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
    };
  }
  const includePrediction =
    !args.filter?.types || args.filter.types.includes(ActivityType.Prediction);
  const includeTrade =
    !args.filter?.types || args.filter.types.includes(ActivityType.Trade);

  // Resolve condition filter → pickConfig and token sets.
  const condIds = await conditionIdsFor(
    args.filter?.conditionId,
    args.filter?.conditionIds
  );

  // For trade-side condition filter we walk Pick → PickConfiguration to
  // collect the predictor / counterparty token addresses. The lookup is
  // TTL-cached (60s) by sorted condition-id set — the mapping changes
  // only when a new PickConfiguration is materialized, which is rare
  // relative to activity-feed read rate.
  let conditionPickConfigIds: string[] | null = null;
  let conditionTokens: string[] | null = null;
  if (condIds) {
    const { pickConfigIds, tokens } = await getConditionTokenSet(condIds);
    conditionPickConfigIds = pickConfigIds;
    conditionTokens = tokens;
  }

  // Prediction-side where
  const predictionWhere: Prisma.PredictionWhereInput = {};
  if (args.filter?.account) {
    const addr = args.filter.account.toLowerCase();
    predictionWhere.OR = [{ predictor: addr }, { counterparty: addr }];
  }
  if (args.filter?.pickConfigId)
    predictionWhere.pickConfigId = args.filter.pickConfigId.toLowerCase();
  if (conditionPickConfigIds) {
    const ids = args.filter?.pickConfigId
      ? conditionPickConfigIds.filter(
          (id) => id === args.filter!.pickConfigId!.toLowerCase()
        )
      : conditionPickConfigIds;
    predictionWhere.pickConfigId = ids.length === 1 ? ids[0] : { in: ids };
  }
  if (args.filter?.timestamp) {
    const r: Prisma.DateTimeFilter = {};
    if (args.filter.timestamp.gte != null)
      r.gte = new Date(args.filter.timestamp.gte * 1000);
    if (args.filter.timestamp.lte != null)
      r.lte = new Date(args.filter.timestamp.lte * 1000);
    predictionWhere.createdAt = r;
  }

  // Trade-side where
  const tradeWhere: Prisma.SecondaryTradeWhereInput = {};
  if (args.filter?.account) {
    const addr = args.filter.account.toLowerCase();
    tradeWhere.OR = [{ buyer: addr }, { seller: addr }];
  }
  if (conditionTokens != null) {
    tradeWhere.token = { in: conditionTokens };
  }
  if (args.filter?.timestamp) {
    const r: Prisma.IntFilter = {};
    if (args.filter.timestamp.gte != null) r.gte = args.filter.timestamp.gte;
    if (args.filter.timestamp.lte != null) r.lte = args.filter.timestamp.lte;
    tradeWhere.executedAt = r;
  }

  // Cursor — applied to both sides as `ts < cursor.ts OR (ts == cursor.ts AND ...)`
  const cursor = parseCursor(args.after);
  let predictionPageWhere = predictionWhere;
  let tradePageWhere = tradeWhere;
  if (cursor) {
    const cursorBoundaryDate = new Date(cursor.ts * 1000);
    predictionPageWhere = {
      AND: [
        predictionWhere,
        {
          OR: [
            { createdAt: { lt: cursorBoundaryDate } },
            // Same timestamp + later-than-cursor in stable order
            cursor.type === 'PREDICTION'
              ? {
                  AND: [
                    { createdAt: { equals: cursorBoundaryDate } },
                    { predictionId: { lt: cursor.id } },
                  ],
                }
              : { createdAt: { equals: cursorBoundaryDate } },
          ],
        } as Prisma.PredictionWhereInput,
      ],
    };
    tradePageWhere = {
      AND: [
        tradeWhere,
        {
          OR: [
            { executedAt: { lt: cursor.ts } },
            cursor.type === 'TRADE'
              ? {
                  AND: [
                    { executedAt: { equals: cursor.ts } },
                    { tradeHash: { lt: cursor.id } },
                  ],
                }
              : { executedAt: { equals: cursor.ts } },
          ],
        } as Prisma.SecondaryTradeWhereInput,
      ],
    };
  }

  const fetchN = first + 1;

  const [predictionRows, tradeRows] = await Promise.all([
    includePrediction
      ? prisma.prediction.findMany({
          where: predictionPageWhere,
          orderBy: [{ createdAt: 'desc' }, { predictionId: 'desc' }],
          include: { pickConfiguration: { include: { picks: true } } },
          take: fetchN,
        })
      : Promise.resolve([]),
    includeTrade
      ? prisma.secondaryTrade.findMany({
          where: tradePageWhere,
          orderBy: [{ executedAt: 'desc' }, { tradeHash: 'desc' }],
          take: fetchN,
        })
      : Promise.resolve([]),
  ]);

  type Row =
    | {
        kind: 'PREDICTION';
        ts: number;
        sortId: string;
        row: (typeof predictionRows)[number];
      }
    | {
        kind: 'TRADE';
        ts: number;
        sortId: string;
        row: (typeof tradeRows)[number];
      };

  const merged: Row[] = [
    ...predictionRows.map(
      (row): Row => ({
        kind: 'PREDICTION',
        ts: predictionTs(row),
        sortId: row.predictionId,
        row,
      })
    ),
    ...tradeRows.map(
      (row): Row => ({
        kind: 'TRADE',
        ts: tradeTs(row),
        sortId: row.tradeHash,
        row,
      })
    ),
  ];
  merged.sort((a, b) => {
    if (a.ts !== b.ts) return b.ts - a.ts;
    // Within the same ts: PREDICTION before TRADE (alphabetical),
    // then by id desc so the cursor predicate stays consistent.
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.sortId < b.sortId ? 1 : a.sortId > b.sortId ? -1 : 0;
  });

  const hasNextPage = merged.length > first;
  const pageRows = hasNextPage ? merged.slice(0, first) : merged;

  // totalCount: lazy — count both sides only if the client selects the
  // field. Both indexes hit, but skipping the roundtrips entirely is
  // free for activity-feed pages that paginate via cursor.
  const totalCountThunk = async (): Promise<number> => {
    const [predictionCount, tradeCount] = await Promise.all([
      includePrediction
        ? prisma.prediction.count({ where: predictionWhere })
        : Promise.resolve(0),
      includeTrade
        ? prisma.secondaryTrade.count({ where: tradeWhere })
        : Promise.resolve(0),
    ]);
    return predictionCount + tradeCount;
  };

  const edges = pageRows.map((r) => ({
    node: r.row,
    cursor: encodeCursor({
      k: String(r.ts),
      id: `${r.kind}:${r.sortId}`,
    }),
  }));

  return {
    edges,
    // graphql-js default resolver invokes functions on the parent; the
    // cast pushes the thunk past the generated `totalCount: number` type.
    totalCount: totalCountThunk as unknown as number,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};
