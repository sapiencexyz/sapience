/**
 * `Query.conditionsLegacy` — the original bare `conditions(where:)`
 * Prisma-style resolver, renamed to free the canonical `conditions`
 * name for the Relay-shaped connection while still honoring the
 * doc's one-release deprecation window.
 *
 * The default-public safety net is preserved: callers that filter by
 * specific id(s) bypass the public filter (so admins / direct links
 * can fetch private conditions); otherwise the resolver injects
 * `public: { equals: true }`.
 *
 * The recursive walkers handle AND/OR/NOT trees of arbitrary depth —
 * this matches the deployed ConditionResolver behaviour.
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

export const conditionsLegacy: NonNullable<
  QueryResolvers['conditionsLegacy']
> = async (_parent, { where, orderBy, cursor, take, skip, distinct }) => {
  logDeprecatedHit('conditionsLegacy');
  const w = where as Where | null | undefined;
  const effectiveWhere: Where =
    hasIdFilter(w) || hasPublicFilter(w)
      ? (w ?? {})
      : { ...(w ?? {}), public: { equals: true } };
  const effectiveTake = take != null ? Math.min(take, 100) : 50;
  return prisma.condition.findMany({
    where: effectiveWhere,
    orderBy: (orderBy ??
      undefined) as Prisma.ConditionOrderByWithRelationInput[],
    cursor: (cursor ?? undefined) as Prisma.ConditionWhereUniqueInput,
    take: effectiveTake,
    skip: skip ?? undefined,
    distinct: (distinct ?? undefined) as Prisma.ConditionScalarFieldEnum[],
  });
};
