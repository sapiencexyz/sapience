import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { IntFilter } from "../inputs/IntFilter";
import { StringFilter } from "../inputs/StringFilter";

@TypeGraphQL.InputType("Render_jobWhereInput", {})
export class Render_jobWhereInput {
  @TypeGraphQL.Field(_type => [Render_jobWhereInput], {
    nullable: true
  })
  AND?: Render_jobWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Render_jobWhereInput], {
    nullable: true
  })
  OR?: Render_jobWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Render_jobWhereInput], {
    nullable: true
  })
  NOT?: Render_jobWhereInput[] | undefined;

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
  jobId?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  serviceId?: StringFilter | undefined;
}
