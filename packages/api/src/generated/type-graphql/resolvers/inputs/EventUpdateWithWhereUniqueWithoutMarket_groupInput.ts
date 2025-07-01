import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventUpdateWithoutMarket_groupInput } from "../inputs/EventUpdateWithoutMarket_groupInput";
import { EventWhereUniqueInput } from "../inputs/EventWhereUniqueInput";

@TypeGraphQL.InputType("EventUpdateWithWhereUniqueWithoutMarket_groupInput", {})
export class EventUpdateWithWhereUniqueWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: false
  })
  where!: EventWhereUniqueInput;

  @TypeGraphQL.Field(_type => EventUpdateWithoutMarket_groupInput, {
    nullable: false
  })
  data!: EventUpdateWithoutMarket_groupInput;
}
