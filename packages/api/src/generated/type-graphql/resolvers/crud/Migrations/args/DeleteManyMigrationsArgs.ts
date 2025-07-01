import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MigrationsWhereInput } from "../../../inputs/MigrationsWhereInput";

@TypeGraphQL.ArgsType()
export class DeleteManyMigrationsArgs {
  @TypeGraphQL.Field(_type => MigrationsWhereInput, {
    nullable: true
  })
  where?: MigrationsWhereInput | undefined;
}
