import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketCreateOrConnectWithoutPositionInput } from "../inputs/MarketCreateOrConnectWithoutPositionInput";
import { MarketCreateWithoutPositionInput } from "../inputs/MarketCreateWithoutPositionInput";
import { MarketUpdateToOneWithWhereWithoutPositionInput } from "../inputs/MarketUpdateToOneWithWhereWithoutPositionInput";
import { MarketUpsertWithoutPositionInput } from "../inputs/MarketUpsertWithoutPositionInput";
import { MarketWhereInput } from "../inputs/MarketWhereInput";
import { MarketWhereUniqueInput } from "../inputs/MarketWhereUniqueInput";

@TypeGraphQL.InputType("MarketUpdateOneWithoutPositionNestedInput", {})
export class MarketUpdateOneWithoutPositionNestedInput {
  @TypeGraphQL.Field(_type => MarketCreateWithoutPositionInput, {
    nullable: true
  })
  create?: MarketCreateWithoutPositionInput | undefined;

  @TypeGraphQL.Field(_type => MarketCreateOrConnectWithoutPositionInput, {
    nullable: true
  })
  connectOrCreate?: MarketCreateOrConnectWithoutPositionInput | undefined;

  @TypeGraphQL.Field(_type => MarketUpsertWithoutPositionInput, {
    nullable: true
  })
  upsert?: MarketUpsertWithoutPositionInput | undefined;

  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  disconnect?: MarketWhereInput | undefined;

  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  delete?: MarketWhereInput | undefined;

  @TypeGraphQL.Field(_type => MarketWhereUniqueInput, {
    nullable: true
  })
  connect?: MarketWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => MarketUpdateToOneWithWhereWithoutPositionInput, {
    nullable: true
  })
  update?: MarketUpdateToOneWithWhereWithoutPositionInput | undefined;
}
