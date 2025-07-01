import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Cache_candleWhereInput } from "../inputs/Cache_candleWhereInput";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DecimalNullableFilter } from "../inputs/DecimalNullableFilter";
import { IntFilter } from "../inputs/IntFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { StringFilter } from "../inputs/StringFilter";
import { StringNullableFilter } from "../inputs/StringNullableFilter";
import { cache_candleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput } from "../inputs/cache_candleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput";

@TypeGraphQL.InputType("Cache_candleWhereUniqueInput", {})
export class Cache_candleWhereUniqueInput {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id?: number | undefined;

  @TypeGraphQL.Field(_type => cache_candleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput, {
    nullable: true
  })
  candleType_interval_timestamp_resourceSlug_marketIdx_trailingAvgTime?: cache_candleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput | undefined;

  @TypeGraphQL.Field(_type => [Cache_candleWhereInput], {
    nullable: true
  })
  AND?: Cache_candleWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Cache_candleWhereInput], {
    nullable: true
  })
  OR?: Cache_candleWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Cache_candleWhereInput], {
    nullable: true
  })
  NOT?: Cache_candleWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  candleType?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  interval?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  trailingAvgTime?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  resourceSlug?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  marketIdx?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  timestamp?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  open?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  high?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  low?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  close?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  endTimestamp?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  lastUpdatedTimestamp?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  sumUsed?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  sumFeePaid?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  trailingStartTimestamp?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  address?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  chainId?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  marketId?: IntNullableFilter | undefined;
}
