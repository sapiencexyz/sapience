import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnMarket_priceArgs } from "./args/CreateManyAndReturnMarket_priceArgs";
import { Market_price } from "../../../models/Market_price";
import { CreateManyAndReturnMarket_price } from "../../outputs/CreateManyAndReturnMarket_price";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_price)
export class CreateManyAndReturnMarket_priceResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnMarket_price], {
    nullable: false
  })
  async createManyAndReturnMarket_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnMarket_priceArgs): Promise<CreateManyAndReturnMarket_price[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_price.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
