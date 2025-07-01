import * as TypeGraphQL from "type-graphql";

export enum MarketScalarFieldEnum {
  id = "id",
  createdAt = "createdAt",
  marketId = "marketId",
  startTimestamp = "startTimestamp",
  endTimestamp = "endTimestamp",
  startingSqrtPriceX96 = "startingSqrtPriceX96",
  settlementPriceD18 = "settlementPriceD18",
  settled = "settled",
  baseAssetMinPriceTick = "baseAssetMinPriceTick",
  baseAssetMaxPriceTick = "baseAssetMaxPriceTick",
  minPriceD18 = "minPriceD18",
  maxPriceD18 = "maxPriceD18",
  marketGroupId = "marketGroupId",
  marketParamsFeerate = "marketParamsFeerate",
  marketParamsAssertionliveness = "marketParamsAssertionliveness",
  marketParamsBondcurrency = "marketParamsBondcurrency",
  marketParamsBondamount = "marketParamsBondamount",
  marketParamsClaimstatement = "marketParamsClaimstatement",
  marketParamsUniswappositionmanager = "marketParamsUniswappositionmanager",
  marketParamsUniswapswaprouter = "marketParamsUniswapswaprouter",
  marketParamsUniswapquoter = "marketParamsUniswapquoter",
  marketParamsOptimisticoraclev3 = "marketParamsOptimisticoraclev3",
  "public" = "public",
  question = "question",
  poolAddress = "poolAddress",
  optionName = "optionName",
  rules = "rules"
}
TypeGraphQL.registerEnumType(MarketScalarFieldEnum, {
  name: "MarketScalarFieldEnum",
  description: undefined,
});
