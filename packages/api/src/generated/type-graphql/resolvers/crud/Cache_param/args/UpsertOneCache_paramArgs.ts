import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_paramCreateInput } from "../../../inputs/Cache_paramCreateInput";
import { Cache_paramUpdateInput } from "../../../inputs/Cache_paramUpdateInput";
import { Cache_paramWhereUniqueInput } from "../../../inputs/Cache_paramWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneCache_paramArgs {
  @TypeGraphQL.Field(_type => Cache_paramWhereUniqueInput, {
    nullable: false
  })
  where!: Cache_paramWhereUniqueInput;

  @TypeGraphQL.Field(_type => Cache_paramCreateInput, {
    nullable: false
  })
  create!: Cache_paramCreateInput;

  @TypeGraphQL.Field(_type => Cache_paramUpdateInput, {
    nullable: false
  })
  update!: Cache_paramUpdateInput;
}
