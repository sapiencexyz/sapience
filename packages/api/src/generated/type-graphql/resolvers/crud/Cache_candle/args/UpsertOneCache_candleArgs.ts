import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_candleCreateInput } from "../../../inputs/Cache_candleCreateInput";
import { Cache_candleUpdateInput } from "../../../inputs/Cache_candleUpdateInput";
import { Cache_candleWhereUniqueInput } from "../../../inputs/Cache_candleWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneCache_candleArgs {
  @TypeGraphQL.Field(_type => Cache_candleWhereUniqueInput, {
    nullable: false
  })
  where!: Cache_candleWhereUniqueInput;

  @TypeGraphQL.Field(_type => Cache_candleCreateInput, {
    nullable: false
  })
  create!: Cache_candleCreateInput;

  @TypeGraphQL.Field(_type => Cache_candleUpdateInput, {
    nullable: false
  })
  update!: Cache_candleUpdateInput;
}
