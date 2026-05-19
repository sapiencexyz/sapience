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
  QueryConditionGroupsArgs,
  ConditionGroupFilters,
  ConditionGroupSortField,
  ConditionGroupFilter,
} from '../../__generated__/resolvers';
import {
  ConditionGroupOrderField,
  OrderDirection,
} from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { clampSkip, clampTake } from './pagination';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';

const CONDITION_GROUP_ORDER_FIELD_MAP: Record<ConditionGroupSortField, string> =
  {
    CREATED_AT: 'createdAt',
    MAX_END_TIME: 'maxEndTime',
    TOTAL_OPEN_INTEREST: 'totalOpenInterest',
    TOTAL_PREDICTION_COUNT: 'totalPredictionCount',
  };

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
> = async (
  _parent,
  { filters, orderBy, orderDirection, take, skip }: QueryConditionGroupsPageArgs
) => {
  const cappedTake = clampTake(take, { defaultTake: 50, maxTake: 100 });
  const skipVal = clampSkip(skip);
  const where = buildConditionGroupsWhereFromFilters(filters);

  const direction: 'asc' | 'desc' = orderDirection === 'asc' ? 'asc' : 'desc';
  const orderField =
    (orderBy && CONDITION_GROUP_ORDER_FIELD_MAP[orderBy]) ?? 'createdAt';
  const orderByClause = {
    [orderField]: direction,
  } as Prisma.ConditionGroupOrderByWithRelationInput;

  const rawRows = await prisma.conditionGroup.findMany({
    where,
    orderBy: orderByClause,
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

// ---------------------------------------------------------------------
// Relay-shaped `conditionGroups` connection (PR 2)
// ---------------------------------------------------------------------

/**
 * Map `ConditionGroupOrderField` enum values to the underlying Prisma
 * column. Every value is index-backed (see `IDX_cg_*` declarations).
 */
// `OPEN_INTEREST` intentionally not represented — held back together
// with the Condition-side enum (see SDL docs).
const CONNECTION_ORDER_FIELD_MAP: Record<ConditionGroupOrderField, string> = {
  [ConditionGroupOrderField.CreatedAt]: 'maxCreatedAtEpoch',
  [ConditionGroupOrderField.ResolvesAt]: 'maxEndTime',
  [ConditionGroupOrderField.PredictionCount]: 'totalPredictionCount',
  [ConditionGroupOrderField.SimilarMarketVolume_24H]:
    'totalSimilarMarketVolume24h',
  [ConditionGroupOrderField.SimilarMarketVolume_7D]:
    'totalSimilarMarketVolume7d',
};

const buildConditionGroupsConnectionWhere = (
  filter: ConditionGroupFilter | null | undefined
): Where => {
  // Per-condition predicates (`public: true`, optional `tags hasSome`)
  // are folded into a SINGLE `condition: { some: { ... } }` clause so
  // Prisma requires the *same* child row to satisfy every predicate.
  // Splitting them across two `{ condition: { some } }` clauses would
  // let a private tagged condition + a public untagged sibling combine
  // to match — and the nested `Condition` field resolver would then
  // strip the private row, leaving the group empty in the response.
  const someConstraints: Prisma.ConditionWhereInput = { public: true };
  if (filter?.tags && filter.tags.length > 0) {
    someConstraints.tags = { hasSome: filter.tags };
  }
  const and: Where[] = [{ condition: { some: someConstraints } }];

  if (filter?.search?.trim()) {
    and.push({
      name: { contains: filter.search.trim(), mode: 'insensitive' },
    });
  }
  if (filter?.categoryIds && filter.categoryIds.length > 0) {
    const numericIds = filter.categoryIds
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n));
    if (numericIds.length > 0) {
      and.push({ categoryId: { in: numericIds } });
    }
  }
  return { AND: and };
};

type PrismaConditionGroupPick = {
  id: number;
  createdAt: Date;
  maxCreatedAtEpoch: bigint;
  maxEndTime: number;
  totalPredictionCount: number;
  totalSimilarMarketVolume24h: unknown;
  totalSimilarMarketVolume7d: unknown;
};

const readGroupOrderKey = (
  row: PrismaConditionGroupPick,
  field: ConditionGroupOrderField
): string => {
  switch (field) {
    case ConditionGroupOrderField.CreatedAt:
      return String(row.maxCreatedAtEpoch);
    case ConditionGroupOrderField.ResolvesAt:
      return String(row.maxEndTime);
    case ConditionGroupOrderField.PredictionCount:
      return String(row.totalPredictionCount);
    case ConditionGroupOrderField.SimilarMarketVolume_24H:
      return String(row.totalSimilarMarketVolume24h);
    case ConditionGroupOrderField.SimilarMarketVolume_7D:
      return String(row.totalSimilarMarketVolume7d);
    default:
      return String(row.createdAt);
  }
};

const buildGroupCursorPredicate = (
  k: string,
  cursorId: string,
  prismaOrderField: string,
  direction: 'asc' | 'desc'
): Where => {
  const ltOp = direction === 'desc' ? 'lt' : 'gt';
  const numeric = Number(k);
  const keyValue = Number.isFinite(numeric) ? numeric : k;
  const idNumeric = Number(cursorId);
  return {
    OR: [
      { [prismaOrderField]: { [ltOp]: keyValue } } as Where,
      {
        AND: [
          { [prismaOrderField]: { equals: keyValue } } as Where,
          { id: { [ltOp]: idNumeric } } as Where,
        ],
      },
    ],
  };
};

export const conditionGroups: NonNullable<
  QueryResolvers['conditionGroups']
> = async (
  _parent,
  { first, after, filter, orderBy }: QueryConditionGroupsArgs
) => {
  const cappedFirst = clampTake(first ?? 50, { defaultTake: 50, maxTake: 100 });
  const orderField: ConditionGroupOrderField =
    orderBy?.field ?? ConditionGroupOrderField.CreatedAt;
  const direction: OrderDirection = orderBy?.direction ?? OrderDirection.Desc;
  const prismaDir = direction === OrderDirection.Asc ? 'asc' : 'desc';
  const prismaOrderField = CONNECTION_ORDER_FIELD_MAP[orderField];

  const filterWhere = buildConditionGroupsConnectionWhere(filter);
  const cursorPayload = after ? decodeCursor(after) : null;
  const cursorWhere = cursorPayload
    ? buildGroupCursorPredicate(
        cursorPayload.k,
        cursorPayload.id,
        prismaOrderField,
        prismaDir
      )
    : null;
  const where: Where = cursorWhere
    ? { AND: [filterWhere, cursorWhere] }
    : filterWhere;

  const rawRows = await prisma.conditionGroup.findMany({
    where,
    orderBy: [
      {
        [prismaOrderField]: prismaDir,
      } as Prisma.ConditionGroupOrderByWithRelationInput,
      { id: prismaDir },
    ],
    take: cappedFirst + 1,
  });

  const hasNextPage = rawRows.length > cappedFirst;
  const pageRows = hasNextPage ? rawRows.slice(0, cappedFirst) : rawRows;

  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({
      k: readGroupOrderKey(row, orderField),
      id: String(row.id),
    }),
  }));

  return {
    edges,
    nodes: pageRows,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};
