import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventWhereInput } from "../inputs/EventWhereInput";

@TypeGraphQL.InputType("EventListRelationFilter", {})
export class EventListRelationFilter {
  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  every?: EventWhereInput | undefined;

  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  some?: EventWhereInput | undefined;

  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  none?: EventWhereInput | undefined;
}
