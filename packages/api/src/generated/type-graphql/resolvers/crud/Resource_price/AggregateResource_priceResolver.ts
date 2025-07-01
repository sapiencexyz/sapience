import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateResource_priceArgs } from "./args/AggregateResource_priceArgs";
import { Resource_price } from "../../../models/Resource_price";
import { AggregateResource_price } from "../../outputs/AggregateResource_price";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Resource_price)
export class AggregateResource_priceResolver {
  @TypeGraphQL.Query(_returns => AggregateResource_price, {
    nullable: false
  })
  async aggregateResource_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateResource_priceArgs): Promise<AggregateResource_price> {
    return getPrismaFromContext(ctx).resource_price.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }
}
