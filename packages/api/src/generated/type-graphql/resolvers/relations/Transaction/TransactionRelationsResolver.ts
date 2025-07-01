import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { Collateral_transfer } from "../../../models/Collateral_transfer";
import { Event } from "../../../models/Event";
import { Market_price } from "../../../models/Market_price";
import { Position } from "../../../models/Position";
import { Transaction } from "../../../models/Transaction";
import { TransactionCollateral_transferArgs } from "./args/TransactionCollateral_transferArgs";
import { TransactionEventArgs } from "./args/TransactionEventArgs";
import { TransactionMarket_priceArgs } from "./args/TransactionMarket_priceArgs";
import { TransactionPositionArgs } from "./args/TransactionPositionArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Transaction)
export class TransactionRelationsResolver {
  @TypeGraphQL.FieldResolver(_type => Collateral_transfer, {
    nullable: true
  })
  async collateral_transfer(@TypeGraphQL.Root() transaction: Transaction, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: TransactionCollateral_transferArgs): Promise<Collateral_transfer | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).transaction.findUniqueOrThrow({
      where: {
        id: transaction.id,
      },
    }).collateral_transfer({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => Market_price, {
    nullable: true
  })
  async market_price(@TypeGraphQL.Root() transaction: Transaction, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: TransactionMarket_priceArgs): Promise<Market_price | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).transaction.findUniqueOrThrow({
      where: {
        id: transaction.id,
      },
    }).market_price({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => Event, {
    nullable: true
  })
  async event(@TypeGraphQL.Root() transaction: Transaction, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: TransactionEventArgs): Promise<Event | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).transaction.findUniqueOrThrow({
      where: {
        id: transaction.id,
      },
    }).event({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => Position, {
    nullable: true
  })
  async position(@TypeGraphQL.Root() transaction: Transaction, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: TransactionPositionArgs): Promise<Position | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).transaction.findUniqueOrThrow({
      where: {
        id: transaction.id,
      },
    }).position({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
