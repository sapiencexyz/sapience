import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MigrationsUpdateManyMutationInput } from "../../../inputs/MigrationsUpdateManyMutationInput";
import { MigrationsWhereInput } from "../../../inputs/MigrationsWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyMigrationsArgs {
  @TypeGraphQL.Field(_type => MigrationsUpdateManyMutationInput, {
    nullable: false
  })
  data!: MigrationsUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => MigrationsWhereInput, {
    nullable: true
  })
  where?: MigrationsWhereInput | undefined;
}
