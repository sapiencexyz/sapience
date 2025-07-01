import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { IntFilter } from "../inputs/IntFilter";
import { Market_groupListRelationFilter } from "../inputs/Market_groupListRelationFilter";
import { ResourceListRelationFilter } from "../inputs/ResourceListRelationFilter";
import { StringFilter } from "../inputs/StringFilter";

@TypeGraphQL.InputType("CategoryWhereInput", {})
export class CategoryWhereInput {
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

  @TypeGraphQL.Field(_type => Market_groupListRelationFilter, {
    nullable: true
  })
  market_group?: Market_groupListRelationFilter | undefined;

  @TypeGraphQL.Field(_type => ResourceListRelationFilter, {
    nullable: true
  })
  resource?: ResourceListRelationFilter | undefined;
}
