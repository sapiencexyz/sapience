/**
 * `condition(conditionId:)` / `conditions(...)` — CTF condition lookups.
 *
 * Cursor key tracks the selected `orderBy.field`; `(field, id)` is the
 * tie-broken keyset. On-chain `conditionId` is unique, so the tie-break
 * is canonical.
 *
 * `OPEN_INTEREST` is stored as a VarChar-encoded bigint and can't be
 * keyset-compared in SQL without a numeric cast, so that orderBy mode
 * falls back to offset paging (cursor `k` is an integer offset).
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

export const condition: NonNullable<QueryResolvers['condition']> = async (
  _parent,
  { conditionId }
) =>
  prisma.condition.findUnique({
    where: { id: conditionId.toLowerCase() },
  });

const FIELD_TO_PRISMA: Record<
  string,
  'createdAt' | 'endTime' | 'displayOrder' | 'openInterest'
> = {
  CREATED_AT: 'createdAt',
  END_TIME: 'endTime',
  DISPLAY_ORDER: 'displayOrder',
  OPEN_INTEREST: 'openInterest',
};

const projectOutcomeFilter = (
  outcome?: 'YES' | 'NO' | 'NON_DECISIVE' | null,
  settled?: boolean | null
): Prisma.ConditionWhereInput => {
  if (outcome != null) {
    const base: Prisma.ConditionWhereInput = { settled: true };
    if (outcome === 'YES')
      return { ...base, resolvedToYes: true, nonDecisive: false };
    if (outcome === 'NO')
      return { ...base, resolvedToYes: false, nonDecisive: false };
    return { ...base, nonDecisive: true };
  }
  if (settled === true) return { settled: true };
  if (settled === false) return { settled: false };
  return {};
};

export const conditions: NonNullable<QueryResolvers['conditions']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'END_TIME'];
  const direction = normalizeDirection(args.orderBy?.direction, 'asc');

  const where: Prisma.ConditionWhereInput = {
    ...projectOutcomeFilter(args.filter?.outcome, args.filter?.settled),
  };
  if (args.filter?.conditionIds?.length)
    where.id = { in: args.filter.conditionIds.map((id) => id.toLowerCase()) };
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.categorySlug)
    where.category = { is: { slug: args.filter.categorySlug } };
  if (args.filter?.public != null) where.public = args.filter.public;
  if (args.filter?.tags?.length) where.tags = { hasSome: args.filter.tags };
  if (args.filter?.search?.trim()) {
    const q = args.filter.search.trim();
    where.OR = [
      { question: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (args.filter?.endTime) {
    const r: Prisma.IntFilter = {};
    if (args.filter.endTime.gte != null) r.gte = args.filter.endTime.gte;
    if (args.filter.endTime.lte != null) r.lte = args.filter.endTime.lte;
    where.endTime = r;
  }

  const cursor = args.after ? decodeCursor(args.after) : null;
  const usesOffset = field === 'openInterest';
  const skip = cursor && usesOffset ? Number(cursor.k) + 1 : 0;
  const cursorWhere =
    cursor && !usesOffset
      ? buildKeysetWhere<Prisma.ConditionWhereInput>({
          orderField: field,
          orderValue:
            field === 'createdAt' ? new Date(cursor.k) : Number(cursor.k),
          idField: 'id',
          idValue: cursor.id,
          direction,
        })
      : null;

  const rows = await prisma.condition.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [
      { [field]: direction } as Prisma.ConditionOrderByWithRelationInput,
      { id: direction },
    ],
    take: first + 1,
    skip: skip || undefined,
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.condition.count({ where }),
    getCursor: (row, idx) => {
      const k = usesOffset
        ? String(skip + idx)
        : field === 'createdAt'
          ? row.createdAt.toISOString()
          : String(row[field as keyof typeof row]);
      return encodeCursor({ k, id: row.id });
    },
  });
};
