import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_priceWhereUniqueInput } from "../../../inputs/Market_priceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class FindUniqueMarket_priceOrThrowArgs {
  @TypeGraphQL.Field(_type => Market_priceWhereUniqueInput, {
    nullable: false
  })
  where!: Market_priceWhereUniqueInput;
}
