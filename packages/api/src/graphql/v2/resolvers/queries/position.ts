/**
 * `position(id:)` / `positions(...)`.
 *
 * `position(id:)` takes a globalId (opaque) and decodes it. The
 * `conditionId` / `endsAt` / `result` / `settled` filters all route
 * through the pickConfiguration join.
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
import { tryFromGlobalIdV2 } from '../../relay/nodeRegistry';

export const position: NonNullable<QueryResolvers['position']> = async (
  _parent,
  { id }
) => {
  const parts = tryFromGlobalIdV2(id);
  if (!parts || parts.type !== 'Position') return null;
  const rowId = Number(parts.id);
  if (!Number.isInteger(rowId)) return null;
  return prisma.position.findUnique({
    where: { id: rowId },
    include: { pickConfiguration: { include: { picks: true } } },
  });
};

const FIELD_TO_PRISMA: Record<string, 'createdAt' | 'updatedAt'> = {
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
};

export const positions: NonNullable<QueryResolvers['positions']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'UPDATED_AT'];
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');

  const where: Prisma.PositionWhereInput = {};
  if (args.filter?.holder) where.holder = args.filter.holder.toLowerCase();
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.pickConfigId)
    where.pickConfigId = args.filter.pickConfigId.toLowerCase();

  const pickConfigFilter: Prisma.PicksWhereInput = {};
  let hasPickConfigFilter = false;
  if (args.filter?.conditionId) {
    pickConfigFilter.picks = {
      some: { conditionId: args.filter.conditionId.toLowerCase() },
    };
    hasPickConfigFilter = true;
  }
  if (args.filter?.result?.equals) {
    pickConfigFilter.result = args.filter.result
      .equals as Prisma.PicksWhereInput['result'];
    hasPickConfigFilter = true;
  }
  if (args.filter?.result?.in?.length) {
    pickConfigFilter.result = {
      in: args.filter.result.in as Prisma.EnumSettlementResultFilter['in'],
    };
    hasPickConfigFilter = true;
  }
  if (args.filter?.settled != null) {
    pickConfigFilter.resolved = args.filter.settled;
    hasPickConfigFilter = true;
  }
  if (args.filter?.endsAt) {
    const r: Prisma.IntFilter = {};
    if (args.filter.endsAt.gte != null) r.gte = args.filter.endsAt.gte;
    if (args.filter.endsAt.lte != null) r.lte = args.filter.endsAt.lte;
    pickConfigFilter.endsAt = r;
    hasPickConfigFilter = true;
  }
  if (hasPickConfigFilter) where.pickConfiguration = pickConfigFilter;

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.PositionWhereInput>({
        orderField: field,
        orderValue: new Date(cursor.k),
        idField: 'id',
        idValue: Number(cursor.id),
        direction,
      })
    : null;

  const rows = await prisma.position.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [
      { [field]: direction } as Prisma.PositionOrderByWithRelationInput,
      { id: direction },
    ],
    include: { pickConfiguration: { include: { picks: true } } },
    take: first + 1,
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.position.count({ where }),
    getCursor: (row) =>
      encodeCursor({
        k: row[field].toISOString(),
        id: String(row.id),
      }),
  });
};
