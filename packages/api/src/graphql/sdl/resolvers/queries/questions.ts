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

export const runQuestions = async ({
  take,
  skip,
  chainId,
  sortField,
  sortDirection,
  search,
  categorySlugs,
  minEndTime,
  resolutionStatus,
  minEstimatedPrice,
  maxEstimatedPrice,
  minSimilarMarketVolume,
  maxSimilarMarketVolume,
  tag,
  similarMarketVolumeWindow,
}: QueryQuestionsArgs): Promise<{
  items: QuestionReturn[];
  hasMore: boolean;
}> => {
  const sanitizedSortField = sortField ?? 'endTime';
  const dir = sortDirection === 'asc' ? 'ASC' : 'DESC';

  const boundedTake = clampTake(take, { defaultTake: 50, maxTake: 100 });
  const boundedSkip = clampSkip(skip);
  const boundedSearch = search?.slice(0, 200) ?? null;
  const boundedCategorySlugs = categorySlugs?.slice(0, 50) ?? null;
  const boundedTag = tag?.slice(0, 200) ?? null;

  const resolvedFilter = (() => {
    if (resolutionStatus && resolutionStatus !== 'all') {
      switch (resolutionStatus) {
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
    }
    return Prisma.empty;
  })();

  const priceFilter = (() => {
    const parts: Prisma.Sql[] = [];
    if (minEstimatedPrice != null) {
      parts.push(Prisma.sql`c."estimatedPrice" >= ${minEstimatedPrice}`);
    }
    if (maxEstimatedPrice != null) {
      parts.push(Prisma.sql`c."estimatedPrice" <= ${maxEstimatedPrice}`);
    }
    if (parts.length === 0) return Prisma.empty;
    return Prisma.sql`AND (${Prisma.join(parts, ' AND ')})`;
  })();

  const hasConditionFilters =
    chainId != null ||
    (resolutionStatus != null && resolutionStatus !== 'all') ||
    minEstimatedPrice != null ||
    maxEstimatedPrice != null ||
    minEndTime != null ||
    minSimilarMarketVolume != null ||
    maxSimilarMarketVolume != null;

  const resolvedVolumeKey: VolumeKey = resolveVolumeKey(
    similarMarketVolumeWindow
  );
  const volumeFragments = volumeColumnFragments[resolvedVolumeKey];
  const useWindowedSimilarMarketVolume = similarMarketVolumeWindow != null;

  // All-time volume sort has no denormalized column on condition_group, so
  // it also needs the LEFT JOIN to compute SUM in one pass rather than a
  // correlated subquery per group.
  const requiresConditionJoin =
    hasConditionFilters ||
    (sanitizedSortField === 'similarMarketVolume' &&
      !useWindowedSimilarMarketVolume);

  const similarMarketVolumeFilter = (() => {
    const parts: Prisma.Sql[] = [];
    const expr = useWindowedSimilarMarketVolume
      ? volumeFragments.cond
      : Prisma.sql`c."similarMarketVolume"`;
    if (minSimilarMarketVolume != null) {
      parts.push(Prisma.sql`${expr} >= ${minSimilarMarketVolume}`);
    }
    if (maxSimilarMarketVolume != null) {
      parts.push(Prisma.sql`${expr} <= ${maxSimilarMarketVolume}`);
    }
    if (parts.length === 0) return Prisma.empty;
    return Prisma.sql`AND (${Prisma.join(parts, ' AND ')})`;
  })();

  const conditionFilters = Prisma.sql`
    ${chainId != null ? Prisma.sql`AND c."chainId" = ${chainId}` : Prisma.empty}
    ${resolvedFilter}
    ${priceFilter}
    ${similarMarketVolumeFilter}
    ${minEndTime != null ? Prisma.sql`AND c."endTime" >= ${minEndTime}` : Prisma.empty}
  `;

  const sortValueExpr = (() => {
    switch (sanitizedSortField) {
      case 'openInterest':
        return Prisma.sql`COALESCE(SUM(c."openInterest"::numeric), 0)`;
      case 'predictionCount':
        return Prisma.sql`COALESCE(SUM(c."predictionCount")::numeric, 0)`;
      case 'createdAt':
        return Prisma.sql`COALESCE(MAX(FLOOR(EXTRACT(EPOCH FROM c."createdAt"))::bigint)::numeric, 0)`;
      case 'similarMarketVolume':
        return useWindowedSimilarMarketVolume
          ? volumeFragments.sumExpr
          : Prisma.sql`COALESCE(SUM(c."similarMarketVolume"), 0)::numeric`;
      default:
        return Prisma.sql`COALESCE(MAX(c."endTime")::numeric, 0)`;
    }
  })();

  const groupConditionJoin = requiresConditionJoin
    ? Prisma.sql`LEFT JOIN condition c ON c."conditionGroupId" = cg.id
          AND c.public = true
          ${conditionFilters}`
    : Prisma.empty;

  const groupSortValue = requiresConditionJoin
    ? sortValueExpr
    : sanitizedSortField === 'openInterest'
      ? Prisma.sql`cg."totalOpenInterest"::numeric`
      : sanitizedSortField === 'predictionCount'
        ? Prisma.sql`cg."totalPredictionCount"::numeric`
        : sanitizedSortField === 'createdAt'
          ? Prisma.sql`cg."maxCreatedAtEpoch"::numeric`
          : sanitizedSortField === 'similarMarketVolume'
            ? volumeFragments.group
            : Prisma.sql`cg."maxEndTime"::numeric`;

  const groupPredictionCount = requiresConditionJoin
    ? Prisma.sql`COALESCE(SUM(c."predictionCount"), 0)`
    : Prisma.sql`cg."totalPredictionCount"`;

  const groupEndTime = requiresConditionJoin
    ? Prisma.sql`COALESCE(MAX(c."endTime"), 0)`
    : Prisma.sql`cg."maxEndTime"`;

  const groupByClause = requiresConditionJoin
    ? Prisma.sql`GROUP BY cg.id HAVING COUNT(c.id) > 0`
    : Prisma.empty;

  const condSortValue =
    sanitizedSortField === 'openInterest'
      ? Prisma.sql`COALESCE(c."openInterest"::numeric, 0)`
      : sanitizedSortField === 'predictionCount'
        ? Prisma.sql`c."predictionCount"::numeric`
        : sanitizedSortField === 'createdAt'
          ? Prisma.sql`COALESCE(FLOOR(EXTRACT(EPOCH FROM c."createdAt"))::bigint, 0)::numeric`
          : sanitizedSortField === 'similarMarketVolume'
            ? useWindowedSimilarMarketVolume
              ? Prisma.sql`COALESCE(${volumeFragments.cond}, 0)::numeric`
              : Prisma.sql`COALESCE(c."similarMarketVolume", 0)::numeric`
            : Prisma.sql`COALESCE(c."endTime", 2147483647)::numeric`;

  const sortedItems = await prisma.$queryRaw<SortedItemRow[]>`
    WITH combined AS (
      -- Part A: Active groups
      SELECT
        'group' as item_type,
        cg.id as group_id,
        NULL::text as condition_id,
        ${groupSortValue} as sort_value,
        ${groupPredictionCount} as prediction_count,
        ${groupEndTime} as end_time
      FROM condition_group cg
      ${groupConditionJoin}
      WHERE cg."publicConditionCount" > 0
        ${
          boundedSearch
            ? Prisma.sql`AND (
                cg.name ILIKE ${'%' + boundedSearch + '%'}
                OR EXISTS (
                  SELECT 1 FROM condition c_search
                  WHERE c_search."conditionGroupId" = cg.id
                    AND c_search.public = true
                    AND (
                      c_search.question ILIKE ${'%' + boundedSearch + '%'}
                      OR c_search."shortName" ILIKE ${'%' + boundedSearch + '%'}
                      OR EXISTS (SELECT 1 FROM unnest(c_search.tags) AS t WHERE t ILIKE ${'%' + boundedSearch + '%'})
                    )
                )
              )`
            : Prisma.empty
        }
        ${
          boundedCategorySlugs?.length
            ? Prisma.sql`AND cg."categoryId" IN (SELECT id FROM category WHERE slug = ANY(${boundedCategorySlugs}::text[]))`
            : Prisma.empty
        }
        ${
          boundedTag
            ? Prisma.sql`AND EXISTS (
                SELECT 1 FROM condition c_tag
                WHERE c_tag."conditionGroupId" = cg.id
                  AND c_tag.public = true
                  AND ${boundedTag} = ANY(c_tag.tags)
              )`
            : Prisma.empty
        }
      ${groupByClause}

      UNION ALL

      -- Part B: Ungrouped conditions
      SELECT
        'condition' as item_type,
        NULL::integer as group_id,
        c.id as condition_id,
        ${condSortValue} as sort_value,
        c."predictionCount" as prediction_count,
        COALESCE(c."endTime", 2147483647) as end_time
      FROM condition c
      WHERE c.public = true
        AND c."conditionGroupId" IS NULL
        ${conditionFilters}
        ${
          boundedSearch
            ? Prisma.sql`AND (c.question ILIKE ${'%' + boundedSearch + '%'} OR c."shortName" ILIKE ${'%' + boundedSearch + '%'} OR EXISTS (SELECT 1 FROM unnest(c.tags) AS t WHERE t ILIKE ${'%' + boundedSearch + '%'}))`
            : Prisma.empty
        }
        ${
          boundedCategorySlugs?.length
            ? Prisma.sql`AND c."categoryId" IN (SELECT id FROM category WHERE slug = ANY(${boundedCategorySlugs}::text[]))`
            : Prisma.empty
        }
        ${
          boundedTag
            ? Prisma.sql`AND ${boundedTag} = ANY(c.tags)`
            : Prisma.empty
        }
    )
    SELECT item_type, group_id, condition_id, prediction_count
    FROM combined
    ORDER BY sort_value ${Prisma.raw(dir)},
             end_time ASC,
             item_type ASC,
             COALESCE(group_id, 0) ASC,
             COALESCE(condition_id, '') ASC
    LIMIT ${boundedTake + 1}
    OFFSET ${boundedSkip}
  `;

  const hasMore = sortedItems.length > boundedTake;
  const pageItems = sortedItems.slice(0, boundedTake);

  if (pageItems.length === 0) return { items: [], hasMore };

  const groupIds = pageItems
    .filter((r) => r.item_type === 'group' && r.group_id !== null)
    .map((r) => r.group_id as number);
  const conditionIds = pageItems
    .filter((r) => r.item_type === 'condition' && r.condition_id !== null)
    .map((r) => r.condition_id as string);

  // Build Prisma where clause for nested conditions mirroring SQL filter.
  const resolvedPrismaFilter = (() => {
    if (resolutionStatus && resolutionStatus !== 'all') {
      switch (resolutionStatus) {
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
    }
    return {};
  })();

  const estimatedPriceFilter = {
    ...(minEstimatedPrice != null ? { gte: minEstimatedPrice } : {}),
    ...(maxEstimatedPrice != null ? { lte: maxEstimatedPrice } : {}),
  };
  const similarMarketVolumeRangeFilter = {
    ...(minSimilarMarketVolume != null ? { gte: minSimilarMarketVolume } : {}),
    ...(maxSimilarMarketVolume != null ? { lte: maxSimilarMarketVolume } : {}),
  };

  const prismaSimilarMarketVolumeFilter = (() => {
    if (Object.keys(similarMarketVolumeRangeFilter).length === 0) return {};
    if (!useWindowedSimilarMarketVolume) {
      return { similarMarketVolume: similarMarketVolumeRangeFilter };
    }
    const field = fieldByResolvedVolumeKey[resolvedVolumeKey];
    return { [field]: similarMarketVolumeRangeFilter };
  })();

  const conditionWhere: Prisma.ConditionWhereInput = {
    public: true,
    ...(chainId !== null && chainId !== undefined ? { chainId } : {}),
    ...resolvedPrismaFilter,
    ...(minEndTime !== null && minEndTime !== undefined
      ? { endTime: { gte: minEndTime } }
      : {}),
    ...(Object.keys(estimatedPriceFilter).length > 0
      ? { estimatedPrice: estimatedPriceFilter }
      : {}),
    ...prismaSimilarMarketVolumeFilter,
  };

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

  return { items: result, hasMore };
};

export const questionsPage: NonNullable<
  QueryResolvers['questionsPage']
> = async (_parent, args) => {
  return runQuestions(args);
};
