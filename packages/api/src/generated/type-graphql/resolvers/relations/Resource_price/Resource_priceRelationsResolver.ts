import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { Resource } from "../../../models/Resource";
import { Resource_price } from "../../../models/Resource_price";
import { Resource_priceResourceArgs } from "./args/Resource_priceResourceArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Resource_price)
export class Resource_priceRelationsResolver {
  @TypeGraphQL.FieldResolver(_type => Resource, {
    nullable: true
  })
  async resource(@TypeGraphQL.Root() resource_price: Resource_price, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: Resource_priceResourceArgs): Promise<Resource | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).resource_price.findUniqueOrThrow({
      where: {
        id: resource_price.id,
      },
    }).resource({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
