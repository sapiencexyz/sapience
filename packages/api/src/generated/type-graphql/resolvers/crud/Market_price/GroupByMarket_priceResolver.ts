import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { GroupByMarket_priceArgs } from "./args/GroupByMarket_priceArgs";
import { Market_price } from "../../../models/Market_price";
import { Market_priceGroupBy } from "../../outputs/Market_priceGroupBy";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_price)
export class GroupByMarket_priceResolver {
  @TypeGraphQL.Query(_returns => [Market_priceGroupBy], {
    nullable: false
  })
  async groupByMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: GroupByMarket_priceArgs): Promise<Market_priceGroupBy[]> {
    const { _count, _avg, _sum, _min, _max } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.groupBy({
      ...args,
      ...Object.fromEntries(
        Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)
      ),
    });
  }
}
