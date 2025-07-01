import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindFirstMarket_groupArgs } from "./args/FindFirstMarket_groupArgs";
import { Market_group } from "../../../models/Market_group";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_group)
export class FindFirstMarket_groupResolver {
  @TypeGraphQL.Query(_returns => Market_group, {
    nullable: true
  })
  async findFirstMarket_group(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstMarket_groupArgs): Promise<Market_group | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_group.findFirst({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
