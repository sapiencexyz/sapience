/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `pickConfiguration(pickConfigId:)` / `pickConfigurations(...)`.
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

export const pickConfiguration = async (
  _parent: unknown,
  { pickConfigId }: { pickConfigId: string }
) =>
  prisma.picks.findUnique({
    where: { id: pickConfigId.toLowerCase() },
    include: { picks: true },
  });

type Field = 'CREATED_AT' | 'ENDS_AT' | 'RESOLVED_AT';
const FIELD_TO_PRISMA: Record<Field, 'createdAt' | 'endsAt' | 'resolvedAt'> = {
  CREATED_AT: 'createdAt',
  ENDS_AT: 'endsAt',
  RESOLVED_AT: 'resolvedAt',
};

export const pickConfigurations = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      chainId?: number | null;
      resolved?: boolean | null;
      result?: { equals?: string | null; in?: string[] | null } | null;
      tokens?: string[] | null;
    } | null;
    orderBy?: { field: Field; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'CREATED_AT'];
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');

  const where: Prisma.PicksWhereInput = {};
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.resolved != null) where.resolved = args.filter.resolved;
  if (args.filter?.result?.equals)
    where.result = args.filter.result.equals as any;
  if (args.filter?.result?.in?.length)
    where.result = { in: args.filter.result.in as any[] };
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

  const [rows, totalCount] = await Promise.all([
    prisma.picks.findMany({
      where: withCursorWhere(where, cursorWhere),
      orderBy: [{ [field]: direction } as any, { id: direction }],
      include: { picks: true },
      take: first + 1,
    }),
    prisma.picks.count({ where }),
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
        id: row.id,
      }),
  });
};
