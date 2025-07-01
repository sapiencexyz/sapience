import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupAvgOrderByAggregateInput } from "../inputs/Market_groupAvgOrderByAggregateInput";
import { Market_groupCountOrderByAggregateInput } from "../inputs/Market_groupCountOrderByAggregateInput";
import { Market_groupMaxOrderByAggregateInput } from "../inputs/Market_groupMaxOrderByAggregateInput";
import { Market_groupMinOrderByAggregateInput } from "../inputs/Market_groupMinOrderByAggregateInput";
import { Market_groupSumOrderByAggregateInput } from "../inputs/Market_groupSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("Market_groupOrderByWithAggregationInput", {})
export class Market_groupOrderByWithAggregationInput {
  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  id?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  createdAt?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  address?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  vaultAddress?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  isYin?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  chainId?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  deployTimestamp?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  deployTxnBlockNumber?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  owner?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  collateralAsset?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  resourceId?: SortOrderInput | undefined;

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
  isCumulative?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  categoryId?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  question?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  baseTokenName?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  quoteTokenName?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  collateralDecimals?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  collateralSymbol?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  initializationNonce?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  factoryAddress?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => SortOrderInput, {
    nullable: true
  })
  minTradeSize?: SortOrderInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: Market_groupCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: Market_groupAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: Market_groupMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: Market_groupMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: Market_groupSumOrderByAggregateInput | undefined;
}
