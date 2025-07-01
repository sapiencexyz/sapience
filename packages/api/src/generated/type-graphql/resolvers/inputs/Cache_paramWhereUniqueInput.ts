import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Cache_paramWhereInput } from "../inputs/Cache_paramWhereInput";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DecimalFilter } from "../inputs/DecimalFilter";
import { StringNullableFilter } from "../inputs/StringNullableFilter";

@TypeGraphQL.InputType("Cache_paramWhereUniqueInput", {})
export class Cache_paramWhereUniqueInput {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id?: number | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  paramName?: string | undefined;

  @TypeGraphQL.Field(_type => [Cache_paramWhereInput], {
    nullable: true
  })
  AND?: Cache_paramWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Cache_paramWhereInput], {
    nullable: true
  })
  OR?: Cache_paramWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Cache_paramWhereInput], {
    nullable: true
  })
  NOT?: Cache_paramWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalFilter, {
    nullable: true
  })
  paramValueNumber?: DecimalFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  paramValueString?: StringNullableFilter | undefined;
}
