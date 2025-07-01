import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnMarket_groupArgs } from "./args/CreateManyAndReturnMarket_groupArgs";
import { Market_group } from "../../../models/Market_group";
import { CreateManyAndReturnMarket_group } from "../../outputs/CreateManyAndReturnMarket_group";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Market_group)
export class CreateManyAndReturnMarket_groupResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnMarket_group], {
    nullable: false
  })
  async createManyAndReturnMarket_group(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnMarket_groupArgs): Promise<CreateManyAndReturnMarket_group[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).market_group.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
