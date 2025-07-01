import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnPositionArgs } from "./args/CreateManyAndReturnPositionArgs";
import { Position } from "../../../models/Position";
import { CreateManyAndReturnPosition } from "../../outputs/CreateManyAndReturnPosition";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Position)
export class CreateManyAndReturnPositionResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnPosition], {
    nullable: false
  })
  async createManyAndReturnPosition(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnPositionArgs): Promise<CreateManyAndReturnPosition[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).position.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
