import {
  ObjectType,
  Field,
  Float,
  Int,
  Query,
  Resolver,
  Arg,
  Ctx,
  Directive,
  registerEnumType,
} from 'type-graphql';
import { ConditionGroup, Condition, SortOrder } from '@generated/type-graphql';
import { getPrismaFromContext } from '@generated/type-graphql/helpers';
import { Prisma } from '../../../generated/prisma';
import type { ApolloContext } from '../startApolloServer';

// ============================================================================
// Enums
// ============================================================================

/** Whether a question item is a group of conditions or a single condition. */
export enum QuestionItemType {
  group = 'group',
  condition = 'condition',
}

registerEnumType(QuestionItemType, {
  name: 'QuestionItemType',
  description:
    'Whether a question is a group of related conditions or a single condition',
});

/** Fields available for sorting the questions list. */
export enum QuestionSortField {
  openInterest = 'openInterest',
  endTime = 'endTime',
  createdAt = 'createdAt',
  predictionCount = 'predictionCount',
  similarMarketVolume = 'similarMarketVolume',
}

registerEnumType(QuestionSortField, {
  name: 'QuestionSortField',
  description: 'Field to sort questions by',
});

/** Time window for volume sorting. */
export enum VolumeWindow {
  oneHour = '1h',
  fourHours = '4h',
  twentyFourHours = '24h',
  sevenDays = '7d',
}

registerEnumType(VolumeWindow, {
  name: 'VolumeWindow',
  description: 'Time window for volume-based sorting',
});

/** Resolution status filter for questions. */
export enum ResolutionStatus {
  all = 'all',
  unresolved = 'unresolved',
  resolved = 'resolved',
  resolvedYes = 'resolvedYes',
  resolvedNo = 'resolvedNo',
}

registerEnumType(ResolutionStatus, {
  name: 'ResolutionStatus',
  description: 'Filter questions by their resolution status',
});

// ============================================================================
// Types
// ============================================================================

/**
 * Wrapper type for questions that can be either a condition group or an ungrouped condition.
 * This allows returning a single sorted list where groups and conditions are interleaved
 * based on their sort value (openInterest or endTime).
 */
@ObjectType({
  description:
    'A question item — either a group of related conditions or a single ungrouped condition',
})
export class Question {
  @Field(() => QuestionItemType)
  questionType!: 'group' | 'condition';

  @Field(() => ConditionGroup, { nullable: true })
  group?: ConditionGroup | null;

  @Field(() => Condition, { nullable: true })
  condition?: Condition | null;

  @Field(() => Int, { nullable: true })
  predictionCount?: number;
}

/**
 * Resolver for fetching questions (both condition groups and ungrouped conditions)
 * sorted together by aggregate/individual values.
 *
 * Uses pre-computed aggregate columns on condition_group (maintained by
 * trg_condition_group_aggregates trigger) to avoid GROUP BY in the main query.
 * When per-condition filters (chainId, resolution, price, minEndTime) are
 * active, a LATERAL JOIN computes aggregates from only the matching conditions
 * so that sort order stays accurate.
 *
 * UNION SQL query (two parts):
 * 1. Active groups — future endTime OR has unsettled public conditions
 * 2. Ungrouped conditions only
 * 3. Sort together, paginate, fetch full records via Prisma ORM
 */
