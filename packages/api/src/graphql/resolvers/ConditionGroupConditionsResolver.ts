import { Resolver, FieldResolver, Root, Ctx, Args } from 'type-graphql';
import { ConditionGroup, Condition, Category } from '@generated/type-graphql';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- @Args() needs runtime class, not just type
import {
  ConditionGroupConditionArgs,
  ConditionGroupCategoryArgs,
} from '@generated/type-graphql/resolvers/relations/ConditionGroup/args';
import { getPrismaFromContext } from '@generated/type-graphql/helpers';

/**
 * Replaces the auto-generated ConditionGroupRelationsResolver to always
 * filter out private conditions (public = false) from group responses.
 *
 * Preserves the same args interface (where, orderBy, take, skip, etc.)
 * so existing consumers are unaffected — but merges public: true into
 * the where clause server-side.
 *
 * Also re-implements the category field resolver since we removed the
 * entire generated ConditionGroupRelationsResolver.
 */
@Resolver(() => ConditionGroup)
export class ConditionGroupConditionsResolver {
  @FieldResolver(() => [Condition], { nullable: false })
  async conditions(
    @Root() conditionGroup: ConditionGroup,
    @Ctx() ctx: unknown,
    @Args() args: ConditionGroupConditionArgs
  ): Promise<Condition[]> {
    return getPrismaFromContext(ctx)
      .conditionGroup.findUniqueOrThrow({
        where: { id: conditionGroup.id },
      })
      .condition({
        ...args,
        where: { ...args.where, public: true },
        orderBy: args.orderBy ?? { displayOrder: 'asc' },
      });
  }

  @FieldResolver(() => Category, { nullable: true })
  async category(
    @Root() conditionGroup: ConditionGroup,
    @Ctx() ctx: unknown,
    @Args() args: ConditionGroupCategoryArgs
  ): Promise<Category | null> {
    return getPrismaFromContext(ctx)
      .conditionGroup.findUniqueOrThrow({
        where: { id: conditionGroup.id },
      })
      .category(args);
  }
}
