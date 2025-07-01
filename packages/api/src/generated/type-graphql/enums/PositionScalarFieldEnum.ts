import * as TypeGraphQL from "type-graphql";

export enum PositionScalarFieldEnum {
  id = "id",
  createdAt = "createdAt",
  positionId = "positionId",
  owner = "owner",
  isLP = "isLP",
  highPriceTick = "highPriceTick",
  lowPriceTick = "lowPriceTick",
  isSettled = "isSettled",
  lpBaseToken = "lpBaseToken",
  lpQuoteToken = "lpQuoteToken",
  baseToken = "baseToken",
  quoteToken = "quoteToken",
  borrowedBaseToken = "borrowedBaseToken",
  borrowedQuoteToken = "borrowedQuoteToken",
  collateral = "collateral",
  marketId = "marketId"
}
TypeGraphQL.registerEnumType(PositionScalarFieldEnum, {
  name: "PositionScalarFieldEnum",
  description: undefined,
});
