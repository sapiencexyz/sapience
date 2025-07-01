import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketAvgOrderByAggregateInput } from "../inputs/MarketAvgOrderByAggregateInput";
import { MarketCountOrderByAggregateInput } from "../inputs/MarketCountOrderByAggregateInput";
import { MarketMaxOrderByAggregateInput } from "../inputs/MarketMaxOrderByAggregateInput";
import { MarketMinOrderByAggregateInput } from "../inputs/MarketMinOrderByAggregateInput";
import { MarketSumOrderByAggregateInput } from "../inputs/MarketSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("MarketOrderByWithAggregationInput", {})
export class MarketOrderByWithAggregationInput {
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
  marketId?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  startTimestamp?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  endTimestamp?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  startingSqrtPriceX96?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  settlementPriceD18?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  settled?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  baseAssetMinPriceTick?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  baseAssetMaxPriceTick?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  minPriceD18?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  maxPriceD18?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketGroupId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketParamsFeerate?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketParamsAssertionliveness?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketParamsBondcurrency?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketParamsBondamount?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketParamsClaimstatement?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketParamsUniswappositionmanager?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketParamsUniswapswaprouter?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketParamsUniswapquoter?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  marketParamsOptimisticoraclev3?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  public?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  question?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  poolAddress?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  optionName?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  rules?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => MarketCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: MarketCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => MarketAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: MarketAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => MarketMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: MarketMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => MarketMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: MarketMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => MarketSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: MarketSumOrderByAggregateInput | undefined;
}
