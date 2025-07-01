import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueMarket_priceOrThrowArgs } from "./args/FindUniqueMarket_priceOrThrowArgs";
import { Market_price } from "../../../models/Market_price";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_price)
export class FindUniqueMarket_priceOrThrowResolver {
  @TypeGraphQL.Query(_returns => Market_price, {
    nullable: true
  })
  async getMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindUniqueMarket_priceOrThrowArgs): Promise<Market_price | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.findUniqueOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
