import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventCreateManyMarket_groupInputEnvelope } from "../inputs/EventCreateManyMarket_groupInputEnvelope";
import { EventCreateOrConnectWithoutMarket_groupInput } from "../inputs/EventCreateOrConnectWithoutMarket_groupInput";
import { EventCreateWithoutMarket_groupInput } from "../inputs/EventCreateWithoutMarket_groupInput";
import { EventScalarWhereInput } from "../inputs/EventScalarWhereInput";
import { EventUpdateManyWithWhereWithoutMarket_groupInput } from "../inputs/EventUpdateManyWithWhereWithoutMarket_groupInput";
import { EventUpdateWithWhereUniqueWithoutMarket_groupInput } from "../inputs/EventUpdateWithWhereUniqueWithoutMarket_groupInput";
import { EventUpsertWithWhereUniqueWithoutMarket_groupInput } from "../inputs/EventUpsertWithWhereUniqueWithoutMarket_groupInput";
import { EventWhereUniqueInput } from "../inputs/EventWhereUniqueInput";

@TypeGraphQL.InputType("EventUpdateManyWithoutMarket_groupNestedInput", {})
export class EventUpdateManyWithoutMarket_groupNestedInput {
  @TypeGraphQL.Field(_type => [EventCreateWithoutMarket_groupInput], {
    nullable: true
  })
  create?: EventCreateWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventCreateOrConnectWithoutMarket_groupInput], {
    nullable: true
  })
  connectOrCreate?: EventCreateOrConnectWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventUpsertWithWhereUniqueWithoutMarket_groupInput], {
    nullable: true
  })
  upsert?: EventUpsertWithWhereUniqueWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => EventCreateManyMarket_groupInputEnvelope, {
    nullable: true
  })
  createMany?: EventCreateManyMarket_groupInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [EventWhereUniqueInput], {
    nullable: true
  })
  set?: EventWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventWhereUniqueInput], {
    nullable: true
  })
  disconnect?: EventWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventWhereUniqueInput], {
    nullable: true
  })
  delete?: EventWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventWhereUniqueInput], {
    nullable: true
  })
  connect?: EventWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventUpdateWithWhereUniqueWithoutMarket_groupInput], {
    nullable: true
  })
  update?: EventUpdateWithWhereUniqueWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventUpdateManyWithWhereWithoutMarket_groupInput], {
    nullable: true
  })
  updateMany?: EventUpdateManyWithWhereWithoutMarket_groupInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventScalarWhereInput], {
    nullable: true
  })
  deleteMany?: EventScalarWhereInput[] | undefined;
}
