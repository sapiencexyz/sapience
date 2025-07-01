import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BigIntFilter } from "../inputs/BigIntFilter";
import { MigrationsWhereInput } from "../inputs/MigrationsWhereInput";
import { StringFilter } from "../inputs/StringFilter";

@TypeGraphQL.InputType("MigrationsWhereUniqueInput", {})
export class MigrationsWhereUniqueInput {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id?: number | undefined;

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

  @TypeGraphQL.Field(_type => BigIntFilter, {
    nullable: true
  })
  timestamp?: BigIntFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  name?: StringFilter | undefined;
}
