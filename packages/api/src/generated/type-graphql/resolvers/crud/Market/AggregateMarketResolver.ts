import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateMarketArgs } from "./args/AggregateMarketArgs";
import { Market } from "../../../models/Market";
import { AggregateMarket } from "../../outputs/AggregateMarket";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market)
export class AggregateMarketResolver {
  @TypeGraphQL.Query(_returns => AggregateMarket, {
    nullable: false
  })
  async aggregateMarket(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateMarketArgs): Promise<AggregateMarket> {
    return getPrismaFromContext(ctx).market.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }
}
