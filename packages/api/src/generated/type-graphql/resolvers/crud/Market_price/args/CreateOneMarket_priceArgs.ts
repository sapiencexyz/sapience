import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_priceCreateInput } from "../../../inputs/Market_priceCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneMarket_priceArgs {
  @TypeGraphQL.Field(_type => Market_priceCreateInput, {
    nullable: false
  })
  data!: Market_priceCreateInput;
}
