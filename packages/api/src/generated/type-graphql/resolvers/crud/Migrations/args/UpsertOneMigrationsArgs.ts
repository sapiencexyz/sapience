import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MigrationsCreateInput } from "../../../inputs/MigrationsCreateInput";
import { MigrationsUpdateInput } from "../../../inputs/MigrationsUpdateInput";
import { MigrationsWhereUniqueInput } from "../../../inputs/MigrationsWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneMigrationsArgs {
  @TypeGraphQL.Field(_type => MigrationsWhereUniqueInput, {
    nullable: false
  })
  where!: MigrationsWhereUniqueInput;

  @TypeGraphQL.Field(_type => MigrationsCreateInput, {
    nullable: false
  })
  create!: MigrationsCreateInput;

  @TypeGraphQL.Field(_type => MigrationsUpdateInput, {
    nullable: false
  })
  update!: MigrationsUpdateInput;
}
