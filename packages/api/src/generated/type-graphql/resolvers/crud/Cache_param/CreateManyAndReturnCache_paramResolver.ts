import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnCache_paramArgs } from "./args/CreateManyAndReturnCache_paramArgs";
import { Cache_param } from "../../../models/Cache_param";
import { CreateManyAndReturnCache_param } from "../../outputs/CreateManyAndReturnCache_param";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_param)
export class CreateManyAndReturnCache_paramResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnCache_param], {
    nullable: false
  })
  async createManyAndReturnCache_param(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnCache_paramArgs): Promise<CreateManyAndReturnCache_param[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).cache_param.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
