/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `position(id:)` / `positions(...)`.
 *
 * `position(id:)` takes a globalId (opaque) and decodes it. The
 * `conditionId` / `endsAt` / `result` / `settled` filters all route
 * through the pickConfiguration join.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { clampTake } from '../../../sdl/resolvers/queries/pagination';
import { tryFromGlobalIdV2 } from '../../relay/nodeRegistry';

export const position = async (_parent: unknown, { id }: { id: string }) => {
  const parts = tryFromGlobalIdV2(id);
  if (!parts || parts.type !== 'Position') return null;
  const rowId = Number(parts.id);
  if (!Number.isInteger(rowId)) return null;
  return prisma.position.findUnique({
    where: { id: rowId },
    include: { pickConfiguration: { include: { picks: true } } },
  });
};

type Field = 'CREATED_AT' | 'UPDATED_AT';
const FIELD_TO_PRISMA: Record<Field, 'createdAt' | 'updatedAt'> = {
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
};

export const positions = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      holder?: string | null;
      chainId?: number | null;
      conditionId?: string | null;
      pickConfigId?: string | null;
      result?: { equals?: string | null; in?: string[] | null } | null;
      settled?: boolean | null;
      endsAt?: { gte?: number | null; lte?: number | null } | null;
    } | null;
    orderBy?: { field: Field; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'UPDATED_AT'];
  const direction: 'asc' | 'desc' =
    String(args.orderBy?.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';

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
    pickConfigFilter.result = args.filter.result.equals as any;
    hasPickConfigFilter = true;
  }
  if (args.filter?.result?.in?.length) {
    pickConfigFilter.result = { in: args.filter.result.in as any[] };
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

  const cursorPayload = args.after ? decodeCursor(args.after) : null;
  let pageWhere: Prisma.PositionWhereInput = where;
  if (cursorPayload) {
    const op = direction === 'desc' ? 'lt' : 'gt';
    const keyValue = new Date(cursorPayload.k);
    pageWhere = {
      AND: [
        where,
        {
          OR: [
            { [field]: { [op]: keyValue } } as Prisma.PositionWhereInput,
            {
              AND: [
                { [field]: { equals: keyValue } } as Prisma.PositionWhereInput,
                { id: { [op]: Number(cursorPayload.id) } },
              ],
            },
          ],
        },
      ],
    };
  }

  const [rows, totalCount] = await Promise.all([
    prisma.position.findMany({
      where: pageWhere,
      orderBy: [{ [field]: direction } as any, { id: direction }],
      include: { pickConfiguration: { include: { picks: true } } },
      take: first + 1,
    }),
    prisma.position.count({ where }),
  ]);

  const hasNextPage = rows.length > first;
  const pageRows = hasNextPage ? rows.slice(0, first) : rows;
  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({
      k: (row as any)[field].toISOString(),
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
