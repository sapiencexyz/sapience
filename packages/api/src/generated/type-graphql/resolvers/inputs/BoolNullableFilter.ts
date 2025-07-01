import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { NestedBoolNullableFilter } from "../inputs/NestedBoolNullableFilter";

@TypeGraphQL.InputType("BoolNullableFilter", {})
export class BoolNullableFilter {
  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  equals?: boolean | undefined;

  @TypeGraphQL.Field(_type => NestedBoolNullableFilter, {
    nullable: true
  })
  not?: NestedBoolNullableFilter | undefined;
}
