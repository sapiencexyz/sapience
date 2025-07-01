import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindFirstCache_candleOrThrowArgs } from "./args/FindFirstCache_candleOrThrowArgs";
import { Cache_candle } from "../../../models/Cache_candle";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_candle)
export class FindFirstCache_candleOrThrowResolver {
  @TypeGraphQL.Query(_returns => Cache_candle, {
    nullable: true
  })
  async findFirstCache_candleOrThrow(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstCache_candleOrThrowArgs): Promise<Cache_candle | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).cache_candle.findFirstOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
