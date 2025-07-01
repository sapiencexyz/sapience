import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { IntNullableWithAggregatesFilter } from "../inputs/IntNullableWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringWithAggregatesFilter } from "../inputs/StringWithAggregatesFilter";

@TypeGraphQL.InputType("ResourceScalarWhereWithAggregatesInput", {})
export class ResourceScalarWhereWithAggregatesInput {
  @TypeGraphQL.Field(_type => [ResourceScalarWhereWithAggregatesInput], {
    nullable: true
  })
  AND?: ResourceScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceScalarWhereWithAggregatesInput], {
    nullable: true
  })
  OR?: ResourceScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceScalarWhereWithAggregatesInput], {
    nullable: true
  })
  NOT?: ResourceScalarWhereWithAggregatesInput[] | undefined;

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
  name?: StringWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringWithAggregatesFilter, {
    nullable: true
  })
  slug?: StringWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  categoryId?: IntNullableWithAggregatesFilter | undefined;
}
