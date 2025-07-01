import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateMarket_priceArgs } from "./args/AggregateMarket_priceArgs";
import { Market_price } from "../../../models/Market_price";
import { AggregateMarket_price } from "../../outputs/AggregateMarket_price";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_price)
export class AggregateMarket_priceResolver {
  @TypeGraphQL.Query(_returns => AggregateMarket_price, {
    nullable: false
  })
  async aggregateMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateMarket_priceArgs): Promise<AggregateMarket_price> {
    return getPrismaFromContext(ctx).market_price.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }
}
