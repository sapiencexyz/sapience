import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { GroupByCache_candleArgs } from "./args/GroupByCache_candleArgs";
import { Cache_candle } from "../../../models/Cache_candle";
import { Cache_candleGroupBy } from "../../outputs/Cache_candleGroupBy";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_candle)
export class GroupByCache_candleResolver {
  @TypeGraphQL.Query(_returns => [Cache_candleGroupBy], {
    nullable: false
  })
  async groupByCache_candle(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: GroupByCache_candleArgs): Promise<Cache_candleGroupBy[]> {
    const { _count, _avg, _sum, _min, _max } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).cache_candle.groupBy({
      ...args,
      ...Object.fromEntries(
        Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)
      ),
    });
  }
}
