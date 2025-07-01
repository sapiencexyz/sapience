import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_priceAvgOrderByAggregateInput } from "../inputs/Market_priceAvgOrderByAggregateInput";
import { Market_priceCountOrderByAggregateInput } from "../inputs/Market_priceCountOrderByAggregateInput";
import { Market_priceMaxOrderByAggregateInput } from "../inputs/Market_priceMaxOrderByAggregateInput";
import { Market_priceMinOrderByAggregateInput } from "../inputs/Market_priceMinOrderByAggregateInput";
import { Market_priceSumOrderByAggregateInput } from "../inputs/Market_priceSumOrderByAggregateInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("Market_priceOrderByWithAggregationInput", {})
export class Market_priceOrderByWithAggregationInput {
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
  timestamp?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  value?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => Market_priceCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: Market_priceCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: Market_priceAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: Market_priceMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: Market_priceMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: Market_priceSumOrderByAggregateInput | undefined;
}
