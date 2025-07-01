import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryNullableRelationFilter } from "../inputs/CategoryNullableRelationFilter";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { Market_groupListRelationFilter } from "../inputs/Market_groupListRelationFilter";
import { ResourceWhereInput } from "../inputs/ResourceWhereInput";
import { Resource_priceListRelationFilter } from "../inputs/Resource_priceListRelationFilter";

@TypeGraphQL.InputType("ResourceWhereUniqueInput", {})
export class ResourceWhereUniqueInput {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id?: number | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  name?: string | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: true
  })
  slug?: string | undefined;

  @TypeGraphQL.Field(_type => [ResourceWhereInput], {
    nullable: true
  })
  AND?: ResourceWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceWhereInput], {
    nullable: true
  })
  OR?: ResourceWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceWhereInput], {
    nullable: true
  })
  NOT?: ResourceWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  categoryId?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => Market_groupListRelationFilter, {
    nullable: true
  })
  market_group?: Market_groupListRelationFilter | undefined;

  @TypeGraphQL.Field(_type => CategoryNullableRelationFilter, {
    nullable: true
  })
  category?: CategoryNullableRelationFilter | undefined;

  @TypeGraphQL.Field(_type => Resource_priceListRelationFilter, {
    nullable: true
  })
  resource_price?: Resource_priceListRelationFilter | undefined;
}
