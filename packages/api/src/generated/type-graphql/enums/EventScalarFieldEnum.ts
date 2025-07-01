import * as TypeGraphQL from "type-graphql";

export enum EventScalarFieldEnum {
  id = "id",
  createdAt = "createdAt",
  blockNumber = "blockNumber",
  transactionHash = "transactionHash",
  timestamp = "timestamp",
  logIndex = "logIndex",
  logData = "logData",
  marketGroupId = "marketGroupId"
}
TypeGraphQL.registerEnumType(EventScalarFieldEnum, {
  name: "EventScalarFieldEnum",
  description: undefined,
});
