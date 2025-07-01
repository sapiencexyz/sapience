import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindFirstResource_priceOrThrowArgs } from "./args/FindFirstResource_priceOrThrowArgs";
import { Resource_price } from "../../../models/Resource_price";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Resource_price)
export class FindFirstResource_priceOrThrowResolver {
  @TypeGraphQL.Query(_returns => Resource_price, {
    nullable: true
  })
  async findFirstResource_priceOrThrow(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstResource_priceOrThrowArgs): Promise<Resource_price | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).resource_price.findFirstOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
