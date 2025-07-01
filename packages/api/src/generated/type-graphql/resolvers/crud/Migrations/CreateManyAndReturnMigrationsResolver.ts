import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnMigrationsArgs } from "./args/CreateManyAndReturnMigrationsArgs";
import { Migrations } from "../../../models/Migrations";
import { CreateManyAndReturnMigrations } from "../../outputs/CreateManyAndReturnMigrations";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Migrations)
export class CreateManyAndReturnMigrationsResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnMigrations], {
    nullable: false
  })
  async createManyAndReturnMigrations(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnMigrationsArgs): Promise<CreateManyAndReturnMigrations[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).migrations.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
