import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";

@TypeGraphQL.InputType("NestedBoolNullableFilter", {})
export class NestedBoolNullableFilter {
  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  equals?: boolean | undefined;

  @TypeGraphQL.Field(_type => NestedBoolNullableFilter, {
    nullable: true
  })
  not?: NestedBoolNullableFilter | undefined;
}
