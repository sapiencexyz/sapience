import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnCollateral_transferArgs } from "./args/CreateManyAndReturnCollateral_transferArgs";
import { Collateral_transfer } from "../../../models/Collateral_transfer";
import { CreateManyAndReturnCollateral_transfer } from "../../outputs/CreateManyAndReturnCollateral_transfer";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Collateral_transfer)
export class CreateManyAndReturnCollateral_transferResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnCollateral_transfer], {
    nullable: false
  })
  async createManyAndReturnCollateral_transfer(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnCollateral_transferArgs): Promise<CreateManyAndReturnCollateral_transfer[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).collateral_transfer.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
