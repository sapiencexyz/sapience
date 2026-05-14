/**
 * Query.questions — the unified "questions" feed, interleaving condition
 * groups and ungrouped conditions by the chosen sort field.
 *
 * Three SQL parts, all in one LATERAL-joined $queryRaw:
 *   A. Active groups — those with at least one public unsettled
 *      condition. When per-condition filters are active (or the
 *      all-time similarMarketVolume sort is used), a LEFT JOIN against
 *      `condition` computes aggregates from only the matching
 *      conditions; otherwise the sort reads from the denormalized
 *      `condition_group` aggregate columns maintained by trigger.
 *   B. Ungrouped conditions — public conditions with
 *      conditionGroupId IS NULL. Rare; covers manual creation and
 *      Polymarket markets without an associated event.
 *   Final: UNION, sort, paginate. Then re-fetch full rows via Prisma
 *   ORM (type-safe, includes relations). Single-condition groups are
 *   unwrapped into a standalone condition item client-side so the
 *   frontend doesn't render the group shell for no-op groups.
 *
 * Pre-computed aggregate columns on `condition_group` (openInterest,
 * predictionCount, maxEndTime, maxCreatedAtEpoch, totalVolume*) are
 * maintained by the `trg_condition_group_aggregates` trigger.
 *
 * The resolver is split into small helpers to keep each step
 * inspectable in isolation:
 *
 *   normalizeArgs       → clamps + sanitizes inputs
 *   buildSqlFragments   → assembles every Prisma.sql fragment used
 *                         by the UNION query
 *   fetchSortedItems    → runs the UNION query, returns sorted ids
 *   buildConditionWhere → mirrors the SQL filters as a Prisma where
 *                         for the type-safe second-pass fetch
 *   hydrateItems        → fetches groups/conditions by id and maps
 *                         them to the QuestionReturn shape
 */

import type {
  QueryResolvers,
  QueryQuestionsArgs,
  ResolversTypes,
} from '../../__generated__/resolvers';
import { QuestionItemType } from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { clampSkip, clampTake } from './pagination';

// The resolver returns Prisma rows (via mappers), not the raw SDL
// Condition/ConditionGroup shapes — the typewrapper around Question in
// ResolversTypes expects the mapped (Prisma) row types for
// condition/group, so pull them from there.
type QuestionReturn = ResolversTypes['Question'];
type ConditionReturn = ResolversTypes['Condition'];
type ConditionGroupReturn = ResolversTypes['ConditionGroup'];

type SortedItemRow = {
  item_type: string;
  group_id: number | null;
  condition_id: string | null;
  prediction_count: bigint;
};

const volumeColumnFragments = {
  volume1h: {
    cond: Prisma.sql`c."volume1h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volume1h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolume1h"::numeric`,
  },
  volume4h: {
    cond: Prisma.sql`c."volume4h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volume4h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolume4h"::numeric`,
  },
  volume24h: {
    cond: Prisma.sql`c."volume24h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volume24h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolume24h"::numeric`,
  },
  volume7d: {
    cond: Prisma.sql`c."volume7d"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volume7d"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolume7d"::numeric`,
  },
  volumeFiltered1h: {
    cond: Prisma.sql`c."volumeFiltered1h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volumeFiltered1h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolumeFiltered1h"::numeric`,
  },
  volumeFiltered4h: {
    cond: Prisma.sql`c."volumeFiltered4h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volumeFiltered4h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolumeFiltered4h"::numeric`,
  },
  volumeFiltered24h: {
    cond: Prisma.sql`c."volumeFiltered24h"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volumeFiltered24h"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolumeFiltered24h"::numeric`,
  },
  volumeFiltered7d: {
    cond: Prisma.sql`c."volumeFiltered7d"`,
    sumExpr: Prisma.sql`COALESCE(SUM(c."volumeFiltered7d"), 0)::numeric`,
    group: Prisma.sql`cg."totalVolumeFiltered7d"::numeric`,
  },
} as const;

type VolumeKey = keyof typeof volumeColumnFragments;

// Keys are the GraphQL `VolumeWindow` enum values exactly as they arrive in
// the resolver (the SDK maps its friendly "1hFiltered"-style names to these
// before sending the query). Anything unrecognized — including a missing
// window — falls back to the all-time 24h column via `resolveVolumeKey`.
const volumeWindowToKey: Record<string, VolumeKey> = {
  oneHour: 'volume1h',
  fourHours: 'volume4h',
  twentyFourHours: 'volume24h',
  sevenDays: 'volume7d',
  oneHourFiltered: 'volumeFiltered1h',
  fourHoursFiltered: 'volumeFiltered4h',
  twentyFourHoursFiltered: 'volumeFiltered24h',
  sevenDaysFiltered: 'volumeFiltered7d',
};

