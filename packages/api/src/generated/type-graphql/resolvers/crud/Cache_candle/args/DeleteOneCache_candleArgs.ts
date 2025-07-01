import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_candleWhereUniqueInput } from "../../../inputs/Cache_candleWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class DeleteOneCache_candleArgs {
  @TypeGraphQL.Field(_type => Cache_candleWhereUniqueInput, {
    nullable: false
  })
  where!: Cache_candleWhereUniqueInput;
}
