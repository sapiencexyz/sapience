import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_candleUpdateInput } from "../../../inputs/Cache_candleUpdateInput";
import { Cache_candleWhereUniqueInput } from "../../../inputs/Cache_candleWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneCache_candleArgs {
  @TypeGraphQL.Field(_type => Cache_candleUpdateInput, {
    nullable: false
  })
  data!: Cache_candleUpdateInput;

  @TypeGraphQL.Field(_type => Cache_candleWhereUniqueInput, {
    nullable: false
  })
  where!: Cache_candleWhereUniqueInput;
}
