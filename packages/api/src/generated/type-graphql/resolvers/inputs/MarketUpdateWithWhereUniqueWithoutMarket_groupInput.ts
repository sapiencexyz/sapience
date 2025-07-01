import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketUpdateWithoutMarket_groupInput } from "../inputs/MarketUpdateWithoutMarket_groupInput";
import { MarketWhereUniqueInput } from "../inputs/MarketWhereUniqueInput";

@TypeGraphQL.InputType("MarketUpdateWithWhereUniqueWithoutMarket_groupInput", {})
export class MarketUpdateWithWhereUniqueWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => MarketWhereUniqueInput, {
    nullable: false
  })
  where!: MarketWhereUniqueInput;

  @TypeGraphQL.Field(_type => MarketUpdateWithoutMarket_groupInput, {
    nullable: false
  })
  data!: MarketUpdateWithoutMarket_groupInput;
}
