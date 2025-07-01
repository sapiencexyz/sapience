import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { DeleteOneRender_jobArgs } from "./args/DeleteOneRender_jobArgs";
import { Render_job } from "../../../models/Render_job";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Render_job)
export class DeleteOneRender_jobResolver {
  @TypeGraphQL.Mutation(_returns => Render_job, {
    nullable: true
  })
  async deleteOneRender_job(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: DeleteOneRender_jobArgs): Promise<Render_job | null> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).render_job.delete({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
