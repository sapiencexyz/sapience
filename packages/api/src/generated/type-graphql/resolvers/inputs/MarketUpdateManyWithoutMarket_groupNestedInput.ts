import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketCreateManyMarket_groupInputEnvelope } from "../inputs/MarketCreateManyMarket_groupInputEnvelope";
import { MarketCreateOrConnectWithoutMarket_groupInput } from "../inputs/MarketCreateOrConnectWithoutMarket_groupInput";
import { MarketCreateWithoutMarket_groupInput } from "../inputs/MarketCreateWithoutMarket_groupInput";
import { MarketScalarWhereInput } from "../inputs/MarketScalarWhereInput";
import { MarketUpdateManyWithWhereWithoutMarket_groupInput } from "../inputs/MarketUpdateManyWithWhereWithoutMarket_groupInput";
import { MarketUpdateWithWhereUniqueWithoutMarket_groupInput } from "../inputs/MarketUpdateWithWhereUniqueWithoutMarket_groupInput";
import { MarketUpsertWithWhereUniqueWithoutMarket_groupInput } from "../inputs/MarketUpsertWithWhereUniqueWithoutMarket_groupInput";
import { MarketWhereUniqueInput } from "../inputs/MarketWhereUniqueInput";

@TypeGraphQL.InputType("MarketUpdateManyWithoutMarket_groupNestedInput", {})
export class MarketUpdateManyWithoutMarket_groupNestedInput {
  @TypeGraphQL.Field(_type => [MarketCreateWithoutMarket_groupInput], {
    nullable: true
  })
  create?: MarketCreateWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketCreateOrConnectWithoutMarket_groupInput], {
    nullable: true
  })
  connectOrCreate?: MarketCreateOrConnectWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketUpsertWithWhereUniqueWithoutMarket_groupInput], {
    nullable: true
  })
  upsert?: MarketUpsertWithWhereUniqueWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => MarketCreateManyMarket_groupInputEnvelope, {
    nullable: true
  })
  createMany?: MarketCreateManyMarket_groupInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [MarketWhereUniqueInput], {
    nullable: true
  })
  set?: MarketWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketWhereUniqueInput], {
    nullable: true
  })
  disconnect?: MarketWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketWhereUniqueInput], {
    nullable: true
  })
  delete?: MarketWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketWhereUniqueInput], {
    nullable: true
  })
  connect?: MarketWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketUpdateWithWhereUniqueWithoutMarket_groupInput], {
    nullable: true
  })
  update?: MarketUpdateWithWhereUniqueWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketUpdateManyWithWhereWithoutMarket_groupInput], {
    nullable: true
  })
  updateMany?: MarketUpdateManyWithWhereWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketScalarWhereInput], {
    nullable: true
  })
  deleteMany?: MarketScalarWhereInput[] | undefined;
}
