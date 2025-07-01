import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MarketOrderByWithAggregationInput } from "../../../inputs/MarketOrderByWithAggregationInput";
import { MarketScalarWhereWithAggregatesInput } from "../../../inputs/MarketScalarWhereWithAggregatesInput";
import { MarketWhereInput } from "../../../inputs/MarketWhereInput";
import { MarketScalarFieldEnum } from "../../../../enums/MarketScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByMarketArgs {
  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  where?: MarketWhereInput | undefined;

  @TypeGraphQL.Field(_type => [MarketOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: MarketOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "marketId" | "startTimestamp" | "endTimestamp" | "startingSqrtPriceX96" | "settlementPriceD18" | "settled" | "baseAssetMinPriceTick" | "baseAssetMaxPriceTick" | "minPriceD18" | "maxPriceD18" | "marketGroupId" | "marketParamsFeerate" | "marketParamsAssertionliveness" | "marketParamsBondcurrency" | "marketParamsBondamount" | "marketParamsClaimstatement" | "marketParamsUniswappositionmanager" | "marketParamsUniswapswaprouter" | "marketParamsUniswapquoter" | "marketParamsOptimisticoraclev3" | "public" | "question" | "poolAddress" | "optionName" | "rules">;

  @TypeGraphQL.Field(_type => MarketScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: MarketScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
