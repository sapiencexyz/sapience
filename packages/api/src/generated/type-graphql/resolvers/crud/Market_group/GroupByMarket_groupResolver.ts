import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { GroupByMarket_groupArgs } from "./args/GroupByMarket_groupArgs";
import { Market_group } from "../../../models/Market_group";
import { Market_groupGroupBy } from "../../outputs/Market_groupGroupBy";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_group)
export class GroupByMarket_groupResolver {
  @TypeGraphQL.Query(_returns => [Market_groupGroupBy], {
    nullable: false
  })
  async groupByMarket_group(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: GroupByMarket_groupArgs): Promise<Market_groupGroupBy[]> {
    const { _count, _avg, _sum, _min, _max } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_group.groupBy({
      ...args,
      ...Object.fromEntries(
        Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)
      ),
    });
  }
}
