/**
 * `claim(id:)` / `claims(...)` and `close(id:)` / `closes(...)`.
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

const decodeRowId = (
  id: string,
  expectedType: 'Claim' | 'Close'
): number | null => {
  const parts = tryFromGlobalIdV2(id);
  if (!parts || parts.type !== expectedType) return null;
  const rowId = Number(parts.id);
  return Number.isInteger(rowId) ? rowId : null;
};

// ---- Claim ----

export const claim: NonNullable<QueryResolvers['claim']> = async (
  _parent,
  { id }
) => {
  const rowId = decodeRowId(id, 'Claim');
  if (rowId == null) return null;
  return prisma.claim.findUnique({ where: { id: rowId } });
};

export const claims: NonNullable<QueryResolvers['claims']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');

  const where: Prisma.ClaimWhereInput = {};
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.holder) where.holder = args.filter.holder.toLowerCase();
  if (args.filter?.predictionId)
    where.predictionId = args.filter.predictionId.toLowerCase();

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.ClaimWhereInput>({
        orderField: 'redeemedAt',
        orderValue: Number(cursor.k),
        idField: 'id',
        idValue: Number(cursor.id),
        direction,
      })
    : null;

  const rows = await prisma.claim.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [{ redeemedAt: direction }, { id: direction }],
    take: first + 1,
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.claim.count({ where }),
    getCursor: (row) =>
      encodeCursor({ k: String(row.redeemedAt), id: String(row.id) }),
  });
};

// ---- Close ----

export const close: NonNullable<QueryResolvers['close']> = async (
  _parent,
  { id }
) => {
  const rowId = decodeRowId(id, 'Close');
  if (rowId == null) return null;
  return prisma.close.findUnique({ where: { id: rowId } });
};

export const closes: NonNullable<QueryResolvers['closes']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');

  const where: Prisma.CloseWhereInput = {};
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.pickConfigId)
    where.pickConfigId = args.filter.pickConfigId.toLowerCase();
  if (args.filter?.participant) {
    const addr = args.filter.participant.toLowerCase();
    where.OR = [{ predictorHolder: addr }, { counterpartyHolder: addr }];
  }

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.CloseWhereInput>({
        orderField: 'burnedAt',
        orderValue: Number(cursor.k),
        idField: 'id',
        idValue: Number(cursor.id),
        direction,
      })
    : null;

  const rows = await prisma.close.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [{ burnedAt: direction }, { id: direction }],
    take: first + 1,
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.close.count({ where }),
    getCursor: (row) =>
      encodeCursor({ k: String(row.burnedAt), id: String(row.id) }),
  });
};
