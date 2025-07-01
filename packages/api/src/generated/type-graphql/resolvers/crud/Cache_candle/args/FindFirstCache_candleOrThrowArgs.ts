import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_candleOrderByWithRelationInput } from "../../../inputs/Cache_candleOrderByWithRelationInput";
import { Cache_candleWhereInput } from "../../../inputs/Cache_candleWhereInput";
import { Cache_candleWhereUniqueInput } from "../../../inputs/Cache_candleWhereUniqueInput";
import { Cache_candleScalarFieldEnum } from "../../../../enums/Cache_candleScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class FindFirstCache_candleOrThrowArgs {
  @TypeGraphQL.Field(_type => Cache_candleWhereInput, {
    nullable: true
  })
  where?: Cache_candleWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Cache_candleOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: Cache_candleOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => Cache_candleWhereUniqueInput, {
    nullable: true
  })
  cursor?: Cache_candleWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;

  @TypeGraphQL.Field(_type => [Cache_candleScalarFieldEnum], {
    nullable: true
  })
  distinct?: Array<"id" | "createdAt" | "candleType" | "interval" | "trailingAvgTime" | "resourceSlug" | "marketIdx" | "timestamp" | "open" | "high" | "low" | "close" | "endTimestamp" | "lastUpdatedTimestamp" | "sumUsed" | "sumFeePaid" | "trailingStartTimestamp" | "address" | "chainId" | "marketId"> | undefined;
}
