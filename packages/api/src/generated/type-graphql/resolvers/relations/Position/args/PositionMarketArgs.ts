import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MarketWhereInput } from "../../../inputs/MarketWhereInput";

@TypeGraphQL.ArgsType()
export class PositionMarketArgs {
  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  where?: MarketWhereInput | undefined;
}
