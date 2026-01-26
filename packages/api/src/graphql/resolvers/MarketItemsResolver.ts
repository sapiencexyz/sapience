import {
  ObjectType,
  Field,
  Int,
  Query,
  Resolver,
  Arg,
  Ctx,
} from 'type-graphql';
import { ConditionGroup, Condition } from '@generated/type-graphql';
import { getPrismaFromContext } from '@generated/type-graphql/helpers';
import { Prisma } from '../../../generated/prisma';
import type { ApolloContext } from '../startApolloServer';

/**
 * Wrapper type for market items that can be either a condition group or an ungrouped condition.
 * This allows returning a single sorted list where groups and conditions are interleaved
 * based on their sort value (openInterest or endTime).
 */
@ObjectType()
export class MarketItem {
  @Field(() => String)
  itemType!: 'group' | 'condition';

  @Field(() => ConditionGroup, { nullable: true })
  group?: ConditionGroup | null;

  @Field(() => Condition, { nullable: true })
  condition?: Condition | null;
}

/**
 * Resolver for fetching market items (both condition groups and ungrouped conditions)
 * sorted together by aggregate/individual values.
 *
 * Uses a UNION SQL query to:
 * 1. Get groups with their aggregate openInterest (SUM) or min endTime
 * 2. Get ungrouped conditions with their individual values
 * 3. Sort them together and apply pagination
 * 4. Fetch full records via Prisma ORM for type safety
 */
@Resolver()
export class MarketItemsResolver {
  @Query(() => [MarketItem], { nullable: false })
  async marketItemsSorted(
    @Ctx() ctx: ApolloContext,
    @Arg('take', () => Int) take: number,
    @Arg('skip', () => Int) skip: number,
    @Arg('chainId', () => Int, { nullable: true }) chainId: number | null,
    @Arg('sortField', () => String) sortField: string,
    @Arg('sortDirection', () => String) sortDirection: string,
    @Arg('search', () => String, { nullable: true }) search: string | null,
    @Arg('categorySlugs', () => [String], { nullable: true })
    categorySlugs: string[] | null,
    @Arg('excludeSettled', () => Boolean, { nullable: true })
    excludeSettled: boolean | null,
    @Arg('minEndTime', () => Int, { nullable: true })
    minEndTime: number | null
  ): Promise<MarketItem[]> {
    const prisma = getPrismaFromContext(ctx);

    // Validate and sanitize sort direction - only allow 'ASC' or 'DESC'
    const dir = sortDirection === 'asc' ? 'ASC' : 'DESC';

    // Step 1: UNION query to get both groups and ungrouped conditions sorted together
    // For groups: aggregate openInterest (SUM) or min endTime
    // For conditions: individual openInterest or endTime
    // Note: condition_group.id is integer, condition.id is string (text)
    // We store them separately and use item_type to determine which ID to use
    const sortedItems = await prisma.$queryRaw<
      {
        item_type: string;
        group_id: number | null;
        condition_id: string | null;
        sort_value: string;
      }[]
    >`
      WITH combined AS (
        -- Groups: aggregate by SUM(openInterest) or MIN(endTime)
        SELECT
          'group' as item_type,
          cg.id as group_id,
          NULL::text as condition_id,
          ${
            sortField === 'openInterest'
              ? Prisma.sql`COALESCE(SUM(c."openInterest"::numeric), 0)::text`
              : Prisma.sql`COALESCE(MIN(c."endTime"), 2147483647)::text`
          } as sort_value
        FROM condition_group cg
        LEFT JOIN condition c ON c."conditionGroupId" = cg.id
          AND c.public = true
          ${chainId !== null ? Prisma.sql`AND c."chainId" = ${chainId}` : Prisma.empty}
          ${excludeSettled ? Prisma.sql`AND c.settled = false` : Prisma.empty}
          ${minEndTime !== null ? Prisma.sql`AND c."endTime" >= ${minEndTime}` : Prisma.empty}
        WHERE 1=1
          ${search ? Prisma.sql`AND cg.name ILIKE ${'%' + search + '%'}` : Prisma.empty}
          ${
            categorySlugs?.length
              ? Prisma.sql`AND cg."categoryId" IN (SELECT id FROM category WHERE slug = ANY(${categorySlugs}::text[]))`
              : Prisma.empty
          }
        GROUP BY cg.id
        HAVING COUNT(c.id) > 0

        UNION ALL

        -- Ungrouped conditions: individual values
        SELECT
          'condition' as item_type,
          NULL::integer as group_id,
          c.id as condition_id,
          ${
            sortField === 'openInterest'
              ? Prisma.sql`COALESCE(c."openInterest"::numeric, 0)::text`
              : Prisma.sql`COALESCE(c."endTime", 2147483647)::text`
          } as sort_value
        FROM condition c
        WHERE c."conditionGroupId" IS NULL
          AND c.public = true
          ${chainId !== null ? Prisma.sql`AND c."chainId" = ${chainId}` : Prisma.empty}
          ${excludeSettled ? Prisma.sql`AND c.settled = false` : Prisma.empty}
          ${minEndTime !== null ? Prisma.sql`AND c."endTime" >= ${minEndTime}` : Prisma.empty}
          ${
            search
              ? Prisma.sql`AND (c.question ILIKE ${'%' + search + '%'} OR c."shortName" ILIKE ${'%' + search + '%'})`
              : Prisma.empty
          }
          ${
            categorySlugs?.length
              ? Prisma.sql`AND c."categoryId" IN (SELECT id FROM category WHERE slug = ANY(${categorySlugs}::text[]))`
              : Prisma.empty
          }
      )
      SELECT item_type, group_id, condition_id, sort_value
      FROM combined
      ORDER BY sort_value::numeric ${Prisma.raw(dir)},
               item_type ASC,
               COALESCE(group_id, 0) ASC,
               COALESCE(condition_id, '') ASC
      LIMIT ${take}
      OFFSET ${skip}
    `;

    if (sortedItems.length === 0) return [];

    // Step 2: Separate IDs by type
    type SortedItem = {
      item_type: string;
      group_id: number | null;
      condition_id: string | null;
      sort_value: string;
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
    const conditionWhere = {
      public: true,
      ...(chainId !== null ? { chainId } : {}),
      ...(excludeSettled ? { settled: false } : {}),
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

    const groups =
      groupIds.length > 0
        ? await prisma.conditionGroup.findMany({
            where: { id: { in: groupIds } },
            include: groupInclude,
          })
        : [];

    const conditions =
      conditionIds.length > 0
        ? await prisma.condition.findMany({
            where: { id: { in: conditionIds } },
            include: { category: true },
          })
        : [];

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
    const result: MarketItem[] = [];
    for (const item of sortedItems) {
      if (item.item_type === 'group' && item.group_id !== null) {
        const group = groupMap.get(item.group_id);
        if (group) {
          result.push({
            itemType: 'group',
            group: {
              ...group,
              conditions: group.condition, // Map Prisma 'condition' to GraphQL 'conditions'
            } as unknown as ConditionGroup,
            condition: null,
          });
        }
      } else if (item.item_type === 'condition' && item.condition_id !== null) {
        const condition = conditionMap.get(item.condition_id);
        if (condition) {
          result.push({
            itemType: 'condition',
            group: null,
            condition: condition as Condition,
          });
        }
      }
    }

    return result;
  }
}
