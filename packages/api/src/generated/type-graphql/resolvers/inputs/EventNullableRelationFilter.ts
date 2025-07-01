import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { EventWhereInput } from "../inputs/EventWhereInput";

@TypeGraphQL.InputType("EventNullableRelationFilter", {})
export class EventNullableRelationFilter {
  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  is?: EventWhereInput | undefined;

  @TypeGraphQL.Field(_type => EventWhereInput, {
    nullable: true
  })
  isNot?: EventWhereInput | undefined;
}
