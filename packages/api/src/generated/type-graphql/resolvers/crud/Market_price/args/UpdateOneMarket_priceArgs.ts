import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_priceUpdateInput } from "../../../inputs/Market_priceUpdateInput";
import { Market_priceWhereUniqueInput } from "../../../inputs/Market_priceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneMarket_priceArgs {
  @TypeGraphQL.Field(_type => Market_priceUpdateInput, {
    nullable: false
  })
  data!: Market_priceUpdateInput;

  @TypeGraphQL.Field(_type => Market_priceWhereUniqueInput, {
    nullable: false
  })
  where!: Market_priceWhereUniqueInput;
}
