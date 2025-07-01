import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateCache_paramArgs } from "./args/AggregateCache_paramArgs";
import { Cache_param } from "../../../models/Cache_param";
import { AggregateCache_param } from "../../outputs/AggregateCache_param";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Cache_param)
export class AggregateCache_paramResolver {
  @TypeGraphQL.Query(_returns => AggregateCache_param, {
    nullable: false
  })
  async aggregateCache_param(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateCache_paramArgs): Promise<AggregateCache_param> {
    return getPrismaFromContext(ctx).cache_param.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }
}
