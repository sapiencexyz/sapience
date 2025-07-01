import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionAvgOrderByAggregateInput } from "../inputs/PositionAvgOrderByAggregateInput";
import { PositionCountOrderByAggregateInput } from "../inputs/PositionCountOrderByAggregateInput";
import { PositionMaxOrderByAggregateInput } from "../inputs/PositionMaxOrderByAggregateInput";
import { PositionMinOrderByAggregateInput } from "../inputs/PositionMinOrderByAggregateInput";
import { PositionSumOrderByAggregateInput } from "../inputs/PositionSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("PositionOrderByWithAggregationInput", {})
export class PositionOrderByWithAggregationInput {
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
  positionId?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  owner?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  isLP?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  highPriceTick?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  lowPriceTick?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  isSettled?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  lpBaseToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  lpQuoteToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  baseToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  quoteToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  borrowedBaseToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  borrowedQuoteToken?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  collateral?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => PositionCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: PositionCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => PositionAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: PositionAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => PositionMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: PositionMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => PositionMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: PositionMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => PositionSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: PositionSumOrderByAggregateInput | undefined;
}
