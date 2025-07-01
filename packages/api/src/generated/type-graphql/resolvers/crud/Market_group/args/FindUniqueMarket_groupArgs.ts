import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_groupWhereUniqueInput } from "../../../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class FindUniqueMarket_groupArgs {
  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: false
  })
  where!: Market_groupWhereUniqueInput;
}
