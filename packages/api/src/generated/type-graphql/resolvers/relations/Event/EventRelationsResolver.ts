import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { Event } from "../../../models/Event";
import { Market_group } from "../../../models/Market_group";
import { Transaction } from "../../../models/Transaction";
import { EventMarket_groupArgs } from "./args/EventMarket_groupArgs";
import { EventTransactionArgs } from "./args/EventTransactionArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Event)
export class EventRelationsResolver {
  @TypeGraphQL.FieldResolver(_type => Market_group, {
    nullable: true
  })
  async market_group(@TypeGraphQL.Root() event: Event, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: EventMarket_groupArgs): Promise<Market_group | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).event.findUniqueOrThrow({
      where: {
        id: event.id,
      },
    }).market_group({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => Transaction, {
    nullable: true
  })
  async transaction(@TypeGraphQL.Root() event: Event, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: EventTransactionArgs): Promise<Transaction | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).event.findUniqueOrThrow({
      where: {
        id: event.id,
      },
    }).transaction({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
