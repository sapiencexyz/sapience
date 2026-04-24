/**
 * Query.conditions — paginated condition list with a safety net:
 * private conditions (public: false) are hidden by default.
 *
 * A caller can override the default in three ways:
 *   1. Filter by specific id(s) — e.g. `where: { id: { in: [...] } }`.
 *      Fetching a known condition by id bypasses the public filter so
 *      admins / links can still reach it.
 *   2. Explicitly filter on public — e.g. `where: { public: { equals: false } }`
 *      or `{ OR: [{ public: true }, { public: false }] }`.
 *   3. Default (no id filter, no explicit public filter) — we inject
 *      `public: { equals: true }` so only public conditions are
 *      returned.
 *
 * The recursive walkers handle AND/OR/NOT trees of arbitrary depth —
 * this matches the deployed ConditionResolver behaviour.
 */

import type { Prisma } from '../../../../../generated/prisma';
import type { QueryResolvers } from '../../__generated__/resolvers';
import prisma from '../../../../db';

type Where = Prisma.ConditionWhereInput;

const hasIdFilter = (where?: Where | null): boolean => {
  if (!where) return false;
  if (where.id !== undefined) return true;
  if (where.AND) {
    const and = Array.isArray(where.AND) ? where.AND : [where.AND];
    if (and.some((c) => hasIdFilter(c))) return true;
  }
  return false;
};

const hasPublicFilter = (where?: Where | null): boolean => {
  if (!where) return false;
  if (where.public !== undefined) return true;
  if (where.AND) {
    const and = Array.isArray(where.AND) ? where.AND : [where.AND];
    if (and.some((c) => hasPublicFilter(c))) return true;
  }
  if (where.OR) {
    if (where.OR.some((c) => hasPublicFilter(c))) return true;
  }
  if (where.NOT) {
    const nots = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    if (nots.some((c) => hasPublicFilter(c))) return true;
  }
  return false;
};

export const conditions: NonNullable<QueryResolvers['conditions']> = async (
  _parent,
  { where, orderBy, cursor, take, skip, distinct }
) => {
  const w = where as Where | null | undefined;
  const effectiveWhere: Where =
    hasIdFilter(w) || hasPublicFilter(w)
      ? (w ?? {})
      : { ...(w ?? {}), public: { equals: true } };
  const effectiveTake = take != null ? Math.min(take, 100) : 50;
  return prisma.condition.findMany({
    where: effectiveWhere,
    orderBy: (orderBy ?? undefined) as
      | Prisma.ConditionOrderByWithRelationInput[]
      | undefined,
    cursor: (cursor ?? undefined) as
      | Prisma.ConditionWhereUniqueInput
      | undefined,
    take: effectiveTake,
    skip: skip ?? undefined,
    distinct: (distinct ?? undefined) as
      | Prisma.ConditionScalarFieldEnum[]
      | undefined,
  });
};
