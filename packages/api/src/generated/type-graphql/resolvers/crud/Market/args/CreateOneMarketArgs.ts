import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MarketCreateInput } from "../../../inputs/MarketCreateInput";

@TypeGraphQL.ArgsType()
export class CreateOneMarketArgs {
  @TypeGraphQL.Field(_type => MarketCreateInput, {
    nullable: false
  })
  data!: MarketCreateInput;
}
