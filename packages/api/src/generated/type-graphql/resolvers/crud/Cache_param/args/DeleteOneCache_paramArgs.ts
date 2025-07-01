import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_paramWhereUniqueInput } from "../../../inputs/Cache_paramWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class DeleteOneCache_paramArgs {
  @TypeGraphQL.Field(_type => Cache_paramWhereUniqueInput, {
    nullable: false
  })
  where!: Cache_paramWhereUniqueInput;
}
