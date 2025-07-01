import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MigrationsWhereUniqueInput } from "../../../inputs/MigrationsWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class FindUniqueMigrationsOrThrowArgs {
  @TypeGraphQL.Field(_type => MigrationsWhereUniqueInput, {
    nullable: false
  })
  where!: MigrationsWhereUniqueInput;
}
