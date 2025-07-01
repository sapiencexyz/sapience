import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketCreateOrConnectWithoutPositionInput } from "../inputs/MarketCreateOrConnectWithoutPositionInput";
import { MarketCreateWithoutPositionInput } from "../inputs/MarketCreateWithoutPositionInput";
import { MarketWhereUniqueInput } from "../inputs/MarketWhereUniqueInput";

@TypeGraphQL.InputType("MarketCreateNestedOneWithoutPositionInput", {})
export class MarketCreateNestedOneWithoutPositionInput {
  @TypeGraphQL.Field(_type => MarketCreateWithoutPositionInput, {
    nullable: true
  })
  create?: MarketCreateWithoutPositionInput | undefined;

  @TypeGraphQL.Field(_type => MarketCreateOrConnectWithoutPositionInput, {
    nullable: true
  })
  connectOrCreate?: MarketCreateOrConnectWithoutPositionInput | undefined;

  @TypeGraphQL.Field(_type => MarketWhereUniqueInput, {
    nullable: true
  })
  connect?: MarketWhereUniqueInput | undefined;
}
