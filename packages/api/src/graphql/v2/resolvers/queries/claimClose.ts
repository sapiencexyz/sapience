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

// ---- Claim ----

const decodeClaimKey = (
  id: string
): { chainId: number; txHash: string; logIndex: number } | null => {
  const parts = tryFromGlobalIdV2(id);
  if (!parts || parts.type !== 'Claim') return null;
  const [chainId, txHash, logIndex] = parts.id.split(':');
  const c = Number(chainId);
  const l = Number(logIndex);
  if (!txHash || !Number.isInteger(c) || !Number.isInteger(l)) return null;
  return { chainId: c, txHash, logIndex: l };
};

export const claim: NonNullable<QueryResolvers['claim']> = async (
  _parent,
  { id }
) => {
  const key = decodeClaimKey(id);
  if (!key) return null;
  return prisma.claim.findUnique({ where: { chainId_txHash_logIndex: key } });
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

const decodeCloseKey = (
  id: string
): { chainId: number; txHash: string; pickConfigId: string } | null => {
  const parts = tryFromGlobalIdV2(id);
  if (!parts || parts.type !== 'Close') return null;
  const [chainId, txHash, pickConfigId] = parts.id.split(':');
  const c = Number(chainId);
  if (!txHash || !pickConfigId || !Number.isInteger(c)) return null;
  return { chainId: c, txHash, pickConfigId };
};

export const close: NonNullable<QueryResolvers['close']> = async (
  _parent,
  { id }
) => {
  const key = decodeCloseKey(id);
  if (!key) return null;
  return prisma.close.findUnique({
    where: { chainId_txHash_pickConfigId: key },
  });
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
