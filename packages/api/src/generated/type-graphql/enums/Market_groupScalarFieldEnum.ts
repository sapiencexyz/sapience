import * as TypeGraphQL from "type-graphql";

export enum Market_groupScalarFieldEnum {
  id = "id",
  createdAt = "createdAt",
  address = "address",
  vaultAddress = "vaultAddress",
  isYin = "isYin",
  chainId = "chainId",
  deployTimestamp = "deployTimestamp",
  deployTxnBlockNumber = "deployTxnBlockNumber",
  owner = "owner",
  collateralAsset = "collateralAsset",
  resourceId = "resourceId",
  marketParamsFeerate = "marketParamsFeerate",
  marketParamsAssertionliveness = "marketParamsAssertionliveness",
  marketParamsBondcurrency = "marketParamsBondcurrency",
  marketParamsBondamount = "marketParamsBondamount",
  marketParamsClaimstatement = "marketParamsClaimstatement",
  marketParamsUniswappositionmanager = "marketParamsUniswappositionmanager",
  marketParamsUniswapswaprouter = "marketParamsUniswapswaprouter",
  marketParamsUniswapquoter = "marketParamsUniswapquoter",
  marketParamsOptimisticoraclev3 = "marketParamsOptimisticoraclev3",
  isCumulative = "isCumulative",
  categoryId = "categoryId",
  question = "question",
  baseTokenName = "baseTokenName",
  quoteTokenName = "quoteTokenName",
  collateralDecimals = "collateralDecimals",
  collateralSymbol = "collateralSymbol",
  initializationNonce = "initializationNonce",
  factoryAddress = "factoryAddress",
  minTradeSize = "minTradeSize"
}
TypeGraphQL.registerEnumType(Market_groupScalarFieldEnum, {
  name: "Market_groupScalarFieldEnum",
  description: undefined,
});
