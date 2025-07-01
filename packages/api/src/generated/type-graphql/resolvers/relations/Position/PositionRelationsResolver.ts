import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { Market } from "../../../models/Market";
import { Position } from "../../../models/Position";
import { Transaction } from "../../../models/Transaction";
import { PositionMarketArgs } from "./args/PositionMarketArgs";
import { PositionTransactionArgs } from "./args/PositionTransactionArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Position)
export class PositionRelationsResolver {
  @TypeGraphQL.FieldResolver(_type => Market, {
    nullable: true
  })
  async market(@TypeGraphQL.Root() position: Position, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: PositionMarketArgs): Promise<Market | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).position.findUniqueOrThrow({
      where: {
        id: position.id,
      },
    }).market({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => [Transaction], {
    nullable: false
  })
  async transaction(@TypeGraphQL.Root() position: Position, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: PositionTransactionArgs): Promise<Transaction[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).position.findUniqueOrThrow({
      where: {
        id: position.id,
      },
    }).transaction({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
