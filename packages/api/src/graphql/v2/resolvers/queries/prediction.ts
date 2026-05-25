/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `prediction(predictionId:)` / `predictions(...)`.
 *
 * Condition / endsAt filters route through the pickConfiguration join.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { clampTake } from '../../../sdl/resolvers/queries/pagination';

export const prediction = async (
  _parent: unknown,
  { predictionId }: { predictionId: string }
) =>
  prisma.prediction.findUnique({
    where: { predictionId: predictionId.toLowerCase() },
    include: { pickConfiguration: { include: { picks: true } } },
  });

type Field = 'CREATED_AT' | 'SETTLED_AT';
const FIELD_TO_PRISMA: Record<Field, 'createdAt' | 'settledAt'> = {
  CREATED_AT: 'createdAt',
  SETTLED_AT: 'settledAt',
};

export const predictions = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      predictionId?: string | null;
      participant?: string | null;
      predictor?: string | null;
      counterparty?: string | null;
      chainId?: number | null;
      pickConfigId?: string | null;
      conditionId?: string | null;
      conditionIds?: string[] | null;
      isLegacy?: boolean | null;
      settled?: boolean | null;
      result?: { equals?: string | null; in?: string[] | null } | null;
      endsAt?: { gte?: number | null; lte?: number | null } | null;
    } | null;
    orderBy?: { field: Field; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'CREATED_AT'];
  const direction: 'asc' | 'desc' =
    String(args.orderBy?.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';

  const where: Prisma.PredictionWhereInput = {};
  if (args.filter?.predictionId)
    where.predictionId = args.filter.predictionId.toLowerCase();
  if (args.filter?.participant) {
    const addr = args.filter.participant.toLowerCase();
    where.OR = [{ predictor: addr }, { counterparty: addr }];
  } else {
    if (args.filter?.predictor)
      where.predictor = args.filter.predictor.toLowerCase();
    if (args.filter?.counterparty)
      where.counterparty = args.filter.counterparty.toLowerCase();
  }
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.pickConfigId)
    where.pickConfigId = args.filter.pickConfigId.toLowerCase();
  if (args.filter?.isLegacy != null) where.isLegacy = args.filter.isLegacy;
  if (args.filter?.settled != null) where.settled = args.filter.settled;
  if (args.filter?.result?.equals)
    where.result = args.filter.result.equals as any;
  if (args.filter?.result?.in?.length)
    where.result = { in: args.filter.result.in as any[] };

  // Condition filters route through pickConfiguration → picks
  if (args.filter?.conditionId) {
    where.pickConfiguration = {
      picks: { some: { conditionId: args.filter.conditionId.toLowerCase() } },
    };
  }
  if (args.filter?.conditionIds?.length) {
    where.pickConfiguration = {
      picks: {
        some: {
          conditionId: {
            in: args.filter.conditionIds.map((id) => id.toLowerCase()),
          },
        },
      },
    };
  }
  if (args.filter?.endsAt) {
    const r: Prisma.IntFilter = {};
    if (args.filter.endsAt.gte != null) r.gte = args.filter.endsAt.gte;
    if (args.filter.endsAt.lte != null) r.lte = args.filter.endsAt.lte;
    where.pickConfiguration = {
      ...(where.pickConfiguration as any),
      endsAt: r,
    };
  }

  const cursorPayload = args.after ? decodeCursor(args.after) : null;
  let pageWhere: Prisma.PredictionWhereInput = where;
  if (cursorPayload) {
    const op = direction === 'desc' ? 'lt' : 'gt';
    const keyValue =
      field === 'createdAt'
        ? new Date(cursorPayload.k)
        : Number(cursorPayload.k);
    pageWhere = {
      AND: [
        where,
        {
          OR: [
            { [field]: { [op]: keyValue } } as Prisma.PredictionWhereInput,
            {
              AND: [
                {
                  [field]: { equals: keyValue },
                } as Prisma.PredictionWhereInput,
                { id: { [op]: Number(cursorPayload.id) } },
              ],
            },
          ],
        },
      ],
    };
  }

  const [rows, totalCount] = await Promise.all([
    prisma.prediction.findMany({
      where: pageWhere,
      orderBy: [{ [field]: direction } as any, { id: direction }],
      include: { pickConfiguration: { include: { picks: true } } },
      take: first + 1,
    }),
    prisma.prediction.count({ where }),
  ]);

  const hasNextPage = rows.length > first;
  const pageRows = hasNextPage ? rows.slice(0, first) : rows;
  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({
      k:
        field === 'createdAt'
          ? row.createdAt.toISOString()
          : String((row as any)[field] ?? 0),
      id: String(row.id),
    }),
  }));

  return {
    edges,
    nodes: pageRows,
    totalCount,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};
