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

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

import type { Prisma } from '../../../../../generated/prisma';
import type {
  QueryResolvers,
  QueryConditionsConnectionArgs,
  ConditionFilter,
  ConditionOutcomeFilter,
  IdFilter,
} from '../../__generated__/resolvers';
import {
  ConditionOrderField,
  OrderDirection,
} from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { clampTake } from './pagination';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';

type Where = Prisma.ConditionWhereInput;

// ---------------------------------------------------------------------
// Relay-shaped `conditions` connection (PR 2)
// ---------------------------------------------------------------------

/**
 * Map `ConditionOrderField` enum values to the underlying Prisma column.
 * `OPEN_INTEREST` is intentionally not represented — the column is
 * varchar, the partial index `IDX_condition_oi_numeric` is on the
 * `::numeric` cast, and Prisma's typed `orderBy` can't issue that cast.
 * Adding it back requires raw SQL; see SDL docs on `ConditionOrderField`.
 */
const CONNECTION_ORDER_FIELD_MAP: Record<ConditionOrderField, string> = {
  [ConditionOrderField.CreatedAt]: 'createdAt',
  [ConditionOrderField.ResolvesAt]: 'endTime',
  [ConditionOrderField.PredictionCount]: 'predictionCount',
  [ConditionOrderField.SimilarMarketVolume_24H]: 'similarMarketVolume24h',
  [ConditionOrderField.SimilarMarketVolume_7D]: 'similarMarketVolume7d',
};

/**
 * Translate `IDFilter` (operator-pattern) to a Prisma where clause for
 * a foreign-key column. `isNull` maps to `equals: null` / `not: null`
 * because Prisma's where shape doesn't carry a native `isNull` operator.
 */
const buildIdFilterClause = (
  filter: IdFilter | null | undefined,
  column: string
): Where | null => {
  if (!filter) return null;
  const clause: Record<string, unknown> = {};
  if (filter.equals !== undefined && filter.equals !== null) {
    clause.equals = filter.equals;
  }
  if (filter.in && filter.in.length > 0) clause.in = filter.in;
  if (filter.notIn && filter.notIn.length > 0) clause.notIn = filter.notIn;
  if (filter.not !== undefined && filter.not !== null) clause.not = filter.not;
  if (filter.isNull === true) clause.equals = null;
  if (filter.isNull === false) clause.not = null;
  if (Object.keys(clause).length === 0) return null;
  return { [column]: clause } as Where;
};

type ScalarRangeFilter = {
  equals?: number | null;
  gt?: number | null;
  gte?: number | null;
  lt?: number | null;
  lte?: number | null;
  in?: number[] | null;
  notIn?: number[] | null;
  not?: number | null;
};

const buildScalarRangeClause = (
  filter: ScalarRangeFilter | null | undefined,
  column: string
): Where | null => {
  if (!filter) return null;
  const clause: Record<string, unknown> = {};
  if (filter.equals != null) clause.equals = filter.equals;
  if (filter.gt != null) clause.gt = filter.gt;
  if (filter.gte != null) clause.gte = filter.gte;
  if (filter.lt != null) clause.lt = filter.lt;
  if (filter.lte != null) clause.lte = filter.lte;
  if (filter.in && filter.in.length > 0) clause.in = filter.in;
  if (filter.notIn && filter.notIn.length > 0) clause.notIn = filter.notIn;
  if (filter.not != null) clause.not = filter.not;
  if (Object.keys(clause).length === 0) return null;
  return { [column]: clause } as Where;
};

/**
 * Translate `ConditionOutcomeFilter` into a Prisma where clause keyed
 * off the underlying `settled` / `resolvedToYes` / `nonDecisive`
 * columns. `outcome` is the public enum derived from those booleans.
 */
const buildOutcomeFilterClause = (
  filter: ConditionOutcomeFilter | null | undefined
): Where | null => {
  if (!filter) return null;

  const matchOutcome = (outcome: string): Where => {
    if (outcome === 'YES')
      return { settled: true, resolvedToYes: true, nonDecisive: false };
    if (outcome === 'NO')
      return { settled: true, resolvedToYes: false, nonDecisive: false };
    return { settled: true, nonDecisive: true };
  };

  const clauses: Where[] = [];

  if (filter.isNull === true) clauses.push({ settled: false });
  if (filter.isNull === false) clauses.push({ settled: true });
  if (filter.equals) clauses.push(matchOutcome(filter.equals));
  if (filter.in && filter.in.length > 0) {
    clauses.push({ OR: filter.in.map(matchOutcome) });
  }
  if (filter.notIn && filter.notIn.length > 0) {
    clauses.push({ NOT: { OR: filter.notIn.map(matchOutcome) } });
  }
  if (filter.not) clauses.push({ NOT: matchOutcome(filter.not) });

  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : { AND: clauses };
};

