import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { DecimalWithAggregatesFilter } from "../inputs/DecimalWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringNullableWithAggregatesFilter } from "../inputs/StringNullableWithAggregatesFilter";
import { StringWithAggregatesFilter } from "../inputs/StringWithAggregatesFilter";

@TypeGraphQL.InputType("Cache_paramScalarWhereWithAggregatesInput", {})
export class Cache_paramScalarWhereWithAggregatesInput {
  @TypeGraphQL.Field(_type => [Cache_paramScalarWhereWithAggregatesInput], {
    nullable: true
  })
  AND?: Cache_paramScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [Cache_paramScalarWhereWithAggregatesInput], {
    nullable: true
  })
  OR?: Cache_paramScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [Cache_paramScalarWhereWithAggregatesInput], {
    nullable: true
  })
  NOT?: Cache_paramScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => IntWithAggregatesFilter, {
    nullable: true
  })
  id?: IntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeWithAggregatesFilter, {
    nullable: true
  })
  createdAt?: DateTimeWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringWithAggregatesFilter, {
    nullable: true
  })
  paramName?: StringWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalWithAggregatesFilter, {
    nullable: true
  })
  paramValueNumber?: DecimalWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  paramValueString?: StringNullableWithAggregatesFilter | undefined;
}
