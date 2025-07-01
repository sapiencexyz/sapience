import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MigrationsUpdateInput } from "../../../inputs/MigrationsUpdateInput";
import { MigrationsWhereUniqueInput } from "../../../inputs/MigrationsWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneMigrationsArgs {
  @TypeGraphQL.Field(_type => MigrationsUpdateInput, {
    nullable: false
  })
  data!: MigrationsUpdateInput;

  @TypeGraphQL.Field(_type => MigrationsWhereUniqueInput, {
    nullable: false
  })
  where!: MigrationsWhereUniqueInput;
}
