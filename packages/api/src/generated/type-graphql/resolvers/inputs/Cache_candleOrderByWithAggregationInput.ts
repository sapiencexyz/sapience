import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Cache_candleAvgOrderByAggregateInput } from "../inputs/Cache_candleAvgOrderByAggregateInput";
import { Cache_candleCountOrderByAggregateInput } from "../inputs/Cache_candleCountOrderByAggregateInput";
import { Cache_candleMaxOrderByAggregateInput } from "../inputs/Cache_candleMaxOrderByAggregateInput";
import { Cache_candleMinOrderByAggregateInput } from "../inputs/Cache_candleMinOrderByAggregateInput";
import { Cache_candleSumOrderByAggregateInput } from "../inputs/Cache_candleSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("Cache_candleOrderByWithAggregationInput", {})
export class Cache_candleOrderByWithAggregationInput {
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
  candleType?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  interval?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  trailingAvgTime?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  resourceSlug?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketIdx?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  timestamp?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  open?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  high?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  low?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  close?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  endTimestamp?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  lastUpdatedTimestamp?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  sumUsed?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  sumFeePaid?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  trailingStartTimestamp?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  address?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  chainId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => Cache_candleCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: Cache_candleCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Cache_candleAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: Cache_candleAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Cache_candleMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: Cache_candleMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Cache_candleMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: Cache_candleMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Cache_candleSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: Cache_candleSumOrderByAggregateInput | undefined;
}
