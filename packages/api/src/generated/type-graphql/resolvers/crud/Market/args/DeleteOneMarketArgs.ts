import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MarketWhereUniqueInput } from "../../../inputs/MarketWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class DeleteOneMarketArgs {
  @TypeGraphQL.Field(_type => MarketWhereUniqueInput, {
    nullable: false
  })
  where!: MarketWhereUniqueInput;
}
