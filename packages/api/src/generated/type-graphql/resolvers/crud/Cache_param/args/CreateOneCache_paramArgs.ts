import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_paramCreateInput } from "../../../inputs/Cache_paramCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneCache_paramArgs {
  @TypeGraphQL.Field(_type => Cache_paramCreateInput, {
    nullable: false
  })
  data!: Cache_paramCreateInput;
}