export const resolveVolumeKey = (
  similarMarketVolumeWindow: string | null | undefined
): VolumeKey =>
  (similarMarketVolumeWindow != null
    ? volumeWindowToKey[similarMarketVolumeWindow]
    : undefined) ?? 'volume24h';

const fieldByResolvedVolumeKey: Record<VolumeKey, string> = {
  volume1h: 'similarMarketVolume1h',
  volume4h: 'similarMarketVolume4h',
  volume24h: 'similarMarketVolume24h',
  volume7d: 'similarMarketVolume7d',
  volumeFiltered1h: 'similarMarketVolumeFiltered1h',
  volumeFiltered4h: 'similarMarketVolumeFiltered4h',
  volumeFiltered24h: 'similarMarketVolumeFiltered24h',
  volumeFiltered7d: 'similarMarketVolumeFiltered7d',
};

interface NormalizedArgs {
  take: number;
  skip: number;
  search: string | null;
  categorySlugs: string[] | null;
  tag: string | null;
  chainId: number | null | undefined;
  minEndTime: number | null | undefined;
  resolutionStatus: QueryQuestionsArgs['resolutionStatus'];
  minEstimatedPrice: number | null | undefined;
  maxEstimatedPrice: number | null | undefined;
  minSimilarMarketVolume: number | null | undefined;
  maxSimilarMarketVolume: number | null | undefined;
  sortField: string;
  sortDirectionRaw: 'ASC' | 'DESC';
  volumeKey: VolumeKey;
  useWindowedSimilarMarketVolume: boolean;
  /**
   * True when at least one per-condition filter is active OR when the
   * all-time `similarMarketVolume` sort is used (which has no
   * denormalized aggregate column on condition_group, so still needs
   * a LEFT JOIN to compute SUM in one pass).
   */
  requiresConditionJoin: boolean;
}

const normalizeArgs = (args: QueryQuestionsArgs): NormalizedArgs => {
  const sortField = args.sortField ?? 'endTime';
  const volumeKey: VolumeKey =
    (args.similarMarketVolumeWindow &&
      volumeWindowToKey[args.similarMarketVolumeWindow]) ??
    'volume24h';
  const useWindowedSimilarMarketVolume = args.similarMarketVolumeWindow != null;

  const hasConditionFilters =
    args.chainId != null ||
    (args.resolutionStatus != null && args.resolutionStatus !== 'all') ||
    args.minEstimatedPrice != null ||
    args.maxEstimatedPrice != null ||
    args.minEndTime != null ||
    args.minSimilarMarketVolume != null ||
    args.maxSimilarMarketVolume != null;

  return {
    take: clampTake(args.take, { defaultTake: 50, maxTake: 100 }),
    skip: clampSkip(args.skip),
    search: args.search?.slice(0, 200) ?? null,
    categorySlugs: args.categorySlugs?.slice(0, 50) ?? null,
    tag: args.tag?.slice(0, 200) ?? null,
    chainId: args.chainId,
    minEndTime: args.minEndTime,
    resolutionStatus: args.resolutionStatus,
    minEstimatedPrice: args.minEstimatedPrice,
    maxEstimatedPrice: args.maxEstimatedPrice,
    minSimilarMarketVolume: args.minSimilarMarketVolume,
    maxSimilarMarketVolume: args.maxSimilarMarketVolume,
    sortField,
    sortDirectionRaw: args.sortDirection === 'asc' ? 'ASC' : 'DESC',
    volumeKey,
    useWindowedSimilarMarketVolume,
    requiresConditionJoin:
      hasConditionFilters ||
      (sortField === 'similarMarketVolume' && !useWindowedSimilarMarketVolume),
  };
};

/**
 * Per-condition filter fragments shared by the group LEFT JOIN and the
 * ungrouped condition branch. Each fragment is either `Prisma.empty` or
 * `AND <predicate>` so they slot into a WHERE clause without changing
 * the surrounding SQL shape.
 */
