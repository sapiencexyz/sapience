import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BigIntWithAggregatesFilter } from "../inputs/BigIntWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringWithAggregatesFilter } from "../inputs/StringWithAggregatesFilter";

@TypeGraphQL.InputType("MigrationsScalarWhereWithAggregatesInput", {})
export class MigrationsScalarWhereWithAggregatesInput {
  @TypeGraphQL.Field(_type => [MigrationsScalarWhereWithAggregatesInput], {
    nullable: true
  })
  AND?: MigrationsScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [MigrationsScalarWhereWithAggregatesInput], {
    nullable: true
  })
  OR?: MigrationsScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [MigrationsScalarWhereWithAggregatesInput], {
    nullable: true
  })
  NOT?: MigrationsScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => IntWithAggregatesFilter, {
    nullable: true
  })
  id?: IntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => BigIntWithAggregatesFilter, {
    nullable: true
  })
  timestamp?: BigIntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringWithAggregatesFilter, {
    nullable: true
  })
  name?: StringWithAggregatesFilter | undefined;
}
