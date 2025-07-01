import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnRender_jobArgs } from "./args/CreateManyAndReturnRender_jobArgs";
import { Render_job } from "../../../models/Render_job";
import { CreateManyAndReturnRender_job } from "../../outputs/CreateManyAndReturnRender_job";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Render_job)
export class CreateManyAndReturnRender_jobResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnRender_job], {
    nullable: false
  })
  async createManyAndReturnRender_job(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnRender_jobArgs): Promise<CreateManyAndReturnRender_job[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).render_job.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
