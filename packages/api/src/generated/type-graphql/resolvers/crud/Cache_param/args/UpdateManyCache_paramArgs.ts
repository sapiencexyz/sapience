import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_paramUpdateManyMutationInput } from "../../../inputs/Cache_paramUpdateManyMutationInput";
import { Cache_paramWhereInput } from "../../../inputs/Cache_paramWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyCache_paramArgs {
  @TypeGraphQL.Field(_type => Cache_paramUpdateManyMutationInput, {
    nullable: false
  })
  data!: Cache_paramUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => Cache_paramWhereInput, {
    nullable: true
  })
  where?: Cache_paramWhereInput | undefined;
}
