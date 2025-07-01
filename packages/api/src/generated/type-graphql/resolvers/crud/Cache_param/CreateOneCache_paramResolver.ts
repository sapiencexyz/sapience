import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateOneCache_paramArgs } from "./args/CreateOneCache_paramArgs";
import { Cache_param } from "../../../models/Cache_param";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_param)
export class CreateOneCache_paramResolver {
  @TypeGraphQL.Mutation(_returns => Cache_param, {
    nullable: false
  })
  async createOneCache_param(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateOneCache_paramArgs): Promise<Cache_param> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).cache_param.create({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
