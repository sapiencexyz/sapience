import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindManyCollateral_transferArgs } from "./args/FindManyCollateral_transferArgs";
import { Collateral_transfer } from "../../../models/Collateral_transfer";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Collateral_transfer)
export class FindManyCollateral_transferResolver {
  @TypeGraphQL.Query(_returns => [Collateral_transfer], {
    nullable: false
  })
  async collateral_transfers(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindManyCollateral_transferArgs): Promise<Collateral_transfer[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).collateral_transfer.findMany({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
