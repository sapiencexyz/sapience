import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateCache_candleArgs } from "./args/AggregateCache_candleArgs";
import { Cache_candle } from "../../../models/Cache_candle";
import { AggregateCache_candle } from "../../outputs/AggregateCache_candle";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_candle)
export class AggregateCache_candleResolver {
  @TypeGraphQL.Query(_returns => AggregateCache_candle, {
    nullable: false
  })
  async aggregateCache_candle(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateCache_candleArgs): Promise<AggregateCache_candle> {
    return getPrismaFromContext(ctx).cache_candle.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }
}
