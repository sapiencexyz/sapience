import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_paramUpdateInput } from "../../../inputs/Cache_paramUpdateInput";
import { Cache_paramWhereUniqueInput } from "../../../inputs/Cache_paramWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneCache_paramArgs {
  @TypeGraphQL.Field(_type => Cache_paramUpdateInput, {
    nullable: false
  })
  data!: Cache_paramUpdateInput;

  @TypeGraphQL.Field(_type => Cache_paramWhereUniqueInput, {
    nullable: false
  })
  where!: Cache_paramWhereUniqueInput;
}
