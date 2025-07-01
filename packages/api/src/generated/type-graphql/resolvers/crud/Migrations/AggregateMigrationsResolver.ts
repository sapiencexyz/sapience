import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateMigrationsArgs } from "./args/AggregateMigrationsArgs";
import { Migrations } from "../../../models/Migrations";
import { AggregateMigrations } from "../../outputs/AggregateMigrations";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Migrations)
export class AggregateMigrationsResolver {
  @TypeGraphQL.Query(_returns => AggregateMigrations, {
    nullable: false
  })
  async aggregateMigrations(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateMigrationsArgs): Promise<AggregateMigrations> {
    return getPrismaFromContext(ctx).migrations.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }
}
