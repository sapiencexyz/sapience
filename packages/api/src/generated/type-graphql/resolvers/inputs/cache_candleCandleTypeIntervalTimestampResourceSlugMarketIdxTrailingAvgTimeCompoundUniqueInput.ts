import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";

@TypeGraphQL.InputType("cache_candleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput", {})
export class cache_candleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput {
  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  candleType!: string;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  interval!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  timestamp!: number;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  resourceSlug!: string;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  marketIdx!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  trailingAvgTime!: number;
}
