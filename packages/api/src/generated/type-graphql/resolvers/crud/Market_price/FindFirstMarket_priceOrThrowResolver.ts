import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindFirstMarket_priceOrThrowArgs } from "./args/FindFirstMarket_priceOrThrowArgs";
import { Market_price } from "../../../models/Market_price";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_price)
export class FindFirstMarket_priceOrThrowResolver {
  @TypeGraphQL.Query(_returns => Market_price, {
    nullable: true
  })
  async findFirstMarket_priceOrThrow(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstMarket_priceOrThrowArgs): Promise<Market_price | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.findFirstOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
