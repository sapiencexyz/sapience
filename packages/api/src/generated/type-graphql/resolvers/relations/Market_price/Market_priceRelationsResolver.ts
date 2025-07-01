import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { Market_price } from "../../../models/Market_price";
import { Transaction } from "../../../models/Transaction";
import { Market_priceTransactionArgs } from "./args/Market_priceTransactionArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_price)
export class Market_priceRelationsResolver {
  @TypeGraphQL.FieldResolver(_type => Transaction, {
    nullable: true
  })
  async transaction(@TypeGraphQL.Root() market_price: Market_price, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: Market_priceTransactionArgs): Promise<Transaction | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.findUniqueOrThrow({
      where: {
        id: market_price.id,
      },
    }).transaction({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
