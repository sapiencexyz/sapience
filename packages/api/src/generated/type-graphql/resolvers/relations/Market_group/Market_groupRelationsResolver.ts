import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { Category } from "../../../models/Category";
import { Event } from "../../../models/Event";
import { Market } from "../../../models/Market";
import { Market_group } from "../../../models/Market_group";
import { Resource } from "../../../models/Resource";
import { Market_groupCategoryArgs } from "./args/Market_groupCategoryArgs";
import { Market_groupEventArgs } from "./args/Market_groupEventArgs";
import { Market_groupMarketArgs } from "./args/Market_groupMarketArgs";
import { Market_groupResourceArgs } from "./args/Market_groupResourceArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_group)
export class Market_groupRelationsResolver {
  @TypeGraphQL.FieldResolver(_type => [Event], {
    nullable: false
  })
  async event(@TypeGraphQL.Root() market_group: Market_group, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: Market_groupEventArgs): Promise<Event[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_group.findUniqueOrThrow({
      where: {
        id: market_group.id,
      },
    }).event({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => [Market], {
    nullable: false
  })
  async market(@TypeGraphQL.Root() market_group: Market_group, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: Market_groupMarketArgs): Promise<Market[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_group.findUniqueOrThrow({
      where: {
        id: market_group.id,
      },
    }).market({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => Resource, {
    nullable: true
  })
  async resource(@TypeGraphQL.Root() market_group: Market_group, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: Market_groupResourceArgs): Promise<Resource | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_group.findUniqueOrThrow({
      where: {
        id: market_group.id,
      },
    }).resource({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => Category, {
    nullable: true
  })
  async category(@TypeGraphQL.Root() market_group: Market_group, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: Market_groupCategoryArgs): Promise<Category | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_group.findUniqueOrThrow({
      where: {
        id: market_group.id,
      },
    }).category({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
