import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { NestedBoolNullableFilter } from "../inputs/NestedBoolNullableFilter";
import { NestedIntNullableFilter } from "../inputs/NestedIntNullableFilter";

@TypeGraphQL.InputType("NestedBoolNullableWithAggregatesFilter", {})
export class NestedBoolNullableWithAggregatesFilter {
  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  equals?: boolean | undefined;

  @TypeGraphQL.Field(_type => NestedBoolNullableWithAggregatesFilter, {
    nullable: true
  })
  not?: NestedBoolNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => NestedIntNullableFilter, {
    nullable: true
  })
  _count?: NestedIntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => NestedBoolNullableFilter, {
    nullable: true
  })
  _min?: NestedBoolNullableFilter | undefined;

  @TypeGraphQL.Field(_type => NestedBoolNullableFilter, {
    nullable: true
  })
  _max?: NestedBoolNullableFilter | undefined;
}
