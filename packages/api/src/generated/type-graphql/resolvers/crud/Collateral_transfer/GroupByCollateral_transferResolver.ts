import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { GroupByCollateral_transferArgs } from "./args/GroupByCollateral_transferArgs";
import { Collateral_transfer } from "../../../models/Collateral_transfer";
import { Collateral_transferGroupBy } from "../../outputs/Collateral_transferGroupBy";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Collateral_transfer)
export class GroupByCollateral_transferResolver {
  @TypeGraphQL.Query(_returns => [Collateral_transferGroupBy], {
    nullable: false
  })
  async groupByCollateral_transfer(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: GroupByCollateral_transferArgs): Promise<Collateral_transferGroupBy[]> {
    const { _count, _avg, _sum, _min, _max } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).collateral_transfer.groupBy({
      ...args,
      ...Object.fromEntries(
        Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)
      ),
    });
  }
}
