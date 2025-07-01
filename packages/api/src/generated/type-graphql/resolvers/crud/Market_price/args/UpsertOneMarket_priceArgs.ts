import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_priceCreateInput } from "../../../inputs/Market_priceCreateInput";
import { Market_priceUpdateInput } from "../../../inputs/Market_priceUpdateInput";
import { Market_priceWhereUniqueInput } from "../../../inputs/Market_priceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneMarket_priceArgs {
  @TypeGraphQL.Field(_type => Market_priceWhereUniqueInput, {
    nullable: false
  })
  where!: Market_priceWhereUniqueInput;

  @TypeGraphQL.Field(_type => Market_priceCreateInput, {
    nullable: false
  })
  create!: Market_priceCreateInput;

  @TypeGraphQL.Field(_type => Market_priceUpdateInput, {
    nullable: false
  })
  update!: Market_priceUpdateInput;
}