interface ConditionFilterFragments {
  resolvedFilter: Prisma.Sql;
  priceFilter: Prisma.Sql;
  similarMarketVolumeFilter: Prisma.Sql;
  endTimeFilter: Prisma.Sql;
  /** Concatenation of the four fragments above. */
  conditionFilters: Prisma.Sql;
}

const buildConditionFilterFragments = (
  n: NormalizedArgs
): ConditionFilterFragments => {
  const resolvedFilter = (() => {
    if (!n.resolutionStatus || n.resolutionStatus === 'all')
      return Prisma.empty;
    switch (n.resolutionStatus) {
      case 'unresolved':
        return Prisma.sql`AND c.settled = false`;
      case 'resolved':
        return Prisma.sql`AND c.settled = true`;
      case 'resolvedYes':
        return Prisma.sql`AND c.settled = true AND c."resolvedToYes" = true`;
      case 'resolvedNo':
        return Prisma.sql`AND c.settled = true AND c."resolvedToYes" = false`;
      default:
        return Prisma.empty;
    }
  })();

  const priceFilter = (() => {
    const parts: Prisma.Sql[] = [];
    if (n.minEstimatedPrice != null) {
      parts.push(Prisma.sql`c."estimatedPrice" >= ${n.minEstimatedPrice}`);
    }
    if (n.maxEstimatedPrice != null) {
      parts.push(Prisma.sql`c."estimatedPrice" <= ${n.maxEstimatedPrice}`);
    }
    if (parts.length === 0) return Prisma.empty;
    return Prisma.sql`AND (${Prisma.join(parts, ' AND ')})`;
  })();

  const volumeFragments = volumeColumnFragments[n.volumeKey];

  const similarMarketVolumeFilter = (() => {
    const parts: Prisma.Sql[] = [];
    const expr = n.useWindowedSimilarMarketVolume
      ? volumeFragments.cond
      : Prisma.sql`c."similarMarketVolume"`;
    if (n.minSimilarMarketVolume != null) {
      parts.push(Prisma.sql`${expr} >= ${n.minSimilarMarketVolume}`);
    }
    if (n.maxSimilarMarketVolume != null) {
      parts.push(Prisma.sql`${expr} <= ${n.maxSimilarMarketVolume}`);
    }
    if (parts.length === 0) return Prisma.empty;
    return Prisma.sql`AND (${Prisma.join(parts, ' AND ')})`;
  })();

  const endTimeFilter =
    n.minEndTime != null
      ? Prisma.sql`AND c."endTime" >= ${n.minEndTime}`
      : Prisma.empty;

  const chainIdFilter =
    n.chainId != null
      ? Prisma.sql`AND c."chainId" = ${n.chainId}`
      : Prisma.empty;

  const conditionFilters = Prisma.sql`
    ${chainIdFilter}
    ${resolvedFilter}
    ${priceFilter}
    ${similarMarketVolumeFilter}
    ${endTimeFilter}
  `;

  return {
    resolvedFilter,
    priceFilter,
    similarMarketVolumeFilter,
    endTimeFilter,
    conditionFilters,
  };
};

/** Sort-value SQL fragments for both the group and condition branches. */
interface SortFragments {
  /** SUM/MAX expr aggregated over the group's matching conditions. */
  groupSortValue: Prisma.Sql;
  /** Single-row sort expr for ungrouped conditions. */
  condSortValue: Prisma.Sql;
  /** SUM/aggregate of c."predictionCount" used by the group branch. */
  groupPredictionCount: Prisma.Sql;
  /** MAX of c."endTime" used by the group branch. */
  groupEndTime: Prisma.Sql;
  /** GROUP BY + HAVING for the group branch (empty when no JOIN). */
  groupByClause: Prisma.Sql;
  /** LEFT JOIN against `condition` (empty when filters allow the trigger
   * aggregates to satisfy the sort directly). */
  groupConditionJoin: Prisma.Sql;
}

