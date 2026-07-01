/**
 * `prediction(predictionId:)` / `predictions(...)`.
 *
 * Condition / endsAt filters route through the pickConfiguration join.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import type { QueryResolvers } from '../../__generated__/resolvers';
import {
  buildConnection,
  buildKeysetWhere,
  clampTake,
  decodeCursor,
  encodeCursor,
  normalizeDirection,
  timestampCursorArgs,
  withCursorWhere,
} from '../../relay/connection';

export const prediction: NonNullable<QueryResolvers['prediction']> = async (
  _parent,
  { predictionId }
) =>
  prisma.prediction.findUnique({
    where: { predictionId: predictionId.toLowerCase() },
    include: { pickConfiguration: { include: { picks: true } } },
  });

const FIELD_TO_PRISMA: Record<string, 'createdAt' | 'settledAt'> = {
  CREATED_AT: 'createdAt',
  SETTLED_AT: 'settledAt',
};

export const predictions: NonNullable<QueryResolvers['predictions']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 25, { defaultTake: 25, maxTake: 25 });
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
  if (args.filter?.settled != null) where.settled = args.filter.settled;
  if (args.filter?.results?.length)
    where.result = {
      in: args.filter.results as Prisma.EnumSettlementResultFilter['in'],
    };

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
      ...(where.pickConfiguration as Prisma.PicksWhereInput | undefined),
      endsAt: r,
    };
  }

  // Keyset soundness: settledAt is nullable; exclude NULL-keyed rows so the
  // (settledAt, id) keyset is a total order (applied to every page).
  if (field === 'settledAt') {
    where.settledAt = { not: null };
  }

  const isCreatedAt = field === 'createdAt';
  const cursor = args.after ? decodeCursor(args.after) : null;
  // createdAt is Timestamp(6); a JS-Date keyset loses microseconds, so page it
  // via Prisma's native id cursor. settledAt keeps the value keyset (the
  // NULL-exclusion above keeps that a total order).
  const cursorWhere =
    cursor && !isCreatedAt
      ? buildKeysetWhere<Prisma.PredictionWhereInput>({
          orderField: field,
          orderValue: Number(cursor.k),
          idField: 'id',
          idValue: Number(cursor.id),
          direction,
        })
      : null;

  const rows = await prisma.prediction.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [
      { [field]: direction } as Prisma.PredictionOrderByWithRelationInput,
      { id: direction },
    ],
    include: { pickConfiguration: { include: { picks: true } } },
    take: first + 1,
    ...(isCreatedAt ? timestampCursorArgs(args.after, Number) : {}),
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.prediction.count({ where }),
    getCursor: (row) =>
      encodeCursor({
        k:
          field === 'createdAt'
            ? row.createdAt.toISOString()
            : String(row[field as keyof typeof row] ?? 0),
        id: String(row.id),
      }),
  });
};
