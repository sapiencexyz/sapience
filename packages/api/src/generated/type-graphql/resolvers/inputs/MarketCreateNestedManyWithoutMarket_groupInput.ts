import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketCreateManyMarket_groupInputEnvelope } from "../inputs/MarketCreateManyMarket_groupInputEnvelope";
import { MarketCreateOrConnectWithoutMarket_groupInput } from "../inputs/MarketCreateOrConnectWithoutMarket_groupInput";
import { MarketCreateWithoutMarket_groupInput } from "../inputs/MarketCreateWithoutMarket_groupInput";
import { MarketWhereUniqueInput } from "../inputs/MarketWhereUniqueInput";

@TypeGraphQL.InputType("MarketCreateNestedManyWithoutMarket_groupInput", {})
export class MarketCreateNestedManyWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => [MarketCreateWithoutMarket_groupInput], {
    nullable: true
  })
  create?: MarketCreateWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketCreateOrConnectWithoutMarket_groupInput], {
    nullable: true
  })
  connectOrCreate?: MarketCreateOrConnectWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => MarketCreateManyMarket_groupInputEnvelope, {
    nullable: true
  })
  createMany?: MarketCreateManyMarket_groupInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [MarketWhereUniqueInput], {
    nullable: true
  })
  connect?: MarketWhereUniqueInput[] | undefined;
}
