import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketCreateWithoutPositionInput } from "../inputs/MarketCreateWithoutPositionInput";
import { MarketWhereUniqueInput } from "../inputs/MarketWhereUniqueInput";

@TypeGraphQL.InputType("MarketCreateOrConnectWithoutPositionInput", {})
export class MarketCreateOrConnectWithoutPositionInput {
  @TypeGraphQL.Field(_type => MarketWhereUniqueInput, {
    nullable: false
  })
  where!: MarketWhereUniqueInput;

  @TypeGraphQL.Field(_type => MarketCreateWithoutPositionInput, {
    nullable: false
  })
  create!: MarketCreateWithoutPositionInput;
}