/**
 * Build the Prisma where clause for the new `conditions` connection.
 * Public-only. Reuses the same default-public safety net.
 */
const buildConditionsConnectionWhere = (
  filter: ConditionFilter | null | undefined
): Where => {
  const and: Where[] = [];
  if (!filter) return { AND: [{ public: { equals: true } }] };

  if (filter.ids && filter.ids.length > 0) {
    and.push({ id: { in: filter.ids.map((id) => String(id).toLowerCase()) } });
  }

  const contractAddress = filter.contractAddress?.toLowerCase() ?? null;
  const contractAddressIn =
    filter.contractAddressIn && filter.contractAddressIn.length > 0
      ? filter.contractAddressIn.map((address) => address.toLowerCase())
      : null;
  const hasContractAddressFilter =
    contractAddress != null || contractAddressIn != null;
  const effectiveChainId =
    filter.chainId != null
      ? filter.chainId
      : hasContractAddressFilter
        ? DEFAULT_CHAIN_ID
        : null;
  if (effectiveChainId != null) {
    and.push({ chainId: { equals: effectiveChainId } });
  }
  if (contractAddress) {
    and.push({ resolver: { equals: contractAddress } });
  }
  if (contractAddressIn) {
    and.push({ resolver: { in: contractAddressIn } });
  }

  if (filter.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { question: { contains: term, mode: 'insensitive' } },
        { shortName: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ],
    });
  }
  if (filter.categoryIds && filter.categoryIds.length > 0) {
    const numericIds = filter.categoryIds
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n));
    if (numericIds.length > 0) {
      and.push({ categoryId: { in: numericIds } });
    }
  }
  if (filter.categorySlugs && filter.categorySlugs.length > 0) {
    and.push({ category: { is: { slug: { in: filter.categorySlugs } } } });
  }
  if (filter.tags && filter.tags.length > 0) {
    and.push({ tags: { hasSome: filter.tags } });
  }
  const groupClause = buildIdFilterClause(
    filter.conditionGroupId,
    'conditionGroupId'
  );
  if (groupClause) and.push(groupClause);
  const rangeFilter = filter as ConditionFilter & {
    resolvesAt?: ScalarRangeFilter | null;
    estimatedPrice?: ScalarRangeFilter | null;
    similarMarketVolume?: ScalarRangeFilter | null;
  };
  const resolvesAtClause = buildScalarRangeClause(
    rangeFilter.resolvesAt,
    'endTime'
  );
  if (resolvesAtClause) and.push(resolvesAtClause);
  const estimatedPriceClause = buildScalarRangeClause(
    rangeFilter.estimatedPrice,
    'estimatedPrice'
  );
  if (estimatedPriceClause) and.push(estimatedPriceClause);
  const similarMarketVolumeClause = buildScalarRangeClause(
    rangeFilter.similarMarketVolume,
    'similarMarketVolume'
  );
  if (similarMarketVolumeClause) and.push(similarMarketVolumeClause);
  if (filter.settled !== null && filter.settled !== undefined) {
    and.push({ settled: filter.settled });
  }
  if (filter.resolvedToYes !== null && filter.resolvedToYes !== undefined) {
    and.push({ settled: true, resolvedToYes: filter.resolvedToYes });
  }
  if (filter.hasSimilarMarkets === true) {
    and.push({ similarMarkets: { isEmpty: false } });
  }
  if (filter.engagement === 'NONE') {
    and.push({ openInterest: { equals: '0' } });
    and.push({ attestations: { none: {} } });
  } else if (filter.engagement === 'ANY') {
    and.push({
      OR: [
        { openInterest: { not: { equals: '0' } } },
        { attestations: { some: {} } },
      ],
    });
  }

  const outcomeClause = buildOutcomeFilterClause(filter.outcome);
  if (outcomeClause) and.push(outcomeClause);

  const visibility = filter.visibility ?? 'PUBLIC';
  const hasIdFilter = filter.ids != null && filter.ids.length > 0;
  if (!hasIdFilter) {
    if (visibility === 'PUBLIC') and.push({ public: { equals: true } });
    else if (visibility === 'PRIVATE') and.push({ public: { equals: false } });
  }

  return and.length > 0 ? { AND: and } : {};
};

