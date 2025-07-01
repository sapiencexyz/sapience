import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnMarketArgs } from "./args/CreateManyAndReturnMarketArgs";
import { Market } from "../../../models/Market";
import { CreateManyAndReturnMarket } from "../../outputs/CreateManyAndReturnMarket";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market)
export class CreateManyAndReturnMarketResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnMarket], {
    nullable: false
  })
  async createManyAndReturnMarket(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnMarketArgs): Promise<CreateManyAndReturnMarket[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
