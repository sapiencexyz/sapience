import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { GroupByResource_priceArgs } from "./args/GroupByResource_priceArgs";
import { Resource_price } from "../../../models/Resource_price";
import { Resource_priceGroupBy } from "../../outputs/Resource_priceGroupBy";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Resource_price)
export class GroupByResource_priceResolver {
  @TypeGraphQL.Query(_returns => [Resource_priceGroupBy], {
    nullable: false
  })
  async groupByResource_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: GroupByResource_priceArgs): Promise<Resource_priceGroupBy[]> {
    const { _count, _avg, _sum, _min, _max } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).resource_price.groupBy({
      ...args,
      ...Object.fromEntries(
        Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)
      ),
    });
  }
}
