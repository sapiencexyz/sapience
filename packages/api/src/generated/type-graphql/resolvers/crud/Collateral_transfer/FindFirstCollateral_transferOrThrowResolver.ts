import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { FindFirstCollateral_transferOrThrowArgs } from "./args/FindFirstCollateral_transferOrThrowArgs";
import { Collateral_transfer } from "../../../models/Collateral_transfer";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Collateral_transfer)
export class FindFirstCollateral_transferOrThrowResolver {
  @TypeGraphQL.Query(_returns => Collateral_transfer, {
    nullable: true
  })
  async findFirstCollateral_transferOrThrow(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: FindFirstCollateral_transferOrThrowArgs): Promise<Collateral_transfer | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).collateral_transfer.findFirstOrThrow({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
