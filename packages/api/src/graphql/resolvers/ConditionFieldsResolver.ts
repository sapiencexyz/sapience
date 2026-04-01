import { Resolver, FieldResolver, Root, Ctx, Info, Args } from 'type-graphql';
import type { GraphQLResolveInfo } from 'graphql';
import {
  Condition,
  Category,
  ConditionGroup,
  LegacyPrediction,
  Attestation,
} from '@generated/type-graphql';
import {
  ConditionCategoryArgs,
  ConditionConditionGroupArgs,
  ConditionPredictionsArgs,
  ConditionAttestationsArgs,
} from '@generated/type-graphql/resolvers/relations/Condition/args';
import {
  getPrismaFromContext,
  transformInfoIntoPrismaArgs,
  transformCountFieldIntoSelectRelationsCount,
} from '@generated/type-graphql/helpers';

/**
 * Replaces the auto-generated ConditionRelationsResolver.
 *
 * When the parent resolver (e.g. QuestionsResolver) already loaded relations
 * via Prisma `include`, we return the pre-loaded data directly to avoid
 * redundant N+1 queries. Otherwise, we fall back to a fresh DB query
 * (identical to the generated resolver behavior).
 */
@Resolver(() => Condition)
export class ConditionFieldsResolver {
  @FieldResolver(() => Category, { nullable: true })
  async category(
    @Root() condition: Condition,
    @Ctx() ctx: unknown,
    @Info() info: GraphQLResolveInfo,
    @Args(() => ConditionCategoryArgs) args: ConditionCategoryArgs
  ): Promise<Category | null> {
    const existing = (condition as unknown as Record<string, unknown>).category;
    if (existing !== undefined) {
      return existing as Category | null;
    }

    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx)
      .condition.findUniqueOrThrow({ where: { id: condition.id } })
      .category({
        ...args,
        ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
      });
  }

  @FieldResolver(() => ConditionGroup, { nullable: true })
  async conditionGroup(
    @Root() condition: Condition,
    @Ctx() ctx: unknown,
    @Info() info: GraphQLResolveInfo,
    @Args(() => ConditionConditionGroupArgs) args: ConditionConditionGroupArgs
  ): Promise<ConditionGroup | null> {
    const existing = (condition as unknown as Record<string, unknown>)
      .conditionGroup;
    if (existing !== undefined) {
      return existing as ConditionGroup | null;
    }

    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx)
      .condition.findUniqueOrThrow({ where: { id: condition.id } })
      .conditionGroup({
        ...args,
        ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
      });
  }

  @FieldResolver(() => [LegacyPrediction], { nullable: false })
  async predictions(
    @Root() condition: Condition,
    @Ctx() ctx: unknown,
    @Info() info: GraphQLResolveInfo,
    @Args(() => ConditionPredictionsArgs) args: ConditionPredictionsArgs
  ): Promise<LegacyPrediction[]> {
    const existing = (condition as unknown as Record<string, unknown>)
      .predictions;
    if (Array.isArray(existing)) {
      return existing as LegacyPrediction[];
    }

    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx)
      .condition.findUniqueOrThrow({ where: { id: condition.id } })
      .predictions({
        ...args,
        ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
      });
  }

  @FieldResolver(() => [Attestation], { nullable: false })
  async attestations(
    @Root() condition: Condition,
    @Ctx() ctx: unknown,
    @Info() info: GraphQLResolveInfo,
    @Args(() => ConditionAttestationsArgs) args: ConditionAttestationsArgs
  ): Promise<Attestation[]> {
    const existing = (condition as unknown as Record<string, unknown>)
      .attestations;
    if (Array.isArray(existing)) {
      return existing as Attestation[];
    }

    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx)
      .condition.findUniqueOrThrow({ where: { id: condition.id } })
      .attestations({
        ...args,
        ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
      });
  }
}