const buildSortFragments = (
  n: NormalizedArgs,
  filters: ConditionFilterFragments
): SortFragments => {
  const volumeFragments = volumeColumnFragments[n.volumeKey];

  const sortValueExpr = (() => {
    switch (n.sortField) {
      case 'openInterest':
        return Prisma.sql`COALESCE(SUM(c."openInterest"::numeric), 0)`;
      case 'predictionCount':
        return Prisma.sql`COALESCE(SUM(c."predictionCount")::numeric, 0)`;
      case 'createdAt':
        return Prisma.sql`COALESCE(MAX(FLOOR(EXTRACT(EPOCH FROM c."createdAt"))::bigint)::numeric, 0)`;
      case 'similarMarketVolume':
        return n.useWindowedSimilarMarketVolume
          ? volumeFragments.sumExpr
          : Prisma.sql`COALESCE(SUM(c."similarMarketVolume"), 0)::numeric`;
      default:
        return Prisma.sql`COALESCE(MAX(c."endTime")::numeric, 0)`;
    }
  })();

  const groupConditionJoin = n.requiresConditionJoin
    ? Prisma.sql`LEFT JOIN condition c ON c."conditionGroupId" = cg.id
          AND c.public = true
          ${filters.conditionFilters}`
    : Prisma.empty;

  const groupSortValue = n.requiresConditionJoin
    ? sortValueExpr
    : n.sortField === 'openInterest'
      ? Prisma.sql`cg."totalOpenInterest"::numeric`
      : n.sortField === 'predictionCount'
        ? Prisma.sql`cg."totalPredictionCount"::numeric`
        : n.sortField === 'createdAt'
          ? Prisma.sql`cg."maxCreatedAtEpoch"::numeric`
          : n.sortField === 'similarMarketVolume'
            ? volumeFragments.group
            : Prisma.sql`cg."maxEndTime"::numeric`;

  const groupPredictionCount = n.requiresConditionJoin
    ? Prisma.sql`COALESCE(SUM(c."predictionCount"), 0)`
    : Prisma.sql`cg."totalPredictionCount"`;

  const groupEndTime = n.requiresConditionJoin
    ? Prisma.sql`COALESCE(MAX(c."endTime"), 0)`
    : Prisma.sql`cg."maxEndTime"`;

  const groupByClause = n.requiresConditionJoin
    ? Prisma.sql`GROUP BY cg.id HAVING COUNT(c.id) > 0`
    : Prisma.empty;

  const condSortValue =
    n.sortField === 'openInterest'
      ? Prisma.sql`COALESCE(c."openInterest"::numeric, 0)`
      : n.sortField === 'predictionCount'
        ? Prisma.sql`c."predictionCount"::numeric`
        : n.sortField === 'createdAt'
          ? Prisma.sql`COALESCE(FLOOR(EXTRACT(EPOCH FROM c."createdAt"))::bigint, 0)::numeric`
          : n.sortField === 'similarMarketVolume'
            ? n.useWindowedSimilarMarketVolume
              ? Prisma.sql`COALESCE(${volumeFragments.cond}, 0)::numeric`
              : Prisma.sql`COALESCE(c."similarMarketVolume", 0)::numeric`
            : Prisma.sql`COALESCE(c."endTime", 2147483647)::numeric`;

  return {
    groupSortValue,
    condSortValue,
    groupPredictionCount,
    groupEndTime,
    groupByClause,
    groupConditionJoin,
  };
};

/**
 * Search/category/tag fragments for the group branch (where matches can
 * come from the group name OR any of its conditions) and the
 * ungrouped-condition branch (single-row predicates).
 */
interface SearchFragments {
  groupSearch: Prisma.Sql;
  groupCategory: Prisma.Sql;
  groupTag: Prisma.Sql;
  condSearch: Prisma.Sql;
  condCategory: Prisma.Sql;
  condTag: Prisma.Sql;
}

