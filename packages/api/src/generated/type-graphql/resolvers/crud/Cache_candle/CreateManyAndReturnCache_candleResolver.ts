import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnCache_candleArgs } from "./args/CreateManyAndReturnCache_candleArgs";
import { Cache_candle } from "../../../models/Cache_candle";
import { CreateManyAndReturnCache_candle } from "../../outputs/CreateManyAndReturnCache_candle";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_candle)
export class CreateManyAndReturnCache_candleResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnCache_candle], {
    nullable: false
  })
  async createManyAndReturnCache_candle(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnCache_candleArgs): Promise<CreateManyAndReturnCache_candle[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).cache_candle.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
