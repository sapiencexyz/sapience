import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DecimalFilter } from "../inputs/DecimalFilter";
import { IntFilter } from "../inputs/IntFilter";
import { StringFilter } from "../inputs/StringFilter";
import { StringNullableFilter } from "../inputs/StringNullableFilter";

@TypeGraphQL.InputType("Cache_paramWhereInput", {})
export class Cache_paramWhereInput {
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

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  id?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  paramName?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalFilter, {
    nullable: true
  })
  paramValueNumber?: DecimalFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  paramValueString?: StringNullableFilter | undefined;
}
