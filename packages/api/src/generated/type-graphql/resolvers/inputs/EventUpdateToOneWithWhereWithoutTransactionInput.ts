import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventUpdateWithoutTransactionInput } from "../inputs/EventUpdateWithoutTransactionInput";
import { EventWhereInput } from "../inputs/EventWhereInput";

@TypeGraphQL.InputType("EventUpdateToOneWithWhereWithoutTransactionInput", {})
export class EventUpdateToOneWithWhereWithoutTransactionInput {
  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  where?: EventWhereInput | undefined;

  @TypeGraphQL.Field(_type => EventUpdateWithoutTransactionInput, {
    nullable: false
  })
  data!: EventUpdateWithoutTransactionInput;
}
