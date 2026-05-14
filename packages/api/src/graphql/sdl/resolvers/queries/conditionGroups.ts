/**
 * Query.conditionGroupsPage — paginated condition group list with a
 * typed `ConditionGroupFilters` input. Replaces the deprecated bare
 * `conditionGroups(where:)` Prisma-style query for client-facing
 * pagination.
 *
 * Filters supported:
 *   - `ids: [Int!]` — restrict to a known set of group IDs.
 *   - `search: String` — case-insensitive substring match on `name`.
 *   - `categorySlugs: [String!]` — restrict to groups whose Category
 *     slug is in this set.
 *   - `chainId: Int` — restrict to groups that have at least one
 *     Condition on this chain. Implemented as
 *     `conditions: { some: { chainId } }`.
 *   - `publicOnly: Boolean` — when true, require at least one public
 *     Condition on the group.
 *   - `includeEmpty: Boolean` — when false (default), groups with no
 *     Conditions are filtered out via `conditions: { some: {} }`. When
 *     true, all groups pass.
 *
 * ConditionGroup itself has no `public` flag — visibility lives on the
 * nested Condition rows, so chain/visibility/non-empty filters are
 * pushed down via `conditions: { some: { ... } }`.
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
  const f = filters ?? {};
  const and: Where[] = [];

  if (f.ids && f.ids.length > 0) {
    and.push({ id: { in: f.ids } });
  }
  if (f.search?.trim()) {
    and.push({
      name: { contains: f.search.trim(), mode: 'insensitive' },
    });
  }
  if (f.categorySlugs && f.categorySlugs.length > 0) {
    and.push({
      category: { is: { slug: { in: f.categorySlugs } } },
    });
  }

  // chainId / publicOnly / non-empty are all expressed as
  // `condition: { some: { ... } }` (the relation on ConditionGroup is
  // singular `condition` in the Prisma model). Combine into a single
  // `some:` so the same Condition row must satisfy every constraint —
  // a row matching one filter and a different row matching another
  // doesn't count.
  const someConstraints: Prisma.ConditionWhereInput = {};
  if (f.chainId != null) someConstraints.chainId = f.chainId;
  if (f.publicOnly === true) someConstraints.public = true;

  const includeEmpty = f.includeEmpty === true;
  if (!includeEmpty || Object.keys(someConstraints).length > 0) {
    and.push({ condition: { some: someConstraints } });
  }

  return and.length > 0 ? { AND: and } : {};
};

export const conditionGroup: NonNullable<
  QueryResolvers['conditionGroup']
> = async (_parent, { where }) =>
  prisma.conditionGroup.findUnique({
    where: where as unknown as Prisma.ConditionGroupWhereUniqueInput,
  });

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
  return {
    items: rawRows.slice(0, cappedTake),
    hasMore,
    totalCount: null,
    _countWhere: where,
  };
};
