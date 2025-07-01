import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketCreateWithoutMarket_groupInput } from "../inputs/MarketCreateWithoutMarket_groupInput";
import { MarketWhereUniqueInput } from "../inputs/MarketWhereUniqueInput";

@TypeGraphQL.InputType("MarketCreateOrConnectWithoutMarket_groupInput", {})
export class MarketCreateOrConnectWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => MarketWhereUniqueInput, {
    nullable: false
  })
  where!: MarketWhereUniqueInput;

  @TypeGraphQL.Field(_type => MarketCreateWithoutMarket_groupInput, {
    nullable: false
  })
  create!: MarketCreateWithoutMarket_groupInput;
}