@Resolver()
export class QuestionsResolver {
  @Query(() => [Question], {
    nullable: false,
    description:
      'Sorted, paginated list of questions — groups and ungrouped conditions interleaved by the chosen sort field',
  })
  @Directive('@cacheControl(maxAge: 30)')
  async questions(
    @Ctx() ctx: ApolloContext,
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('chainId', () => Int, { nullable: true }) chainId: number | null,
    @Arg('sortField', () => QuestionSortField, { nullable: true })
    sortField: QuestionSortField | null,
    @Arg('sortDirection', () => SortOrder, { defaultValue: SortOrder.desc })
    sortDirection: SortOrder,
    @Arg('search', () => String, { nullable: true }) search: string | null,
    @Arg('categorySlugs', () => [String], { nullable: true })
    categorySlugs: string[] | null,
    @Arg('minEndTime', () => Int, { nullable: true })
    minEndTime: number | null,
    @Arg('resolutionStatus', () => ResolutionStatus, { nullable: true })
    resolutionStatus: ResolutionStatus | null,
    @Arg('minEstimatedPrice', () => Float, { nullable: true })
    minEstimatedPrice: number | null,
    @Arg('maxEstimatedPrice', () => Float, { nullable: true })
    maxEstimatedPrice: number | null,
    @Arg('minSimilarMarketVolume', () => Float, { nullable: true })
    minSimilarMarketVolume: number | null,
    @Arg('maxSimilarMarketVolume', () => Float, { nullable: true })
    maxSimilarMarketVolume: number | null,
    @Arg('tag', () => String, { nullable: true })
    tag: string | null,
    @Arg('similarMarketVolumeWindow', () => VolumeWindow, { nullable: true })
    similarMarketVolumeWindow: VolumeWindow | null
  ): Promise<Question[]> {
    const prisma = getPrismaFromContext(ctx);

    // Default sort field to endTime when not provided (enum validation handled by GraphQL)
    const sanitizedSortField = sortField ?? QuestionSortField.endTime;

    // Map enum to SQL direction
    const dir = sortDirection === SortOrder.asc ? 'ASC' : 'DESC';

    // Bounds checking for defense-in-depth
    const boundedTake = Math.max(1, Math.min(take, 100));
    const boundedSkip = Math.max(0, skip);
    const boundedSearch = search?.slice(0, 200) ?? null;
    const boundedCategorySlugs = categorySlugs?.slice(0, 50) ?? null;
    const boundedTag = tag?.slice(0, 200) ?? null;

    // Build resolution status SQL filter
    const resolvedFilter = (() => {
      if (resolutionStatus && resolutionStatus !== ResolutionStatus.all) {
        switch (resolutionStatus) {
          case ResolutionStatus.unresolved:
            return Prisma.sql`AND c.settled = false`;
          case ResolutionStatus.resolved:
            return Prisma.sql`AND c.settled = true`;
          case ResolutionStatus.resolvedYes:
            return Prisma.sql`AND c.settled = true AND c."resolvedToYes" = true`;
          case ResolutionStatus.resolvedNo:
            return Prisma.sql`AND c.settled = true AND c."resolvedToYes" = false`;
          default:
            return Prisma.empty;
        }
      }
      return Prisma.empty;
    })();

    // Build estimated price SQL filter
    const priceFilter = (() => {
      const parts = [];
      if (minEstimatedPrice != null)
        parts.push(Prisma.sql`c."estimatedPrice" >= ${minEstimatedPrice}`);
      if (maxEstimatedPrice != null)
        parts.push(Prisma.sql`c."estimatedPrice" <= ${maxEstimatedPrice}`);
      if (parts.length === 0) return Prisma.empty;
      return Prisma.sql`AND (${Prisma.join(parts, ' AND ')})`;
    })();

    // Determine if per-condition filters are active (require LATERAL subquery
    // in Part A so that group sort values reflect only the filtered conditions)
    const hasConditionFilters =
      chainId != null ||
      (resolutionStatus != null && resolutionStatus !== ResolutionStatus.all) ||
      minEstimatedPrice != null ||
      maxEstimatedPrice != null ||
      minEndTime != null;

    // --- Volume column resolution ---
    // Maps volumeWindow to the correct condition and group columns.
    // All fragments are static Prisma.sql — no dynamic column names.
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
    } as const;

    const resolvedVolumeKey = (() => {
      const window = similarMarketVolumeWindow ?? VolumeWindow.twentyFourHours;
      const suffix = { '1h': '1h', '4h': '4h', '24h': '24h', '7d': '7d' }[
        window
      ];
      return `volume${suffix}` as keyof typeof volumeColumnFragments;
    })();

    const volumeFragments = volumeColumnFragments[resolvedVolumeKey];
    const useWindowedSimilarMarketVolume = similarMarketVolumeWindow != null;

