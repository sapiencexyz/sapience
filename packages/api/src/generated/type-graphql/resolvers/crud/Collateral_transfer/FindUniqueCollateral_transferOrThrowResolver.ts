import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueCollateral_transferOrThrowArgs } from "./args/FindUniqueCollateral_transferOrThrowArgs";
import { Collateral_transfer } from "../../../models/Collateral_transfer";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Collateral_transfer)
export class FindUniqueCollateral_transferOrThrowResolver {
  @TypeGraphQL.Query(_returns => Collateral_transfer, {
    nullable: true
  })
  async getCollateral_transfer(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindUniqueCollateral_transferOrThrowArgs): Promise<Collateral_transfer | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).collateral_transfer.findUniqueOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
