import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { DeleteOneMarket_groupArgs } from "./args/DeleteOneMarket_groupArgs";
import { Market_group } from "../../../models/Market_group";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_group)
export class DeleteOneMarket_groupResolver {
  @TypeGraphQL.Mutation(_returns => Market_group, {
    nullable: true
  })
  async deleteOneMarket_group(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: DeleteOneMarket_groupArgs): Promise<Market_group | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_group.delete({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
