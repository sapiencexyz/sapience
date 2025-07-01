import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventCreateManyMarket_groupInputEnvelope } from "../inputs/EventCreateManyMarket_groupInputEnvelope";
import { EventCreateOrConnectWithoutMarket_groupInput } from "../inputs/EventCreateOrConnectWithoutMarket_groupInput";
import { EventCreateWithoutMarket_groupInput } from "../inputs/EventCreateWithoutMarket_groupInput";
import { EventWhereUniqueInput } from "../inputs/EventWhereUniqueInput";

@TypeGraphQL.InputType("EventCreateNestedManyWithoutMarket_groupInput", {})
export class EventCreateNestedManyWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => [EventCreateWithoutMarket_groupInput], {
    nullable: true
  })
  create?: EventCreateWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventCreateOrConnectWithoutMarket_groupInput], {
    nullable: true
  })
  connectOrCreate?: EventCreateOrConnectWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => EventCreateManyMarket_groupInputEnvelope, {
    nullable: true
  })
  createMany?: EventCreateManyMarket_groupInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [EventWhereUniqueInput], {
    nullable: true
  })
  connect?: EventWhereUniqueInput[] | undefined;
}
