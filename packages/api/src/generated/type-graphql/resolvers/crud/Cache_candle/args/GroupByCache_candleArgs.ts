import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_candleOrderByWithAggregationInput } from "../../../inputs/Cache_candleOrderByWithAggregationInput";
import { Cache_candleScalarWhereWithAggregatesInput } from "../../../inputs/Cache_candleScalarWhereWithAggregatesInput";
import { Cache_candleWhereInput } from "../../../inputs/Cache_candleWhereInput";
import { Cache_candleScalarFieldEnum } from "../../../../enums/Cache_candleScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByCache_candleArgs {
  @TypeGraphQL.Field(_type => Cache_candleWhereInput, {
    nullable: true
  })
  where?: Cache_candleWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Cache_candleOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: Cache_candleOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [Cache_candleScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "candleType" | "interval" | "trailingAvgTime" | "resourceSlug" | "marketIdx" | "timestamp" | "open" | "high" | "low" | "close" | "endTimestamp" | "lastUpdatedTimestamp" | "sumUsed" | "sumFeePaid" | "trailingStartTimestamp" | "address" | "chainId" | "marketId">;

  @TypeGraphQL.Field(_type => Cache_candleScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: Cache_candleScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
