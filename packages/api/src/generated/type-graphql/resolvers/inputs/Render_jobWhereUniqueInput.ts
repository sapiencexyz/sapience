import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { Render_jobWhereInput } from "../inputs/Render_jobWhereInput";
import { StringFilter } from "../inputs/StringFilter";

@TypeGraphQL.InputType("Render_jobWhereUniqueInput", {})
export class Render_jobWhereUniqueInput {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id?: number | undefined;

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
