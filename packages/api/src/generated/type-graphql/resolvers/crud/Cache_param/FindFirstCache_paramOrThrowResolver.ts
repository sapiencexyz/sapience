import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindFirstCache_paramOrThrowArgs } from "./args/FindFirstCache_paramOrThrowArgs";
import { Cache_param } from "../../../models/Cache_param";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_param)
export class FindFirstCache_paramOrThrowResolver {
  @TypeGraphQL.Query(_returns => Cache_param, {
    nullable: true
  })
  async findFirstCache_paramOrThrow(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstCache_paramOrThrowArgs): Promise<Cache_param | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).cache_param.findFirstOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