    const similarMarketVolumeFilter = (() => {
      const parts = [];
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

    // Reusable per-condition filter fragment (for Part A join and Part B)
    const conditionFilters = Prisma.sql`
      ${chainId != null ? Prisma.sql`AND c."chainId" = ${chainId}` : Prisma.empty}
      ${resolvedFilter}
      ${priceFilter}
      ${similarMarketVolumeFilter}
      ${minEndTime != null ? Prisma.sql`AND c."endTime" >= ${minEndTime}` : Prisma.empty}
    `;

    // --- Part A column/join fragments ---
    // When per-condition filters are active, use a LEFT JOIN + GROUP BY to
    // compute aggregates from only the matching conditions in a single pass.
    // When unfiltered, read directly from denormalized columns (faster).

    const sortValueExpr = (() => {
      switch (sanitizedSortField) {
        case QuestionSortField.openInterest:
          return Prisma.sql`COALESCE(SUM(c."openInterest"::numeric), 0)`;
        case QuestionSortField.predictionCount:
          return Prisma.sql`COALESCE(SUM(c."predictionCount")::numeric, 0)`;
        case QuestionSortField.createdAt:
          return Prisma.sql`COALESCE(MAX(FLOOR(EXTRACT(EPOCH FROM c."createdAt"))::bigint)::numeric, 0)`;
        case QuestionSortField.similarMarketVolume:
          return useWindowedSimilarMarketVolume
            ? volumeFragments.sumExpr
            : Prisma.sql`COALESCE(SUM(c."similarMarketVolume"), 0)::numeric`;
        default:
          return Prisma.sql`COALESCE(MAX(c."endTime")::numeric, 0)`;
      }
    })();

    // LEFT JOIN scans the condition table once and hash-aggregates by group,
    // instead of the previous LATERAL which probed the index per group (~800x).
    const groupConditionJoin = hasConditionFilters
      ? Prisma.sql`LEFT JOIN condition c ON c."conditionGroupId" = cg.id
            AND c.public = true
            ${conditionFilters}`
      : Prisma.empty;

    const groupSortValue = hasConditionFilters
      ? sortValueExpr
      : sanitizedSortField === QuestionSortField.openInterest
        ? Prisma.sql`cg."totalOpenInterest"::numeric`
        : sanitizedSortField === QuestionSortField.predictionCount
          ? Prisma.sql`cg."totalPredictionCount"::numeric`
          : sanitizedSortField === QuestionSortField.createdAt
            ? Prisma.sql`cg."maxCreatedAtEpoch"::numeric`
            : sanitizedSortField === QuestionSortField.similarMarketVolume
              ? useWindowedSimilarMarketVolume
                ? volumeFragments.group
                : Prisma.sql`(SELECT COALESCE(SUM(c."similarMarketVolume"), 0) FROM condition c WHERE c."conditionGroupId" = cg.id AND c.public = true)::numeric`
              : Prisma.sql`cg."maxEndTime"::numeric`;

    const groupPredictionCount = hasConditionFilters
      ? Prisma.sql`COALESCE(SUM(c."predictionCount"), 0)`
      : Prisma.sql`cg."totalPredictionCount"`;

    const groupEndTime = hasConditionFilters
      ? Prisma.sql`COALESCE(MAX(c."endTime"), 0)`
      : Prisma.sql`cg."maxEndTime"`;

    const groupByClause = hasConditionFilters
      ? Prisma.sql`GROUP BY cg.id
        HAVING COUNT(c.id) > 0`
      : Prisma.empty;

    // --- Condition-level sort value (shared by merged Part B+C) ---
    const condSortValue =
      sanitizedSortField === QuestionSortField.openInterest
        ? Prisma.sql`COALESCE(c."openInterest"::numeric, 0)`
        : sanitizedSortField === QuestionSortField.predictionCount
          ? Prisma.sql`c."predictionCount"::numeric`
          : sanitizedSortField === QuestionSortField.createdAt
            ? Prisma.sql`COALESCE(FLOOR(EXTRACT(EPOCH FROM c."createdAt"))::bigint, 0)::numeric`
            : sanitizedSortField === QuestionSortField.similarMarketVolume
              ? useWindowedSimilarMarketVolume
                ? Prisma.sql`COALESCE(${volumeFragments.cond}, 0)::numeric`
                : Prisma.sql`COALESCE(c."similarMarketVolume", 0)::numeric`
              : Prisma.sql`COALESCE(c."endTime", 2147483647)::numeric`;

    // Step 1: UNION query — two parts:
    // - Part A: Active groups (sort values from denormalized cols or LATERAL)
    // - Part B: Individual conditions (ungrouped OR from expired groups)
    // Note: condition_group.id is integer, condition.id is string (text).
    // We store them separately and use item_type to determine which ID to use.
    const sortedItems = await prisma.$queryRaw<
      {
        item_type: string;
        group_id: number | null;
        condition_id: string | null;
        prediction_count: bigint;
      }[]
    >`
      WITH combined AS (
        -- Part A: Active groups (future endTime OR has unsettled conditions)
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

        -- Part B: Ungrouped conditions only (rare — almost all conditions belong
        -- to a group via the keeper pipeline; this covers edge cases like manual
        -- creation or Polymarket markets without an associated event)
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
      LIMIT ${boundedTake}
      OFFSET ${boundedSkip}
    `;

    if (sortedItems.length === 0) return [];

    // Step 2: Separate IDs by type
    type SortedItem = {
      item_type: string;
      group_id: number | null;
      condition_id: string | null;
      prediction_count: bigint;
    };
    const groupIds = sortedItems
      .filter((r: SortedItem) => r.item_type === 'group' && r.group_id !== null)
      .map((r: SortedItem) => r.group_id as number);
    const conditionIds = sortedItems
      .filter(
        (r: SortedItem) =>
          r.item_type === 'condition' && r.condition_id !== null
      )
      .map((r: SortedItem) => r.condition_id as string);

    // Step 3: Fetch full records via Prisma ORM (type-safe, includes relations)
    // Define the include type for groups to help TypeScript
    // Apply the same filters to nested conditions that we used in the SQL query
    // Build Prisma where clause for nested conditions (mirrors SQL filter)
    const resolvedPrismaFilter = (() => {
      if (resolutionStatus && resolutionStatus !== ResolutionStatus.all) {
        switch (resolutionStatus) {
          case ResolutionStatus.unresolved:
            return { settled: false };
          case ResolutionStatus.resolved:
            return { settled: true };
          case ResolutionStatus.resolvedYes:
            return { settled: true, resolvedToYes: true };
          case ResolutionStatus.resolvedNo:
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
      ...(minSimilarMarketVolume != null
        ? { gte: minSimilarMarketVolume }
        : {}),
      ...(maxSimilarMarketVolume != null
        ? { lte: maxSimilarMarketVolume }
        : {}),
    };

    const prismaSimilarMarketVolumeFilter = (() => {
      if (Object.keys(similarMarketVolumeRangeFilter).length === 0) return {};
      if (!useWindowedSimilarMarketVolume) {
        return { similarMarketVolume: similarMarketVolumeRangeFilter };
      }
      const fieldByResolvedVolumeKey = {
        volume1h: 'similarMarketVolume1h',
        volume4h: 'similarMarketVolume4h',
        volume24h: 'similarMarketVolume24h',
        volume7d: 'similarMarketVolume7d',
      } as const;
      const field = fieldByResolvedVolumeKey[resolvedVolumeKey];
      return { [field]: similarMarketVolumeRangeFilter };
    })();

    const conditionWhere = {
      public: true,
      ...(chainId !== null ? { chainId } : {}),
      ...resolvedPrismaFilter,
      ...(minEndTime !== null ? { endTime: { gte: minEndTime } } : {}),
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
        : [],
      conditionIds.length > 0
        ? prisma.condition.findMany({
            where: { id: { in: conditionIds } },
            include: { category: true },
          })
        : [],
    ]);

    // Step 4: Build lookup maps for fast access
    type GroupWithRelations = (typeof groups)[number];
    type ConditionWithRelations = (typeof conditions)[number];

    const groupMap = new Map<number, GroupWithRelations>();
    for (const g of groups) {
      groupMap.set(g.id, g);
    }

    const conditionMap = new Map<string, ConditionWithRelations>();
    for (const c of conditions) {
      conditionMap.set(c.id, c);
    }

    // Step 5: Reconstruct in original SQL order
    const result: Question[] = [];
    for (const item of sortedItems) {
      if (item.item_type === 'group' && item.group_id !== null) {
        const group = groupMap.get(item.group_id);
        if (group) {
          if (group.condition.length === 1) {
            // Unwrap single-condition groups as standalone conditions
            result.push({
              questionType: QuestionItemType.condition,
              group: null,
              condition: group.condition[0] as Condition,
              predictionCount: Number(item.prediction_count),
            });
          } else if (group.condition.length > 1) {
            result.push({
              questionType: QuestionItemType.group,
              group: {
                ...group,
                conditions: group.condition, // Map Prisma 'condition' to GraphQL 'conditions'
              } as unknown as ConditionGroup,
              condition: null,
              predictionCount: Number(item.prediction_count),
            });
          }
        }
      } else if (item.item_type === 'condition' && item.condition_id !== null) {
        const condition = conditionMap.get(item.condition_id);
        if (condition) {
          result.push({
            questionType: QuestionItemType.condition,
            group: null,
            condition: condition as Condition,
            predictionCount: Number(item.prediction_count),
          });
        }
      }
    }

    return result;
  }
}
