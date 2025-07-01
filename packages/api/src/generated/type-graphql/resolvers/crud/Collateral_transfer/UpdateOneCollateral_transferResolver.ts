import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { UpdateOneCollateral_transferArgs } from "./args/UpdateOneCollateral_transferArgs";
import { Collateral_transfer } from "../../../models/Collateral_transfer";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Collateral_transfer)
export class UpdateOneCollateral_transferResolver {
  @TypeGraphQL.Mutation(_returns => Collateral_transfer, {
    nullable: true
  })
  async updateOneCollateral_transfer(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: UpdateOneCollateral_transferArgs): Promise<Collateral_transfer | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).collateral_transfer.update({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
