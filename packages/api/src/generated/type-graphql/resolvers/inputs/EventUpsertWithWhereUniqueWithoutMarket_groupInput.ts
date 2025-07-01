import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventCreateWithoutMarket_groupInput } from "../inputs/EventCreateWithoutMarket_groupInput";
import { EventUpdateWithoutMarket_groupInput } from "../inputs/EventUpdateWithoutMarket_groupInput";
import { EventWhereUniqueInput } from "../inputs/EventWhereUniqueInput";

@TypeGraphQL.InputType("EventUpsertWithWhereUniqueWithoutMarket_groupInput", {})
export class EventUpsertWithWhereUniqueWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: false
  })
  where!: EventWhereUniqueInput;

  @TypeGraphQL.Field(_type => EventUpdateWithoutMarket_groupInput, {
    nullable: false
  })
  update!: EventUpdateWithoutMarket_groupInput;

  @TypeGraphQL.Field(_type => EventCreateWithoutMarket_groupInput, {
    nullable: false
  })
  create!: EventCreateWithoutMarket_groupInput;
}
