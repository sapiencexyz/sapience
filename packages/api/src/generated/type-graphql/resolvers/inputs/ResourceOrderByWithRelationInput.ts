import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryOrderByWithRelationInput } from "../inputs/CategoryOrderByWithRelationInput";
import { Market_groupOrderByRelationAggregateInput } from "../inputs/Market_groupOrderByRelationAggregateInput";
import { Resource_priceOrderByRelationAggregateInput } from "../inputs/Resource_priceOrderByRelationAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("ResourceOrderByWithRelationInput", {})
export class ResourceOrderByWithRelationInput {
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

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  categoryId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupOrderByRelationAggregateInput, {
    nullable: true
  })
  market_group?: Market_groupOrderByRelationAggregateInput | undefined;

  @TypeGraphQL.Field(_type => CategoryOrderByWithRelationInput, {
    nullable: true
  })
  category?: CategoryOrderByWithRelationInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceOrderByRelationAggregateInput, {
    nullable: true
  })
  resource_price?: Resource_priceOrderByRelationAggregateInput | undefined;
}
