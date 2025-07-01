import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DecimalFilter } from "../inputs/DecimalFilter";
import { IntFilter } from "../inputs/IntFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { ResourceNullableRelationFilter } from "../inputs/ResourceNullableRelationFilter";

@TypeGraphQL.InputType("Resource_priceWhereInput", {})
export class Resource_priceWhereInput {
  @TypeGraphQL.Field(_type => [Resource_priceWhereInput], {
    nullable: true
  })
  AND?: Resource_priceWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceWhereInput], {
    nullable: true
  })
  OR?: Resource_priceWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Resource_priceWhereInput], {
    nullable: true
  })
  NOT?: Resource_priceWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  id?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  blockNumber?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  timestamp?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalFilter, {
    nullable: true
  })
  value?: DecimalFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalFilter, {
    nullable: true
  })
  used?: DecimalFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalFilter, {
    nullable: true
  })
  feePaid?: DecimalFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  resourceId?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => ResourceNullableRelationFilter, {
    nullable: true
  })
  resource?: ResourceNullableRelationFilter | undefined;
}
