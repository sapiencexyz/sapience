/**
 * Query.conditionGroupsPage — paginated condition group list with a
 * flat `ConditionGroupFilters` input. Replaces the deprecated bare
 * `conditionGroups(where:)` Prisma-style query for client-facing
 * pagination.
 *
 * Filters supported:
 *   - `ids: [Int!]` — restrict to a known set of group IDs (the
 *     migration target for batch-by-id callers).
 *
 * No public/private safety net is needed here: ConditionGroup itself
 * has no `public` flag — visibility is enforced on the nested
 * `Condition` rows via `ConditionGroup.conditions` resolver.
 */

import type { Prisma } from '../../../../../generated/prisma';
import type {
  QueryResolvers,
  QueryConditionGroupsPageArgs,
  ConditionGroupFilters,
} from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { clampSkip, clampTake } from './pagination';

type Where = Prisma.ConditionGroupWhereInput;

const buildConditionGroupsWhereFromFilters = (
  filters: ConditionGroupFilters | null | undefined
): Where => {
  if (!filters) return {};
  const and: Where[] = [];
  if (filters.ids && filters.ids.length > 0) {
    and.push({ id: { in: filters.ids } });
  }
  return and.length > 0 ? { AND: and } : {};
};

export const conditionGroup: NonNullable<
  QueryResolvers['conditionGroup']
> = async (_parent, { id }) =>
  prisma.conditionGroup.findUnique({ where: { id } });

export const conditionGroupsPage: NonNullable<
  QueryResolvers['conditionGroupsPage']
> = async (_parent, { filters, take, skip }: QueryConditionGroupsPageArgs) => {
  const cappedTake = clampTake(take, { defaultTake: 50, maxTake: 100 });
  const skipVal = clampSkip(skip);
  const where = buildConditionGroupsWhereFromFilters(filters);

  const rawRows = await prisma.conditionGroup.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: cappedTake + 1,
    skip: skipVal,
  });
  const hasMore = rawRows.length > cappedTake;
  return { items: rawRows.slice(0, cappedTake), hasMore };
};
