/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `prediction(predictionId:)` / `predictions(...)`.
 *
 * Condition / endsAt filters route through the pickConfiguration join.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import {
  buildConnection,
  buildKeysetWhere,
  clampTake,
  decodeCursor,
  encodeCursor,
  normalizeDirection,
  withCursorWhere,
} from '../../relay/connection';

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
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'CREATED_AT'];
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');

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

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.PredictionWhereInput>({
        orderField: field,
        orderValue:
          field === 'createdAt' ? new Date(cursor.k) : Number(cursor.k),
        idField: 'id',
        idValue: Number(cursor.id),
        direction,
      })
    : null;

  const [rows, totalCount] = await Promise.all([
    prisma.prediction.findMany({
      where: withCursorWhere(where, cursorWhere),
      orderBy: [{ [field]: direction } as any, { id: direction }],
      include: { pickConfiguration: { include: { picks: true } } },
      take: first + 1,
    }),
    prisma.prediction.count({ where }),
  ]);

  return buildConnection({
    rows,
    first,
    totalCount,
    getCursor: (row) =>
      encodeCursor({
        k:
          field === 'createdAt'
            ? row.createdAt.toISOString()
            : String((row as any)[field] ?? 0),
        id: String(row.id),
      }),
  });
};
