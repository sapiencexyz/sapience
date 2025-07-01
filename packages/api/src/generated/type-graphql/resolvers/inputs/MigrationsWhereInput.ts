import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BigIntFilter } from "../inputs/BigIntFilter";
import { IntFilter } from "../inputs/IntFilter";
import { StringFilter } from "../inputs/StringFilter";

@TypeGraphQL.InputType("MigrationsWhereInput", {})
export class MigrationsWhereInput {
  @TypeGraphQL.Field(_type => [MigrationsWhereInput], {
    nullable: true
  })
  AND?: MigrationsWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [MigrationsWhereInput], {
    nullable: true
  })
  OR?: MigrationsWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [MigrationsWhereInput], {
    nullable: true
  })
  NOT?: MigrationsWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  id?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => BigIntFilter, {
    nullable: true
  })
  timestamp?: BigIntFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  name?: StringFilter | undefined;
}
