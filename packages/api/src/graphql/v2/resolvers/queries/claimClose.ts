/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `claim(id:)` / `claims(...)` and `close(id:)` / `closes(...)`.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { clampTake } from '../../../sdl/resolvers/queries/pagination';
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

export const claim = async (_parent: unknown, { id }: { id: string }) => {
  const rowId = decodeRowId(id, 'Claim');
  if (rowId == null) return null;
  return prisma.claim.findUnique({ where: { id: rowId } });
};

export const claims = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      chainId?: number | null;
      holder?: string | null;
      predictionId?: string | null;
    } | null;
    orderBy?: { field: 'REDEEMED_AT'; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
  const direction: 'asc' | 'desc' =
    String(args.orderBy?.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';

  const where: Prisma.ClaimWhereInput = {};
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.holder) where.holder = args.filter.holder.toLowerCase();
  if (args.filter?.predictionId)
    where.predictionId = args.filter.predictionId.toLowerCase();

  const cursorPayload = args.after ? decodeCursor(args.after) : null;
  let pageWhere: Prisma.ClaimWhereInput = where;
  if (cursorPayload) {
    const op = direction === 'desc' ? 'lt' : 'gt';
    const keyValue = Number(cursorPayload.k);
    pageWhere = {
      AND: [
        where,
        {
          OR: [
            { redeemedAt: { [op]: keyValue } },
            {
              AND: [
                { redeemedAt: { equals: keyValue } },
                { id: { [op]: Number(cursorPayload.id) } },
              ],
            },
          ],
        },
      ],
    };
  }

  const [rows, totalCount] = await Promise.all([
    prisma.claim.findMany({
      where: pageWhere,
      orderBy: [{ redeemedAt: direction }, { id: direction }],
      take: first + 1,
    }),
    prisma.claim.count({ where }),
  ]);

  const hasNextPage = rows.length > first;
  const pageRows = hasNextPage ? rows.slice(0, first) : rows;
  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({ k: String(row.redeemedAt), id: String(row.id) }),
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

// ---- Close ----

export const close = async (_parent: unknown, { id }: { id: string }) => {
  const rowId = decodeRowId(id, 'Close');
  if (rowId == null) return null;
  return prisma.close.findUnique({ where: { id: rowId } });
};

export const closes = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      chainId?: number | null;
      pickConfigId?: string | null;
      participant?: string | null;
    } | null;
    orderBy?: { field: 'BURNED_AT'; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
  const direction: 'asc' | 'desc' =
    String(args.orderBy?.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';

  const where: Prisma.CloseWhereInput = {};
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.pickConfigId)
    where.pickConfigId = args.filter.pickConfigId.toLowerCase();
  if (args.filter?.participant) {
    const addr = args.filter.participant.toLowerCase();
    where.OR = [{ predictorHolder: addr }, { counterpartyHolder: addr }];
  }

  const cursorPayload = args.after ? decodeCursor(args.after) : null;
  let pageWhere: Prisma.CloseWhereInput = where;
  if (cursorPayload) {
    const op = direction === 'desc' ? 'lt' : 'gt';
    const keyValue = Number(cursorPayload.k);
    pageWhere = {
      AND: [
        where,
        {
          OR: [
            { burnedAt: { [op]: keyValue } },
            {
              AND: [
                { burnedAt: { equals: keyValue } },
                { id: { [op]: Number(cursorPayload.id) } },
              ],
            },
          ],
        },
      ],
    };
  }

  const [rows, totalCount] = await Promise.all([
    prisma.close.findMany({
      where: pageWhere,
      orderBy: [{ burnedAt: direction }, { id: direction }],
      take: first + 1,
    }),
    prisma.close.count({ where }),
  ]);

  const hasNextPage = rows.length > first;
  const pageRows = hasNextPage ? rows.slice(0, first) : rows;
  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({ k: String(row.burnedAt), id: String(row.id) }),
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
