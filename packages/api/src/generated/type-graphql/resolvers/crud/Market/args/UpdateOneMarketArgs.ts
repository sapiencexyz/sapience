import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MarketUpdateInput } from "../../../inputs/MarketUpdateInput";
import { MarketWhereUniqueInput } from "../../../inputs/MarketWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneMarketArgs {
  @TypeGraphQL.Field(_type => MarketUpdateInput, {
    nullable: false
  })
  data!: MarketUpdateInput;

  @TypeGraphQL.Field(_type => MarketWhereUniqueInput, {
    nullable: false
  })
  where!: MarketWhereUniqueInput;
}
