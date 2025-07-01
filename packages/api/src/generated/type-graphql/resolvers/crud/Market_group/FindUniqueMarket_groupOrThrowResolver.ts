import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueMarket_groupOrThrowArgs } from "./args/FindUniqueMarket_groupOrThrowArgs";
import { Market_group } from "../../../models/Market_group";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_group)
export class FindUniqueMarket_groupOrThrowResolver {
  @TypeGraphQL.Query(_returns => Market_group, {
    nullable: true
  })
  async getMarket_group(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindUniqueMarket_groupOrThrowArgs): Promise<Market_group | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_group.findUniqueOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
