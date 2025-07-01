import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventCreateManyMarket_groupInput } from "../inputs/EventCreateManyMarket_groupInput";

@TypeGraphQL.InputType("EventCreateManyMarket_groupInputEnvelope", {})
export class EventCreateManyMarket_groupInputEnvelope {
  @TypeGraphQL.Field(_type => [EventCreateManyMarket_groupInput], {
    nullable: false
  })
  data!: EventCreateManyMarket_groupInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
