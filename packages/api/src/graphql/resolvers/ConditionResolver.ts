import { Arg, Ctx, Info, Int, Query, Resolver } from 'type-graphql';
import { GraphQLResolveInfo } from 'graphql';
import {
  Condition,
  ConditionWhereInput,
  ConditionOrderByWithRelationInput,
  ConditionWhereUniqueInput,
  ConditionScalarFieldEnum,
} from '@generated/type-graphql';
import {
  transformInfoIntoPrismaArgs,
  getPrismaFromContext,
  transformCountFieldIntoSelectRelationsCount,
} from '@generated/type-graphql/helpers';
import type { ApolloContext } from '../startApolloServer';

/**
 * Custom Condition resolver that defaults to hiding private conditions (public: false).
 *
 * By default, queries only return public conditions. To include private conditions
 * (e.g., for admin views), explicitly pass a filter like:
 *   - `where: { public: { equals: false } }` for private only
 *   - `where: { OR: [{ public: { equals: true } }, { public: { equals: false } }] }` for all
 *
 * Exception: When fetching by specific ID(s), the public filter is bypassed to allow
 * retrieving any condition by its known identifier.
 *
 * This resolver replaces the generated FindManyConditionResolver and FindFirstConditionResolver.
 */
@Resolver(() => Condition)
export class ConditionResolver {
  @Query(() => [Condition], { nullable: false })
  async conditions(
    @Ctx() ctx: ApolloContext,
    @Info() info: GraphQLResolveInfo,
    @Arg('where', () => ConditionWhereInput, { nullable: true })
    where?: ConditionWhereInput,
    @Arg('orderBy', () => [ConditionOrderByWithRelationInput], {
      nullable: true,
    })
    orderBy?: ConditionOrderByWithRelationInput[],
    @Arg('cursor', () => ConditionWhereUniqueInput, { nullable: true })
    cursor?: ConditionWhereUniqueInput,
    @Arg('take', () => Int, { nullable: true }) take?: number,
    @Arg('skip', () => Int, { nullable: true }) skip?: number,
    @Arg('distinct', () => [ConditionScalarFieldEnum], { nullable: true })
    distinct?: Array<
      | 'id'
      | 'createdAt'
      | 'question'
      | 'shortName'
      | 'categoryId'
      | 'endTime'
      | 'public'
      | 'claimStatement'
      | 'description'
      | 'similarMarkets'
      | 'chainId'
      | 'openInterest'
      | 'resolver'
      | 'settled'
      | 'resolvedToYes'
      | 'settledAt'
      | 'assertionId'
      | 'assertionTimestamp'
      | 'conditionGroupId'
      | 'displayOrder'
    >
  ): Promise<Condition[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);

    // Check if the query is filtering by specific ID(s) - bypass public filter in this case
    const hasIdFilter = this.hasIdFilter(where);

    // Check if the user explicitly specified a filter on the `public` field
    const hasExplicitPublicFilter = this.hasPublicFilter(where);

    // If filtering by ID or explicit public filter, use where as-is
    // Otherwise, default to showing only public conditions
    const effectiveWhere: ConditionWhereInput =
      hasIdFilter || hasExplicitPublicFilter
        ? (where ?? {})
        : {
            ...where,
            public: { equals: true },
          };

    return getPrismaFromContext(ctx).condition.findMany({
      where: effectiveWhere,
      orderBy,
      cursor,
      take,
      skip,
      distinct,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @Query(() => Condition, { nullable: true })
  async findFirstCondition(
    @Ctx() ctx: ApolloContext,
    @Info() info: GraphQLResolveInfo,
    @Arg('where', () => ConditionWhereInput, { nullable: true })
    where?: ConditionWhereInput,
    @Arg('orderBy', () => [ConditionOrderByWithRelationInput], {
      nullable: true,
    })
    orderBy?: ConditionOrderByWithRelationInput[],
    @Arg('cursor', () => ConditionWhereUniqueInput, { nullable: true })
    cursor?: ConditionWhereUniqueInput,
    @Arg('take', () => Int, { nullable: true }) take?: number,
    @Arg('skip', () => Int, { nullable: true }) skip?: number,
    @Arg('distinct', () => [ConditionScalarFieldEnum], { nullable: true })
    distinct?: Array<
      | 'id'
      | 'createdAt'
      | 'question'
      | 'shortName'
      | 'categoryId'
      | 'endTime'
      | 'public'
      | 'claimStatement'
      | 'description'
      | 'similarMarkets'
      | 'chainId'
      | 'openInterest'
      | 'resolver'
      | 'settled'
      | 'resolvedToYes'
      | 'settledAt'
      | 'assertionId'
      | 'assertionTimestamp'
      | 'conditionGroupId'
      | 'displayOrder'
    >
  ): Promise<Condition | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);

    const hasIdFilter = this.hasIdFilter(where);
    const hasExplicitPublicFilter = this.hasPublicFilter(where);

    const effectiveWhere: ConditionWhereInput =
      hasIdFilter || hasExplicitPublicFilter
        ? (where ?? {})
        : {
            ...where,
            public: { equals: true },
          };

    return getPrismaFromContext(ctx).condition.findFirst({
      where: effectiveWhere,
      orderBy,
      cursor,
      take,
      skip,
      distinct,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  /**
   * Checks if the where input contains a filter on the `id` field.
   * When fetching by specific ID(s), we bypass the public filter.
   */
  private hasIdFilter(where?: ConditionWhereInput): boolean {
    if (!where) return false;

    // Check direct id filter (e.g., { id: { equals: "..." } } or { id: { in: [...] } })
    if (where.id !== undefined) return true;

    // Check in AND clauses
    if (where.AND) {
      const andClauses = Array.isArray(where.AND) ? where.AND : [where.AND];
      if (andClauses.some((clause) => this.hasIdFilter(clause))) return true;
    }

    return false;
  }

  /**
   * Recursively checks if the where input contains an explicit filter on the `public` field.
   * This includes direct filters, as well as filters within AND, OR, and NOT clauses.
   */
  private hasPublicFilter(where?: ConditionWhereInput): boolean {
    if (!where) return false;

    // Check direct public filter
    if (where.public !== undefined) return true;

    // Check in AND clauses
    if (where.AND) {
      const andClauses = Array.isArray(where.AND) ? where.AND : [where.AND];
      if (andClauses.some((clause) => this.hasPublicFilter(clause)))
        return true;
    }

    // Check in OR clauses
    if (where.OR) {
      if (where.OR.some((clause) => this.hasPublicFilter(clause))) return true;
    }

    // Check in NOT clauses
    if (where.NOT) {
      const notClauses = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
      if (notClauses.some((clause) => this.hasPublicFilter(clause)))
        return true;
    }

    return false;
  }
}
