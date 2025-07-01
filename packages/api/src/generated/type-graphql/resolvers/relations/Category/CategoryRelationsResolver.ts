import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { Category } from "../../../models/Category";
import { Market_group } from "../../../models/Market_group";
import { Resource } from "../../../models/Resource";
import { CategoryMarket_groupArgs } from "./args/CategoryMarket_groupArgs";
import { CategoryResourceArgs } from "./args/CategoryResourceArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Category)
export class CategoryRelationsResolver {
  @TypeGraphQL.FieldResolver(_type => [Market_group], {
    nullable: false
  })
  async market_group(@TypeGraphQL.Root() category: Category, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CategoryMarket_groupArgs): Promise<Market_group[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).category.findUniqueOrThrow({
      where: {
        id: category.id,
      },
    }).market_group({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => [Resource], {
    nullable: false
  })
  async resource(@TypeGraphQL.Root() category: Category, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CategoryResourceArgs): Promise<Resource[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).category.findUniqueOrThrow({
      where: {
        id: category.id,
      },
    }).resource({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
