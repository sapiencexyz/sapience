import * as TypeGraphQL from "type-graphql";

export enum TransactionScalarFieldEnum {
  id = "id",
  createdAt = "createdAt",
  tradeRatioD18 = "tradeRatioD18",
  type = "type",
  baseToken = "baseToken",
  quoteToken = "quoteToken",
  borrowedBaseToken = "borrowedBaseToken",
  borrowedQuoteToken = "borrowedQuoteToken",
  collateral = "collateral",
  lpBaseDeltaToken = "lpBaseDeltaToken",
  lpQuoteDeltaToken = "lpQuoteDeltaToken",
  eventId = "eventId",
  positionId = "positionId",
  marketPriceId = "marketPriceId",
  collateralTransferId = "collateralTransferId"
}
TypeGraphQL.registerEnumType(TransactionScalarFieldEnum, {
  name: "TransactionScalarFieldEnum",
  description: undefined,
});
