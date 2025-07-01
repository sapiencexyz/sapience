import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MigrationsCreateInput } from "../../../inputs/MigrationsCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneMigrationsArgs {
  @TypeGraphQL.Field(_type => MigrationsCreateInput, {
    nullable: false
  })
  data!: MigrationsCreateInput;
}