/**
 * Build the keyset cursor predicate. Pagination uses `(orderField, id)`
 * lex order: for DESC, "after the cursor" means `(orderField, id) <
 * (k, id)`, which expands to `orderField < k OR (orderField = k AND
 * id < id)`. The Prisma OR clause is written explicitly because Prisma
 * has no compound-key comparison operator.
 */
const buildCursorPredicate = (
  k: string,
  cursorId: string,
  prismaOrderField: string,
  direction: 'asc' | 'desc'
): Where => {
  const ltOp = direction === 'desc' ? 'lt' : 'gt';
  // All currently-supported order fields are numeric (Int / Float /
  // BigInt / Date). `OPEN_INTEREST` (varchar) is intentionally not in
  // the connection's supported sort set — see SDL docs.
  const numeric = Number(k);
  const keyValue = Number.isFinite(numeric) ? numeric : k;
  return {
    OR: [
      { [prismaOrderField]: { [ltOp]: keyValue } } as Where,
      {
        AND: [
          { [prismaOrderField]: { equals: keyValue } } as Where,
          { id: { [ltOp]: cursorId } } as Where,
        ],
      },
    ],
  };
};

/**
 * Read the order-key value off a Condition row given the chosen
 * `ConditionOrderField`. Stringified so cursors carry a stable scalar
 * regardless of the underlying column type.
 */
const readOrderKey = (
  row: PrismaConditionPick,
  field: ConditionOrderField
): string => {
  switch (field) {
    case ConditionOrderField.CreatedAt:
      return row.createdAt.toISOString();
    case ConditionOrderField.ResolvesAt:
      return String(row.endTime);
    case ConditionOrderField.PredictionCount:
      return String(row.predictionCount);
    case ConditionOrderField.SimilarMarketVolume_24H:
      return String(row.similarMarketVolume24h);
    case ConditionOrderField.SimilarMarketVolume_7D:
      return String(row.similarMarketVolume7d);
    default:
      return String(row.createdAt);
  }
};

type PrismaConditionPick = {
  id: string;
  createdAt: Date;
  endTime: number;
  predictionCount: number;
  similarMarketVolume24h: number;
  similarMarketVolume7d: number;
};

export const conditionsConnection: NonNullable<
  QueryResolvers['conditionsConnection']
> = async (
  _parent,
  { first, after, filter, orderBy, take, skip }: QueryConditionsConnectionArgs
) => {
  const cappedFirst = clampTake(first ?? take ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
  const orderField: ConditionOrderField =
    orderBy?.field ?? ConditionOrderField.CreatedAt;
  const direction: OrderDirection = orderBy?.direction ?? OrderDirection.Desc;
  const prismaDir = direction === OrderDirection.Asc ? 'asc' : 'desc';
  const prismaOrderField = CONNECTION_ORDER_FIELD_MAP[orderField];

  const filterWhere = buildConditionsConnectionWhere(filter);
  const cursorPayload = after ? decodeCursor(after) : null;
  const cursorWhere = cursorPayload
    ? buildCursorPredicate(
        cursorPayload.k,
        cursorPayload.id,
        prismaOrderField,
        prismaDir
      )
    : null;
  const where: Where = cursorWhere
    ? { AND: [filterWhere, cursorWhere] }
    : filterWhere;

  const rawRows = await prisma.condition.findMany({
    where,
    orderBy: [
      {
        [prismaOrderField]: prismaDir,
      } as Prisma.ConditionOrderByWithRelationInput,
      { id: prismaDir },
    ],
    take: cappedFirst + 1,
    ...(after ? {} : { skip: skip ?? 0 }),
  });

  const hasNextPage = rawRows.length > cappedFirst;
  const pageRows = hasNextPage ? rawRows.slice(0, cappedFirst) : rawRows;

  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({ k: readOrderKey(row, orderField), id: row.id }),
  }));

  return {
    items: pageRows,
    hasMore: hasNextPage,
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
