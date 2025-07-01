import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { UpdateOneCache_candleArgs } from "./args/UpdateOneCache_candleArgs";
import { Cache_candle } from "../../../models/Cache_candle";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_candle)
export class UpdateOneCache_candleResolver {
  @TypeGraphQL.Mutation(_returns => Cache_candle, {
    nullable: true
  })
  async updateOneCache_candle(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: UpdateOneCache_candleArgs): Promise<Cache_candle | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).cache_candle.update({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
