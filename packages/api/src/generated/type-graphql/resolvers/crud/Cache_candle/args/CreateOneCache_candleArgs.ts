import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_candleCreateInput } from "../../../inputs/Cache_candleCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneCache_candleArgs {
  @TypeGraphQL.Field(_type => Cache_candleCreateInput, {
    nullable: false
  })
  data!: Cache_candleCreateInput;
}
