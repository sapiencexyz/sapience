import type { Prisma } from '../../../../../generated/prisma';
import type {
  QueryResolvers,
  QueryConditionGroupsConnectionArgs,
  ConditionGroupFilter,
} from '../../__generated__/resolvers';
import {
  ConditionGroupOrderField,
  OrderDirection,
} from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { clampTake } from './pagination';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';

type Where = Prisma.ConditionGroupWhereInput;

export const conditionGroup: NonNullable<
  QueryResolvers['conditionGroup']
> = async (_parent, { where }) =>
  prisma.conditionGroup.findUnique({
    where: where as unknown as Prisma.ConditionGroupWhereUniqueInput,
  });

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
  const and: Where[] = [];

  if (filter?.ids && filter.ids.length > 0) {
    const numericIds = filter.ids
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n));
    if (numericIds.length > 0) and.push({ id: { in: numericIds } });
  }

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
  if (filter?.categorySlugs && filter.categorySlugs.length > 0) {
    and.push({ category: { is: { slug: { in: filter.categorySlugs } } } });
  }

  // Per-condition predicates are folded into a SINGLE `condition: { some }`
  // clause so the same child row must satisfy chain/public/tag constraints.
  const someConstraints: Prisma.ConditionWhereInput = {};
  if (filter?.chainId != null) someConstraints.chainId = filter.chainId;
  if (filter?.publicOnly !== false) someConstraints.public = true;
  if (filter?.tags && filter.tags.length > 0) {
    someConstraints.tags = { hasSome: filter.tags };
  }

  const includeEmpty = filter?.includeEmpty === true;
  if (!includeEmpty || Object.keys(someConstraints).length > 0) {
    and.push({ condition: { some: someConstraints } });
  }

  return and.length > 0 ? { AND: and } : {};
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

export const conditionGroupsConnection: NonNullable<
  QueryResolvers['conditionGroupsConnection']
> = async (
  _parent,
  {
    first,
    after,
    filter,
    orderBy,
    take,
    skip,
  }: QueryConditionGroupsConnectionArgs
) => {
  const cappedFirst = clampTake(first ?? take ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
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

  const [rawRows, totalCount] = await Promise.all([
    prisma.conditionGroup.findMany({
      where,
      orderBy: [
        {
          [prismaOrderField]: prismaDir,
        } as Prisma.ConditionGroupOrderByWithRelationInput,
        { id: prismaDir },
      ],
      take: cappedFirst + 1,
      ...(after ? {} : { skip: skip ?? 0 }),
    }),
    prisma.conditionGroup.count({ where: filterWhere }),
  ]);

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
    items: pageRows,
    hasMore: hasNextPage,
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
