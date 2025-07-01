import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventCreateWithoutTransactionInput } from "../inputs/EventCreateWithoutTransactionInput";
import { EventWhereUniqueInput } from "../inputs/EventWhereUniqueInput";

@TypeGraphQL.InputType("EventCreateOrConnectWithoutTransactionInput", {})
export class EventCreateOrConnectWithoutTransactionInput {
  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: false
  })
  where!: EventWhereUniqueInput;

  @TypeGraphQL.Field(_type => EventCreateWithoutTransactionInput, {
    nullable: false
  })
  create!: EventCreateWithoutTransactionInput;
}
