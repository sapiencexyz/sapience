import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringWithAggregatesFilter } from "../inputs/StringWithAggregatesFilter";

@TypeGraphQL.InputType("Render_jobScalarWhereWithAggregatesInput", {})
export class Render_jobScalarWhereWithAggregatesInput {
  @TypeGraphQL.Field(_type => [Render_jobScalarWhereWithAggregatesInput], {
    nullable: true
  })
  AND?: Render_jobScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [Render_jobScalarWhereWithAggregatesInput], {
    nullable: true
  })
  OR?: Render_jobScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [Render_jobScalarWhereWithAggregatesInput], {
    nullable: true
  })
  NOT?: Render_jobScalarWhereWithAggregatesInput[] | undefined;

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
  jobId?: StringWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringWithAggregatesFilter, {
    nullable: true
  })
  serviceId?: StringWithAggregatesFilter | undefined;
}
