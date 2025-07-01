import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueCache_paramArgs } from "./args/FindUniqueCache_paramArgs";
import { Cache_param } from "../../../models/Cache_param";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_param)
export class FindUniqueCache_paramResolver {
  @TypeGraphQL.Query(_returns => Cache_param, {
    nullable: true
  })
  async cache_param(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindUniqueCache_paramArgs): Promise<Cache_param | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).cache_param.findUnique({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
