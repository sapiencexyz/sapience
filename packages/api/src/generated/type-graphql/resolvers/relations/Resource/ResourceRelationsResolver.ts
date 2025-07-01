import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { Category } from "../../../models/Category";
import { Market_group } from "../../../models/Market_group";
import { Resource } from "../../../models/Resource";
import { Resource_price } from "../../../models/Resource_price";
import { ResourceCategoryArgs } from "./args/ResourceCategoryArgs";
import { ResourceMarket_groupArgs } from "./args/ResourceMarket_groupArgs";
import { ResourceResource_priceArgs } from "./args/ResourceResource_priceArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Resource)
export class ResourceRelationsResolver {
  @TypeGraphQL.FieldResolver(_type => [Market_group], {
    nullable: false
  })
  async market_group(@TypeGraphQL.Root() resource: Resource, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: ResourceMarket_groupArgs): Promise<Market_group[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).resource.findUniqueOrThrow({
      where: {
        id: resource.id,
      },
    }).market_group({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => Category, {
    nullable: true
  })
  async category(@TypeGraphQL.Root() resource: Resource, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: ResourceCategoryArgs): Promise<Category | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).resource.findUniqueOrThrow({
      where: {
        id: resource.id,
      },
    }).category({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => [Resource_price], {
    nullable: false
  })
  async resource_price(@TypeGraphQL.Root() resource: Resource, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: ResourceResource_priceArgs): Promise<Resource_price[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).resource.findUniqueOrThrow({
      where: {
        id: resource.id,
      },
    }).resource_price({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
