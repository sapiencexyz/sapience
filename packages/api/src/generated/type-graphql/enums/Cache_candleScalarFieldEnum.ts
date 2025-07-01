import * as TypeGraphQL from "type-graphql";

export enum Cache_candleScalarFieldEnum {
  id = "id",
  createdAt = "createdAt",
  candleType = "candleType",
  interval = "interval",
  trailingAvgTime = "trailingAvgTime",
  resourceSlug = "resourceSlug",
  marketIdx = "marketIdx",
  timestamp = "timestamp",
  open = "open",
  high = "high",
  low = "low",
  close = "close",
  endTimestamp = "endTimestamp",
  lastUpdatedTimestamp = "lastUpdatedTimestamp",
  sumUsed = "sumUsed",
  sumFeePaid = "sumFeePaid",
  trailingStartTimestamp = "trailingStartTimestamp",
  address = "address",
  chainId = "chainId",
  marketId = "marketId"
}
TypeGraphQL.registerEnumType(Cache_candleScalarFieldEnum, {
  name: "Cache_candleScalarFieldEnum",
  description: undefined,
});
