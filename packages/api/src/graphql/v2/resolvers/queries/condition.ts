/**
 * `condition(conditionId:)` / `conditions(...)` — CTF condition lookups.
 *
 * Cursor key tracks the selected `orderBy.field`; `(field, id)` is the
 * tie-broken keyset. On-chain `conditionId` is unique, so the tie-break
 * is canonical.
 *
 * `OPEN_INTEREST` is stored as a VarChar-encoded bigint and can't be
 * keyset-compared in SQL without a numeric cast, so that orderBy mode
 * falls back to offset paging (cursor `k` is an integer offset) and
 * uses a raw `ORDER BY "openInterest"::numeric` query.
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
  offsetFromCursor,
  timestampCursorArgs,
  withCursorWhere,
} from '../../relay/connection';
import { findConditionsOrderByOpenInterest } from './conditionOpenInterest';
import { buildConditionListFilters } from './conditionListFilters';

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

export const conditions: NonNullable<QueryResolvers['conditions']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 25, { defaultTake: 25, maxTake: 25 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'END_TIME'];
  const direction = normalizeDirection(args.orderBy?.direction, 'asc');

  const { where, whereSql, needsCategoryJoin } = buildConditionListFilters(
    args,
    field
  );

  const cursor = args.after ? decodeCursor(args.after) : null;
  const usesOffset = field === 'openInterest';
  const isCreatedAt = field === 'createdAt';
  // Guard the offset against a foreign/garbage `k` (e.g. a keyset cursor
  // minted under a different orderBy): offsetFromCursor resets to 0 instead
  // of producing NaN, which would stick pagination and emit "NaN" cursors.
  const skip = usesOffset ? offsetFromCursor(args.after) : 0;
  // createdAt is Timestamp(6); a JS-Date keyset loses microseconds and would
  // duplicate same-millisecond rows, so page createdAt via Prisma's native id
  // cursor. endTime / displayOrder are integers and keep the value keyset.
  const cursorWhere =
    cursor && !usesOffset && !isCreatedAt
      ? buildKeysetWhere<Prisma.ConditionWhereInput>({
          orderField: field,
          orderValue: Number(cursor.k),
          idField: 'id',
          idValue: cursor.id,
          direction,
        })
      : null;

  const effectiveWhere = withCursorWhere(where, cursorWhere);

  const rows =
    field === 'openInterest'
      ? await findConditionsOrderByOpenInterest({
          whereSql,
          needsCategoryJoin,
          direction,
          take: first + 1,
          skip,
        })
      : await prisma.condition.findMany({
          where: effectiveWhere,
          orderBy: [
            { [field]: direction } as Prisma.ConditionOrderByWithRelationInput,
            { id: direction },
          ],
          take: first + 1,
          ...(isCreatedAt
            ? timestampCursorArgs(args.after, (s) => s)
            : { skip: skip || undefined }),
        });

  return buildConnection({
    rows,
    first,
    // Count the full filtered set with the BASE where — NOT effectiveWhere,
    // which folds in the cursor predicate and would make totalCount shrink to
    // "rows after the cursor" on every paged request (Relay totalCount must be
    // stable across pages).
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
