import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { GroupByRender_jobArgs } from "./args/GroupByRender_jobArgs";
import { Render_job } from "../../../models/Render_job";
import { Render_jobGroupBy } from "../../outputs/Render_jobGroupBy";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Render_job)
export class GroupByRender_jobResolver {
  @TypeGraphQL.Query(_returns => [Render_jobGroupBy], {
    nullable: false
  })
  async groupByRender_job(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: GroupByRender_jobArgs): Promise<Render_jobGroupBy[]> {
    const { _count, _avg, _sum, _min, _max } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).render_job.groupBy({
      ...args,
      ...Object.fromEntries(
        Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)
      ),
    });
  }
}
