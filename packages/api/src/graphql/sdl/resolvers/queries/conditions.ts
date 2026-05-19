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
  QueryConditionsPageArgs,
  QueryConditionsArgs,
  ConditionFilters,
  ConditionFilter,
  ConditionOutcomeFilter,
  IdFilter,
} from '../../__generated__/resolvers';
import {
  ConditionOrderField,
  OrderDirection,
} from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { clampSkip, clampTake } from './pagination';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';

type Where = Prisma.ConditionWhereInput;

const buildConditionsWhereFromFilters = (
  filters: ConditionFilters | null | undefined
): Where => {
  if (!filters) return { public: { equals: true } };

  const and: Where[] = [];

  if (filters.ids && filters.ids.length > 0) {
    const lowered = filters.ids.map((id) => id.toLowerCase());
    and.push({ id: { in: lowered } });
  }

  // Contract-address filters: `contractAddress` and `contractAddressIn` are
  // the public-facing names; both map to the DB `resolver` column. The
  // legacy `resolver` / `resolverIn` inputs are protocol-jargon aliases and
  // are kept for back-compat. Contract addresses are not a global namespace,
  // so when a caller filters by address without specifying a chain, we
  // default to `DEFAULT_CHAIN_ID` to keep lookups single-chain.
  const contractAddress = filters.contractAddress ?? filters.resolver ?? null;
  const contractAddressIn =
    filters.contractAddressIn ?? filters.resolverIn ?? null;
  const hasContractAddressFilter =
    contractAddress != null ||
    (contractAddressIn != null && contractAddressIn.length > 0);

  const effectiveChainId =
    filters.chainId != null
      ? filters.chainId
      : hasContractAddressFilter
        ? DEFAULT_CHAIN_ID
        : null;
  if (effectiveChainId != null) {
    and.push({ chainId: { equals: effectiveChainId } });
  }
  if (contractAddress) {
    and.push({ resolver: { equals: contractAddress.toLowerCase() } });
  }
  if (contractAddressIn && contractAddressIn.length > 0) {
    const lowered = contractAddressIn.map((r) => r.toLowerCase());
    and.push({ resolver: { in: lowered } });
  }
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    and.push({
      OR: [
        { question: { contains: term, mode: 'insensitive' } },
        { shortName: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ],
    });
  }
  if (filters.categorySlugs && filters.categorySlugs.length > 0) {
    and.push({
      category: { is: { slug: { in: filters.categorySlugs } } },
    });
  }
  if (filters.minEndTime != null || filters.maxEndTime != null) {
    const range: Record<string, number> = {};
    if (filters.minEndTime != null) range.gte = filters.minEndTime;
    if (filters.maxEndTime != null) range.lte = filters.maxEndTime;
    and.push({ endTime: range });
  }
  if (filters.ungroupedOnly === true) {
    and.push({ conditionGroupId: null });
  }
  if (filters.conditionGroupId != null) {
    and.push({ conditionGroupId: { equals: filters.conditionGroupId } });
  }
  if (filters.settled !== null && filters.settled !== undefined) {
    and.push({ settled: filters.settled });
  }
  if (filters.resolvedToYes !== null && filters.resolvedToYes !== undefined) {
    and.push({ settled: true, resolvedToYes: filters.resolvedToYes });
  }
  if (filters.hasSimilarMarkets === true) {
    and.push({ similarMarkets: { isEmpty: false } });
  }
  if (filters.engagement === 'NONE') {
    and.push({ openInterest: { equals: '0' } });
    and.push({ attestations: { none: {} } });
  } else if (filters.engagement === 'ANY') {
    and.push({
      OR: [
        { openInterest: { not: { equals: '0' } } },
        { attestations: { some: {} } },
      ],
    });
  }

  // Visibility — matches the safety-net behaviour of the bare `conditions`
  // resolver: when callers pass a list of IDs they bypass the public filter
  // (so admins / direct links can fetch private conditions); otherwise
  // default to PUBLIC unless explicitly overridden.
  const visibility = filters.visibility ?? 'PUBLIC';
  const hasIdFilterFromInput = filters.ids != null && filters.ids.length > 0;
  if (!hasIdFilterFromInput) {
    if (visibility === 'PUBLIC') and.push({ public: { equals: true } });
    else if (visibility === 'PRIVATE') and.push({ public: { equals: false } });
    // ALL → no filter
  }

  return and.length > 0 ? { AND: and } : {};
};

