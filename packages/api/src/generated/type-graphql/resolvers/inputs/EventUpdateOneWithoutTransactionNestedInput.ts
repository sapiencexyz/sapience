import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventCreateOrConnectWithoutTransactionInput } from "../inputs/EventCreateOrConnectWithoutTransactionInput";
import { EventCreateWithoutTransactionInput } from "../inputs/EventCreateWithoutTransactionInput";
import { EventUpdateToOneWithWhereWithoutTransactionInput } from "../inputs/EventUpdateToOneWithWhereWithoutTransactionInput";
import { EventUpsertWithoutTransactionInput } from "../inputs/EventUpsertWithoutTransactionInput";
import { EventWhereInput } from "../inputs/EventWhereInput";
import { EventWhereUniqueInput } from "../inputs/EventWhereUniqueInput";

@TypeGraphQL.InputType("EventUpdateOneWithoutTransactionNestedInput", {})
export class EventUpdateOneWithoutTransactionNestedInput {
  @TypeGraphQL.Field(_type => EventCreateWithoutTransactionInput, {
    nullable: true
  })
  create?: EventCreateWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => EventCreateOrConnectWithoutTransactionInput, {
    nullable: true
  })
  connectOrCreate?: EventCreateOrConnectWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => EventUpsertWithoutTransactionInput, {
    nullable: true
  })
  upsert?: EventUpsertWithoutTransactionInput | undefined;

  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  disconnect?: EventWhereInput | undefined;

  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  delete?: EventWhereInput | undefined;

  @TypeGraphQL.Field(_type => EventWhereUniqueInput, {
    nullable: true
  })
  connect?: EventWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => EventUpdateToOneWithWhereWithoutTransactionInput, {
    nullable: true
  })
  update?: EventUpdateToOneWithWhereWithoutTransactionInput | undefined;
}
