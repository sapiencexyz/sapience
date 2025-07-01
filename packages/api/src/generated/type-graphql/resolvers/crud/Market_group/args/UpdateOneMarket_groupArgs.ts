import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_groupUpdateInput } from "../../../inputs/Market_groupUpdateInput";
import { Market_groupWhereUniqueInput } from "../../../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneMarket_groupArgs {
  @TypeGraphQL.Field(_type => Market_groupUpdateInput, {
    nullable: false
  })
  data!: Market_groupUpdateInput;

  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: false
  })
  where!: Market_groupWhereUniqueInput;
}
