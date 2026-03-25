import {
  ObjectType,
  Field,
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
}

registerEnumType(QuestionSortField, {
  name: 'QuestionSortField',
  description: 'Field to sort questions by',
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
 * Uses a UNION SQL query to:
 * 1. Get groups with their aggregate openInterest (SUM) or min endTime
 * 2. Get ungrouped conditions with their individual values
 * 3. Sort them together and apply pagination
 * 4. Fetch full records via Prisma ORM for type safety
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
    resolutionStatus: ResolutionStatus | null
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

    const nowSec = Math.floor(Date.now() / 1000);

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

    // Step 1: UNION query to get groups, ungrouped conditions, and expired group
    // conditions sorted together.
    // - Part A: Active groups (not all-expired) with aggregate sort values
    // - Part B: Ungrouped conditions with individual sort values
    // - Part C: Individual conditions from expired groups (OI > 0), sorted by their own values
    // This fixes OI sort order for expired groups by returning their conditions individually.
    // Note: condition_group.id is integer, condition.id is string (text)
    // We store them separately and use item_type to determine which ID to use
    const sortedItems = await prisma.$queryRaw<
      {
        item_type: string;
        group_id: number | null;
        condition_id: string | null;
        prediction_count: bigint;
      }[]
    >`
      WITH expired_groups AS (
        -- Groups where ALL matching conditions have ended
        SELECT cg.id
        FROM condition_group cg
        INNER JOIN condition c ON c."conditionGroupId" = cg.id
          AND c.public = true
          ${chainId != null ? Prisma.sql`AND c."chainId" = ${chainId}` : Prisma.empty}
          ${resolvedFilter}
          ${minEndTime != null ? Prisma.sql`AND c."endTime" >= ${minEndTime}` : Prisma.empty}
        GROUP BY cg.id
        HAVING MAX(c."endTime") <= ${nowSec}
      ),
      combined AS (
        -- Part A: Active groups only (exclude expired)
        SELECT
          'group' as item_type,
          cg.id as group_id,
          NULL::text as condition_id,
          ${
            sanitizedSortField === QuestionSortField.openInterest
              ? Prisma.sql`COALESCE(SUM(c."openInterest"::numeric), 0)::text`
              : sanitizedSortField === QuestionSortField.predictionCount
                ? Prisma.sql`COALESCE(SUM(c."predictionCount"), 0)::text`
                : sanitizedSortField === QuestionSortField.createdAt
                  ? Prisma.sql`COALESCE(FLOOR(EXTRACT(EPOCH FROM MAX(c."createdAt")))::bigint, 0)::text`
                  : Prisma.sql`COALESCE(MAX(c."endTime"), 0)::text`
          } as sort_value,
          COALESCE(SUM(c."predictionCount"), 0) as prediction_count,
          COALESCE(MAX(c."endTime"), 0) as end_time
        FROM condition_group cg
        LEFT JOIN condition c ON c."conditionGroupId" = cg.id
          AND c.public = true
          ${chainId != null ? Prisma.sql`AND c."chainId" = ${chainId}` : Prisma.empty}
          ${resolvedFilter}
          ${minEndTime != null ? Prisma.sql`AND c."endTime" >= ${minEndTime}` : Prisma.empty}
        WHERE NOT EXISTS (SELECT 1 FROM expired_groups eg WHERE eg.id = cg.id)
          ${
            boundedSearch
              ? Prisma.sql`AND (
                  cg.name ILIKE ${'%' + boundedSearch + '%'}
                  OR EXISTS (
                    SELECT 1 FROM condition c_tag
                    WHERE c_tag."conditionGroupId" = cg.id
                      AND c_tag.public = true
                      AND EXISTS (SELECT 1 FROM unnest(c_tag.tags) AS t WHERE t ILIKE ${'%' + boundedSearch + '%'})
                  )
                )`
              : Prisma.empty
          }
          ${
            boundedCategorySlugs?.length
              ? Prisma.sql`AND cg."categoryId" IN (SELECT id FROM category WHERE slug = ANY(${boundedCategorySlugs}::text[]))`
              : Prisma.empty
          }
        GROUP BY cg.id
        HAVING COUNT(c.id) > 0

        UNION ALL

        -- Part B: Ungrouped conditions (individual values)
        SELECT
          'condition' as item_type,
          NULL::integer as group_id,
          c.id as condition_id,
          ${
            sanitizedSortField === QuestionSortField.openInterest
              ? Prisma.sql`COALESCE(c."openInterest"::numeric, 0)::text`
              : sanitizedSortField === QuestionSortField.predictionCount
                ? Prisma.sql`c."predictionCount"::text`
                : sanitizedSortField === QuestionSortField.createdAt
                  ? Prisma.sql`COALESCE(FLOOR(EXTRACT(EPOCH FROM c."createdAt"))::bigint, 0)::text`
                  : Prisma.sql`COALESCE(c."endTime", 2147483647)::text`
          } as sort_value,
          c."predictionCount" as prediction_count,
          COALESCE(c."endTime", 2147483647) as end_time
        FROM condition c
        WHERE c."conditionGroupId" IS NULL
          AND c.public = true
          ${chainId != null ? Prisma.sql`AND c."chainId" = ${chainId}` : Prisma.empty}
          ${resolvedFilter}
          ${minEndTime != null ? Prisma.sql`AND c."endTime" >= ${minEndTime}` : Prisma.empty}
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

        UNION ALL

        -- Part C: Individual conditions from expired groups
        SELECT
          'condition' as item_type,
          NULL::integer as group_id,
          c.id as condition_id,
          ${
            sanitizedSortField === QuestionSortField.openInterest
              ? Prisma.sql`COALESCE(c."openInterest"::numeric, 0)::text`
              : sanitizedSortField === QuestionSortField.predictionCount
                ? Prisma.sql`c."predictionCount"::text`
                : sanitizedSortField === QuestionSortField.createdAt
                  ? Prisma.sql`COALESCE(FLOOR(EXTRACT(EPOCH FROM c."createdAt"))::bigint, 0)::text`
                  : Prisma.sql`COALESCE(c."endTime", 2147483647)::text`
          } as sort_value,
          c."predictionCount" as prediction_count,
          COALESCE(c."endTime", 2147483647) as end_time
        FROM condition c
        WHERE EXISTS (SELECT 1 FROM expired_groups eg WHERE eg.id = c."conditionGroupId")
          AND c.public = true
          ${chainId != null ? Prisma.sql`AND c."chainId" = ${chainId}` : Prisma.empty}
          ${resolvedFilter}
          ${minEndTime != null ? Prisma.sql`AND c."endTime" >= ${minEndTime}` : Prisma.empty}
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
      )
      SELECT item_type, group_id, condition_id, prediction_count
      FROM combined
      ORDER BY sort_value::numeric ${Prisma.raw(dir)},
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

    const conditionWhere = {
      public: true,
      ...(chainId !== null ? { chainId } : {}),
      ...resolvedPrismaFilter,
      ...(minEndTime !== null ? { endTime: { gte: minEndTime } } : {}),
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
