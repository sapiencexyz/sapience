/**
 * `pickConfiguration(pickConfigId:)` / `pickConfigurations(...)`.
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
  withCursorWhere,
} from '../../relay/connection';

export const pickConfiguration: NonNullable<
  QueryResolvers['pickConfiguration']
> = async (_parent, { pickConfigId }) =>
  prisma.picks.findUnique({
    where: { id: pickConfigId.toLowerCase() },
    include: { picks: true },
  });

const FIELD_TO_PRISMA: Record<string, 'createdAt' | 'endsAt' | 'resolvedAt'> = {
  CREATED_AT: 'createdAt',
  ENDS_AT: 'endsAt',
  RESOLVED_AT: 'resolvedAt',
};

export const pickConfigurations: NonNullable<
  QueryResolvers['pickConfigurations']
> = async (_parent, args) => {
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'CREATED_AT'];
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');

  const where: Prisma.PicksWhereInput = {};
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.resolved != null) where.resolved = args.filter.resolved;
  if (args.filter?.result)
    where.result = args.filter.result as Prisma.PicksWhereInput['result'];
  if (args.filter?.resultIn?.length)
    where.result = {
      in: args.filter.resultIn as Prisma.EnumSettlementResultFilter['in'],
    };
  if (args.filter?.tokens?.length) {
    const lc = args.filter.tokens.map((t) => t.toLowerCase());
    where.OR = [
      { predictorToken: { in: lc } },
      { counterpartyToken: { in: lc } },
    ];
  }

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.PicksWhereInput>({
        orderField: field,
        orderValue:
          field === 'createdAt' ? new Date(cursor.k) : Number(cursor.k),
        idField: 'id',
        idValue: cursor.id,
        direction,
      })
    : null;

  const rows = await prisma.picks.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [
      { [field]: direction } as Prisma.PicksOrderByWithRelationInput,
      { id: direction },
    ],
    include: { picks: true },
    take: first + 1,
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.picks.count({ where }),
    getCursor: (row) =>
      encodeCursor({
        k:
          field === 'createdAt'
            ? row.createdAt.toISOString()
            : String(row[field as keyof typeof row] ?? 0),
        id: row.id,
      }),
  });
};
