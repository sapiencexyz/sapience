import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateCollateral_transferArgs } from "./args/AggregateCollateral_transferArgs";
import { Collateral_transfer } from "../../../models/Collateral_transfer";
import { AggregateCollateral_transfer } from "../../outputs/AggregateCollateral_transfer";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Collateral_transfer)
export class AggregateCollateral_transferResolver {
  @TypeGraphQL.Query(_returns => AggregateCollateral_transfer, {
    nullable: false
  })
  async aggregateCollateral_transfer(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateCollateral_transferArgs): Promise<AggregateCollateral_transfer> {
    return getPrismaFromContext(ctx).collateral_transfer.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }
}
