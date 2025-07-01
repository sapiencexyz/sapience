import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventCreateOrConnectWithoutTransactionInput } from "../inputs/EventCreateOrConnectWithoutTransactionInput";
import { EventCreateWithoutTransactionInput } from "../inputs/EventCreateWithoutTransactionInput";
import { EventWhereUniqueInput } from "../inputs/EventWhereUniqueInput";

@TypeGraphQL.InputType("EventCreateNestedOneWithoutTransactionInput", {})
export class EventCreateNestedOneWithoutTransactionInput {
  @TypeGraphQL.Field(_type => EventCreateWithoutTransactionInput, {
    nullable: true
  })
  create?: EventCreateWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => EventCreateOrConnectWithoutTransactionInput, {
    nullable: true
  })
  connectOrCreate?: EventCreateOrConnectWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: true
  })
  connect?: EventWhereUniqueInput | undefined;
}
