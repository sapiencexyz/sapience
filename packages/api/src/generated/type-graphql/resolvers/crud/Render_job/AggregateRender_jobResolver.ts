import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateRender_jobArgs } from "./args/AggregateRender_jobArgs";
import { Render_job } from "../../../models/Render_job";
import { AggregateRender_job } from "../../outputs/AggregateRender_job";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Render_job)
export class AggregateRender_jobResolver {
  @TypeGraphQL.Query(_returns => AggregateRender_job, {
    nullable: false
  })
  async aggregateRender_job(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateRender_jobArgs): Promise<AggregateRender_job> {
    return getPrismaFromContext(ctx).render_job.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }
}
