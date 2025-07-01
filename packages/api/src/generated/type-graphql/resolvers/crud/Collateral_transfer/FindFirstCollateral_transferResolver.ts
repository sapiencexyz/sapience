import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindFirstCollateral_transferArgs } from "./args/FindFirstCollateral_transferArgs";
import { Collateral_transfer } from "../../../models/Collateral_transfer";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Collateral_transfer)
export class FindFirstCollateral_transferResolver {
  @TypeGraphQL.Query(_returns => Collateral_transfer, {
    nullable: true
  })
  async findFirstCollateral_transfer(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstCollateral_transferArgs): Promise<Collateral_transfer | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).collateral_transfer.findFirst({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