const buildSearchFragments = (n: NormalizedArgs): SearchFragments => {
  const term = n.search ? `%${n.search}%` : null;

  return {
    groupSearch: term
      ? Prisma.sql`AND (
          cg.name ILIKE ${term}
          OR EXISTS (
            SELECT 1 FROM condition c_search
            WHERE c_search."conditionGroupId" = cg.id
              AND c_search.public = true
              AND (
                c_search.question ILIKE ${term}
                OR c_search."shortName" ILIKE ${term}
                OR EXISTS (SELECT 1 FROM unnest(c_search.tags) AS t WHERE t ILIKE ${term})
              )
          )
        )`
      : Prisma.empty,
    groupCategory: n.categorySlugs?.length
      ? Prisma.sql`AND cg."categoryId" IN (SELECT id FROM category WHERE slug = ANY(${n.categorySlugs}::text[]))`
      : Prisma.empty,
    groupTag: n.tag
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM condition c_tag
          WHERE c_tag."conditionGroupId" = cg.id
            AND c_tag.public = true
            AND ${n.tag} = ANY(c_tag.tags)
        )`
      : Prisma.empty,
    condSearch: term
      ? Prisma.sql`AND (c.question ILIKE ${term} OR c."shortName" ILIKE ${term} OR EXISTS (SELECT 1 FROM unnest(c.tags) AS t WHERE t ILIKE ${term}))`
      : Prisma.empty,
    condCategory: n.categorySlugs?.length
      ? Prisma.sql`AND c."categoryId" IN (SELECT id FROM category WHERE slug = ANY(${n.categorySlugs}::text[]))`
      : Prisma.empty,
    condTag: n.tag ? Prisma.sql`AND ${n.tag} = ANY(c.tags)` : Prisma.empty,
  };
};

const fetchSortedItems = async (
  n: NormalizedArgs
): Promise<SortedItemRow[]> => {
  const filters = buildConditionFilterFragments(n);
  const sort = buildSortFragments(n, filters);
  const search = buildSearchFragments(n);

  return prisma.$queryRaw<SortedItemRow[]>`
    WITH combined AS (
      -- Part A: Active groups
      SELECT
        'group' as item_type,
        cg.id as group_id,
        NULL::text as condition_id,
        ${sort.groupSortValue} as sort_value,
        ${sort.groupPredictionCount} as prediction_count,
        ${sort.groupEndTime} as end_time
      FROM condition_group cg
      ${sort.groupConditionJoin}
      WHERE cg."publicConditionCount" > 0
        ${search.groupSearch}
        ${search.groupCategory}
        ${search.groupTag}
      ${sort.groupByClause}

      UNION ALL

      -- Part B: Ungrouped conditions
      SELECT
        'condition' as item_type,
        NULL::integer as group_id,
        c.id as condition_id,
        ${sort.condSortValue} as sort_value,
        c."predictionCount" as prediction_count,
        COALESCE(c."endTime", 2147483647) as end_time
      FROM condition c
      WHERE c.public = true
        AND c."conditionGroupId" IS NULL
        ${filters.conditionFilters}
        ${search.condSearch}
        ${search.condCategory}
        ${search.condTag}
    )
    SELECT item_type, group_id, condition_id, prediction_count
    FROM combined
    ORDER BY sort_value ${Prisma.raw(n.sortDirectionRaw)},
             end_time ASC,
             item_type ASC,
             COALESCE(group_id, 0) ASC,
             COALESCE(condition_id, '') ASC
    LIMIT ${n.take + 1}
    OFFSET ${n.skip}
  `;
};

/**
 * Mirrors the SQL conditionFilters as a Prisma where clause for the
 * second-pass `conditionGroup.findMany` include filter — keeps the
 * nested condition list filtered to the same set the SQL UNION
 * surfaced.
 */
const buildConditionWhere = (n: NormalizedArgs): Prisma.ConditionWhereInput => {
  const resolvedPrismaFilter = (() => {
    if (!n.resolutionStatus || n.resolutionStatus === 'all') return {};
    switch (n.resolutionStatus) {
      case 'unresolved':
        return { settled: false };
      case 'resolved':
        return { settled: true };
      case 'resolvedYes':
        return { settled: true, resolvedToYes: true };
      case 'resolvedNo':
        return { settled: true, resolvedToYes: false };
      default:
        return {};
    }
  })();

  const estimatedPriceFilter = {
    ...(n.minEstimatedPrice != null ? { gte: n.minEstimatedPrice } : {}),
    ...(n.maxEstimatedPrice != null ? { lte: n.maxEstimatedPrice } : {}),
  };
  const similarMarketVolumeRangeFilter = {
    ...(n.minSimilarMarketVolume != null
      ? { gte: n.minSimilarMarketVolume }
      : {}),
    ...(n.maxSimilarMarketVolume != null
      ? { lte: n.maxSimilarMarketVolume }
      : {}),
  };

  const prismaSimilarMarketVolumeFilter = (() => {
    if (Object.keys(similarMarketVolumeRangeFilter).length === 0) return {};
    if (!n.useWindowedSimilarMarketVolume) {
      return { similarMarketVolume: similarMarketVolumeRangeFilter };
    }
    const field = fieldByResolvedVolumeKey[n.volumeKey];
    return { [field]: similarMarketVolumeRangeFilter };
  })();

  return {
    public: true,
    ...(n.chainId !== null && n.chainId !== undefined
      ? { chainId: n.chainId }
      : {}),
    ...resolvedPrismaFilter,
    ...(n.minEndTime !== null && n.minEndTime !== undefined
      ? { endTime: { gte: n.minEndTime } }
      : {}),
    ...(Object.keys(estimatedPriceFilter).length > 0
      ? { estimatedPrice: estimatedPriceFilter }
      : {}),
    ...prismaSimilarMarketVolumeFilter,
  };
};

const hydrateItems = async (
  pageItems: SortedItemRow[],
  conditionWhere: Prisma.ConditionWhereInput
): Promise<QuestionReturn[]> => {
  const groupIds = pageItems
    .filter((r) => r.item_type === 'group' && r.group_id !== null)
    .map((r) => r.group_id as number);
  const conditionIds = pageItems
    .filter((r) => r.item_type === 'condition' && r.condition_id !== null)
    .map((r) => r.condition_id as string);

  const groupInclude = {
    category: true,
    condition: {
      where: conditionWhere,
      orderBy: { displayOrder: 'asc' as const },
      include: { category: true },
    },
  } as const;

  const [groups, conditions] = await Promise.all([
    groupIds.length > 0
      ? prisma.conditionGroup.findMany({
          where: { id: { in: groupIds } },
          include: groupInclude,
        })
      : ([] as Prisma.ConditionGroupGetPayload<{
          include: typeof groupInclude;
        }>[]),
    conditionIds.length > 0
      ? prisma.condition.findMany({
          where: { id: { in: conditionIds } },
          include: { category: true },
        })
      : ([] as Prisma.ConditionGetPayload<{ include: { category: true } }>[]),
  ]);

  const groupMap = new Map<number, (typeof groups)[number]>();
  for (const g of groups) groupMap.set(g.id, g);
  const conditionMap = new Map<string, (typeof conditions)[number]>();
  for (const c of conditions) conditionMap.set(c.id, c);

  const result: QuestionReturn[] = [];
  for (const item of pageItems) {
    if (item.item_type === 'group' && item.group_id !== null) {
      const group = groupMap.get(item.group_id);
      if (!group) continue;
      if (group.condition.length === 1) {
        // Unwrap single-condition groups as standalone conditions so the
        // frontend doesn't render a group shell around a lone item.
        result.push({
          questionType: QuestionItemType.Condition,
          group: null,
          condition: group.condition[0] as unknown as ConditionReturn,
          predictionCount: Number(item.prediction_count),
        });
      } else if (group.condition.length > 1) {
        result.push({
          questionType: QuestionItemType.Group,
          group: {
            ...group,
            conditions: group.condition,
          } as unknown as ConditionGroupReturn,
          condition: null,
          predictionCount: Number(item.prediction_count),
        });
      }
    } else if (item.item_type === 'condition' && item.condition_id !== null) {
      const condition = conditionMap.get(item.condition_id);
      if (!condition) continue;
      result.push({
        questionType: QuestionItemType.Condition,
        group: null,
        condition: condition as unknown as ConditionReturn,
        predictionCount: Number(item.prediction_count),
      });
    }
  }
  return result;
};

export const runQuestions = async (
  args: QueryQuestionsArgs
): Promise<{ items: QuestionReturn[]; hasMore: boolean }> => {
  const n = normalizeArgs(args);
  const sortedItems = await fetchSortedItems(n);
  const hasMore = sortedItems.length > n.take;
  const pageItems = sortedItems.slice(0, n.take);
  if (pageItems.length === 0) return { items: [], hasMore };

  const items = await hydrateItems(pageItems, buildConditionWhere(n));
  return { items, hasMore };
};

export const questionsPage: NonNullable<
  QueryResolvers['questionsPage']
> = async (_parent, args) => {
  const { filters, sortField, sortDirection, take, skip } = args;
  return runQuestions({
    take,
    skip,
    sortField,
    sortDirection,
    chainId: filters?.chainId ?? null,
    search: filters?.search ?? null,
    categorySlugs: filters?.categorySlugs ?? null,
    tag: filters?.tag ?? null,
    minEndTime: filters?.minEndTime ?? null,
    resolutionStatus: filters?.resolutionStatus ?? null,
    minEstimatedPrice: filters?.minEstimatedPrice ?? null,
    maxEstimatedPrice: filters?.maxEstimatedPrice ?? null,
    minSimilarMarketVolume: filters?.minSimilarMarketVolume ?? null,
    maxSimilarMarketVolume: filters?.maxSimilarMarketVolume ?? null,
    similarMarketVolumeWindow: filters?.similarMarketVolumeWindow ?? null,
  });
};
