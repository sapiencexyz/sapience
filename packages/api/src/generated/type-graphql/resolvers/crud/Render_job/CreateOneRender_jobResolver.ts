import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateOneRender_jobArgs } from "./args/CreateOneRender_jobArgs";
import { Render_job } from "../../../models/Render_job";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Render_job)
export class CreateOneRender_jobResolver {
  @TypeGraphQL.Mutation(_returns => Render_job, {
    nullable: false
  })
  async createOneRender_job(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateOneRender_jobArgs): Promise<Render_job> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).render_job.create({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