const ORDER_FIELD_MAP: Record<string, string> = {
  CREATED_AT: 'createdAt',
  END_TIME: 'endTime',
  OPEN_INTEREST: 'openInterest',
  PREDICTION_COUNT: 'predictionCount',
};

export const conditionsPage: NonNullable<
  QueryResolvers['conditionsPage']
> = async (
  _parent,
  { filters, orderBy, orderDirection, take, skip }: QueryConditionsPageArgs
) => {
  const cappedTake = clampTake(take, { defaultTake: 50, maxTake: 100 });
  // Opts out of MAX_SKIP=1000 so the keeper's bulk refresh-metadata loop
  // can read past row 1000. Switch to cursor pagination to remove this.
  const skipVal = clampSkip(skip, { maxSkip: Number.POSITIVE_INFINITY });
  const where = buildConditionsWhereFromFilters(filters);
  const direction = orderDirection === 'asc' ? 'asc' : 'desc';
  const orderField = ORDER_FIELD_MAP[orderBy ?? 'CREATED_AT'] ?? 'createdAt';
  const orderByClause = {
    [orderField]: direction,
  } as Prisma.ConditionOrderByWithRelationInput;

  const rawRows = await prisma.condition.findMany({
    where,
    orderBy: orderByClause,
    take: cappedTake + 1,
    skip: skipVal,
  });
  const hasMore = rawRows.length > cappedTake;
  return {
    items: rawRows.slice(0, cappedTake),
    hasMore,
    _countWhere: where,
  };
};

// ---------------------------------------------------------------------
// Relay-shaped `conditions` connection (PR 2)
// ---------------------------------------------------------------------

/**
 * Map `ConditionOrderField` enum values to the underlying Prisma column
 * name. Every value is index-backed — see `IDX_condition_*` declarations
 * in `prisma/schema.prisma`.
 */
const CONNECTION_ORDER_FIELD_MAP: Record<ConditionOrderField, string> = {
  [ConditionOrderField.CreatedAt]: 'createdAt',
  [ConditionOrderField.ResolvesAt]: 'endTime',
  [ConditionOrderField.OpenInterest]: 'openInterest',
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
 * Public-only — admin visibility switches live on the deprecated
 * `conditionsPage`. Reuses the same default-public safety net.
 */
const buildConditionsConnectionWhere = (
  filter: ConditionFilter | null | undefined
): Where => {
  const and: Where[] = [{ public: { equals: true } }];
  if (!filter) return { AND: and };

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
  if (filter.tags && filter.tags.length > 0) {
    and.push({ tags: { hasSome: filter.tags } });
  }
  const groupClause = buildIdFilterClause(
    filter.conditionGroupId,
    'conditionGroupId'
  );
  if (groupClause) and.push(groupClause);
  const outcomeClause = buildOutcomeFilterClause(filter.outcome);
  if (outcomeClause) and.push(outcomeClause);

  return { AND: and };
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
  const coerced = prismaOrderField === 'openInterest' ? k : Number(k);
  // `openInterest` is a varchar column (Decimal stored as string in the
  // condition table); every other order column is numeric, so we coerce.
  const keyValue = Number.isFinite(coerced as number) ? coerced : k;
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
    case ConditionOrderField.OpenInterest:
      return row.openInterest;
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
  openInterest: string;
  predictionCount: number;
  similarMarketVolume24h: number;
  similarMarketVolume7d: number;
};

export const conditions: NonNullable<QueryResolvers['conditions']> = async (
  _parent,
  { first, after, filter, orderBy }: QueryConditionsArgs
) => {
  const cappedFirst = clampTake(first ?? 50, { defaultTake: 50, maxTake: 100 });
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
  });

  const hasNextPage = rawRows.length > cappedFirst;
  const pageRows = hasNextPage ? rawRows.slice(0, cappedFirst) : rawRows;

  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({ k: readOrderKey(row, orderField), id: row.id }),
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
