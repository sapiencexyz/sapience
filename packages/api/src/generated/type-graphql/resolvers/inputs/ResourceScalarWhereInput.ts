import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { IntFilter } from "../inputs/IntFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { StringFilter } from "../inputs/StringFilter";

@TypeGraphQL.InputType("ResourceScalarWhereInput", {})
export class ResourceScalarWhereInput {
  @TypeGraphQL.Field(_type => [ResourceScalarWhereInput], {
    nullable: true
  })
  AND?: ResourceScalarWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceScalarWhereInput], {
    nullable: true
  })
  OR?: ResourceScalarWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceScalarWhereInput], {
    nullable: true
  })
  NOT?: ResourceScalarWhereInput[] | undefined;

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
  name?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  slug?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  categoryId?: IntNullableFilter | undefined;
}
