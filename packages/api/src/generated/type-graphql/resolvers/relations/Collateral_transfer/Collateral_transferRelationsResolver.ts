import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { Collateral_transfer } from "../../../models/Collateral_transfer";
import { Transaction } from "../../../models/Transaction";
import { Collateral_transferTransactionArgs } from "./args/Collateral_transferTransactionArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Collateral_transfer)
export class Collateral_transferRelationsResolver {
  @TypeGraphQL.FieldResolver(_type => Transaction, {
    nullable: true
  })
  async transaction(@TypeGraphQL.Root() collateral_transfer: Collateral_transfer, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: Collateral_transferTransactionArgs): Promise<Transaction | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).collateral_transfer.findUniqueOrThrow({
      where: {
        id: collateral_transfer.id,
      },
    }).transaction({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
