import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Resource_priceAvgOrderByAggregateInput } from "../inputs/Resource_priceAvgOrderByAggregateInput";
import { Resource_priceCountOrderByAggregateInput } from "../inputs/Resource_priceCountOrderByAggregateInput";
import { Resource_priceMaxOrderByAggregateInput } from "../inputs/Resource_priceMaxOrderByAggregateInput";
import { Resource_priceMinOrderByAggregateInput } from "../inputs/Resource_priceMinOrderByAggregateInput";
import { Resource_priceSumOrderByAggregateInput } from "../inputs/Resource_priceSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("Resource_priceOrderByWithAggregationInput", {})
export class Resource_priceOrderByWithAggregationInput {
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
  blockNumber?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  timestamp?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  value?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  used?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  feePaid?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  resourceId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: Resource_priceCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: Resource_priceAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: Resource_priceMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: Resource_priceMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: Resource_priceSumOrderByAggregateInput | undefined;
}
