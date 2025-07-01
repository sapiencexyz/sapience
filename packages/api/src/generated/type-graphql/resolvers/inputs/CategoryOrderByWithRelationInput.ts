import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupOrderByRelationAggregateInput } from "../inputs/Market_groupOrderByRelationAggregateInput";
import { ResourceOrderByRelationAggregateInput } from "../inputs/ResourceOrderByRelationAggregateInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("CategoryOrderByWithRelationInput", {})
export class CategoryOrderByWithRelationInput {
  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  id?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  createdAt?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  name?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  slug?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => Market_groupOrderByRelationAggregateInput, {
    nullable: true
  })
  market_group?: Market_groupOrderByRelationAggregateInput | undefined;

  @TypeGraphQL.Field(_type => ResourceOrderByRelationAggregateInput, {
    nullable: true
  })
  resource?: ResourceOrderByRelationAggregateInput | undefined;
}
