import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateMarket_groupArgs } from "./args/AggregateMarket_groupArgs";
import { Market_group } from "../../../models/Market_group";
import { AggregateMarket_group } from "../../outputs/AggregateMarket_group";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_group)
export class AggregateMarket_groupResolver {
  @TypeGraphQL.Query(_returns => AggregateMarket_group, {
    nullable: false
  })
  async aggregateMarket_group(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateMarket_groupArgs): Promise<AggregateMarket_group> {
    return getPrismaFromContext(ctx).market_group.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }
}
