import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceAvgOrderByAggregateInput } from "../inputs/ResourceAvgOrderByAggregateInput";
import { ResourceCountOrderByAggregateInput } from "../inputs/ResourceCountOrderByAggregateInput";
import { ResourceMaxOrderByAggregateInput } from "../inputs/ResourceMaxOrderByAggregateInput";
import { ResourceMinOrderByAggregateInput } from "../inputs/ResourceMinOrderByAggregateInput";
import { ResourceSumOrderByAggregateInput } from "../inputs/ResourceSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("ResourceOrderByWithAggregationInput", {})
export class ResourceOrderByWithAggregationInput {
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

  @TypeGraphQL.Field(_type => ResourceCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: ResourceCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => ResourceAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: ResourceAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => ResourceMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: ResourceMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => ResourceMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: ResourceMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => ResourceSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: ResourceSumOrderByAggregateInput | undefined;
}
