import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MarketCreateInput } from "../../../inputs/MarketCreateInput";
import { MarketUpdateInput } from "../../../inputs/MarketUpdateInput";
import { MarketWhereUniqueInput } from "../../../inputs/MarketWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneMarketArgs {
  @TypeGraphQL.Field(_type => MarketWhereUniqueInput, {
    nullable: false
  })
  where!: MarketWhereUniqueInput;

  @TypeGraphQL.Field(_type => MarketCreateInput, {
    nullable: false
  })
  create!: MarketCreateInput;

  @TypeGraphQL.Field(_type => MarketUpdateInput, {
    nullable: false
  })
  update!: MarketUpdateInput;
}
