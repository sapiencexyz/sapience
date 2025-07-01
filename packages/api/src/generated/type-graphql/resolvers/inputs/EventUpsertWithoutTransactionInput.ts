import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventCreateWithoutTransactionInput } from "../inputs/EventCreateWithoutTransactionInput";
import { EventUpdateWithoutTransactionInput } from "../inputs/EventUpdateWithoutTransactionInput";
import { EventWhereInput } from "../inputs/EventWhereInput";

@TypeGraphQL.InputType("EventUpsertWithoutTransactionInput", {})
export class EventUpsertWithoutTransactionInput {
  @TypeGraphQL.Field(_type => EventUpdateWithoutTransactionInput, {
    nullable: false
  })
  update!: EventUpdateWithoutTransactionInput;

  @TypeGraphQL.Field(_type => EventCreateWithoutTransactionInput, {
    nullable: false
  })
  create!: EventCreateWithoutTransactionInput;

  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  where?: EventWhereInput | undefined;
}
