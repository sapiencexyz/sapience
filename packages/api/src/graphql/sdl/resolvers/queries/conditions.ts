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
import type {
  QueryResolvers,
  QueryConditionsPageArgs,
  ConditionFilters,
} from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { clampSkip, clampTake } from './pagination';

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
  if (filters.chainId != null) {
    and.push({ chainId: { equals: filters.chainId } });
  }
  if (filters.resolver) {
    and.push({ resolver: { equals: filters.resolver.toLowerCase() } });
  }
  if (filters.resolverIn && filters.resolverIn.length > 0) {
    const lowered = filters.resolverIn.map((r) => r.toLowerCase());
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
  const skipVal = clampSkip(skip);
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
  return { items: rawRows.slice(0, cappedTake), hasMore };
};
