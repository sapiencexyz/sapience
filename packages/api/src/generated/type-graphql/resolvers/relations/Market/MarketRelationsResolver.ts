import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { Market } from "../../../models/Market";
import { Market_group } from "../../../models/Market_group";
import { Position } from "../../../models/Position";
import { MarketMarket_groupArgs } from "./args/MarketMarket_groupArgs";
import { MarketPositionArgs } from "./args/MarketPositionArgs";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market)
export class MarketRelationsResolver {
  @TypeGraphQL.FieldResolver(_type => Market_group, {
    nullable: true
  })
  async market_group(@TypeGraphQL.Root() market: Market, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: MarketMarket_groupArgs): Promise<Market_group | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market.findUniqueOrThrow({
      where: {
        id: market.id,
      },
    }).market_group({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }

  @TypeGraphQL.FieldResolver(_type => [Position], {
    nullable: false
  })
  async position(@TypeGraphQL.Root() market: Market, @TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: MarketPositionArgs): Promise<Position[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market.findUniqueOrThrow({
      where: {
        id: market.id,
      },
    }).position({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
