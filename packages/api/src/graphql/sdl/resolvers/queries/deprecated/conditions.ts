/**
 * Deprecated `conditions(where:)` resolver — accepts the full Prisma-
 * style where/orderBy/cursor/take/skip/distinct surface. Replaced by
 * `conditionsPage(filters:)` which exposes a flat, purpose-built
 * `ConditionFilters` input.
 *
 * The default-public safety net is preserved: callers that filter by
 * specific id(s) bypass the public filter (so admins / direct links
 * can fetch private conditions); otherwise the resolver injects
 * `public: true`.
 */

import type { Prisma } from '../../../../../../generated/prisma';
import type { QueryResolvers } from '../../../__generated__/resolvers';
import { logDeprecatedHit } from '../../../../../lib/deprecationTelemetry';
import prisma from '../../../../../core/db';

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
  logDeprecatedHit('conditions');
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
