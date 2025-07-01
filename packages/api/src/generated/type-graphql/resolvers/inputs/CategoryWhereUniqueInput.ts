import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryWhereInput } from "../inputs/CategoryWhereInput";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { Market_groupListRelationFilter } from "../inputs/Market_groupListRelationFilter";
import { ResourceListRelationFilter } from "../inputs/ResourceListRelationFilter";

@TypeGraphQL.InputType("CategoryWhereUniqueInput", {})
export class CategoryWhereUniqueInput {
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

  @TypeGraphQL.Field(_type => [CategoryWhereInput], {
    nullable: true
  })
  AND?: CategoryWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [CategoryWhereInput], {
    nullable: true
  })
  OR?: CategoryWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [CategoryWhereInput], {
    nullable: true
  })
  NOT?: CategoryWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => Market_groupListRelationFilter, {
    nullable: true
  })
  market_group?: Market_groupListRelationFilter | undefined;

  @TypeGraphQL.Field(_type => ResourceListRelationFilter, {
    nullable: true
  })
  resource?: ResourceListRelationFilter | undefined;
}
