import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventCreateWithoutMarket_groupInput } from "../inputs/EventCreateWithoutMarket_groupInput";
import { EventWhereUniqueInput } from "../inputs/EventWhereUniqueInput";

@TypeGraphQL.InputType("EventCreateOrConnectWithoutMarket_groupInput", {})
export class EventCreateOrConnectWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: false
  })
  where!: EventWhereUniqueInput;

  @TypeGraphQL.Field(_type => EventCreateWithoutMarket_groupInput, {
    nullable: false
  })
  create!: EventCreateWithoutMarket_groupInput;
}
