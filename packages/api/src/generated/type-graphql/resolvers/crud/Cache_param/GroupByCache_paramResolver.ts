import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { GroupByCache_paramArgs } from "./args/GroupByCache_paramArgs";
import { Cache_param } from "../../../models/Cache_param";
import { Cache_paramGroupBy } from "../../outputs/Cache_paramGroupBy";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_param)
export class GroupByCache_paramResolver {
  @TypeGraphQL.Query(_returns => [Cache_paramGroupBy], {
    nullable: false
  })
  async groupByCache_param(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: GroupByCache_paramArgs): Promise<Cache_paramGroupBy[]> {
    const { _count, _avg, _sum, _min, _max } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).cache_param.groupBy({
      ...args,
      ...Object.fromEntries(
        Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)
      ),
    });
  }
}
