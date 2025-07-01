import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_groupCreateInput } from "../../../inputs/Market_groupCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneMarket_groupArgs {
  @TypeGraphQL.Field(_type => Market_groupCreateInput, {
    nullable: false
  })
  data!: Market_groupCreateInput;
}
