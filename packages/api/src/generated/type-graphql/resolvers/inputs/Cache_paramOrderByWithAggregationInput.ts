import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Cache_paramAvgOrderByAggregateInput } from "../inputs/Cache_paramAvgOrderByAggregateInput";
import { Cache_paramCountOrderByAggregateInput } from "../inputs/Cache_paramCountOrderByAggregateInput";
import { Cache_paramMaxOrderByAggregateInput } from "../inputs/Cache_paramMaxOrderByAggregateInput";
import { Cache_paramMinOrderByAggregateInput } from "../inputs/Cache_paramMinOrderByAggregateInput";
import { Cache_paramSumOrderByAggregateInput } from "../inputs/Cache_paramSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("Cache_paramOrderByWithAggregationInput", {})
export class Cache_paramOrderByWithAggregationInput {
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
  paramName?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  paramValueNumber?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  paramValueString?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => Cache_paramCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: Cache_paramCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Cache_paramAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: Cache_paramAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Cache_paramMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: Cache_paramMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Cache_paramMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: Cache_paramMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Cache_paramSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: Cache_paramSumOrderByAggregateInput | undefined;
}
