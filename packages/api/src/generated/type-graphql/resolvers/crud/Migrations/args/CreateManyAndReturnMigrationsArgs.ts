import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MigrationsCreateManyInput } from "../../../inputs/MigrationsCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyAndReturnMigrationsArgs {
  @TypeGraphQL.Field(_type => [MigrationsCreateManyInput], {
    nullable: false
  })
  data!: MigrationsCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
