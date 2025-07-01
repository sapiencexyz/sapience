import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BoolNullableWithAggregatesFilter } from "../inputs/BoolNullableWithAggregatesFilter";
import { BoolWithAggregatesFilter } from "../inputs/BoolWithAggregatesFilter";
import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { DecimalNullableWithAggregatesFilter } from "../inputs/DecimalNullableWithAggregatesFilter";
import { IntNullableWithAggregatesFilter } from "../inputs/IntNullableWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringNullableWithAggregatesFilter } from "../inputs/StringNullableWithAggregatesFilter";

@TypeGraphQL.InputType("MarketScalarWhereWithAggregatesInput", {})
export class MarketScalarWhereWithAggregatesInput {
  @TypeGraphQL.Field(_type => [MarketScalarWhereWithAggregatesInput], {
    nullable: true
  })
  AND?: MarketScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketScalarWhereWithAggregatesInput], {
    nullable: true
  })
  OR?: MarketScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketScalarWhereWithAggregatesInput], {
    nullable: true
  })
  NOT?: MarketScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => IntWithAggregatesFilter, {
    nullable: true
  })
  id?: IntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeWithAggregatesFilter, {
    nullable: true
  })
  createdAt?: DateTimeWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntWithAggregatesFilter, {
    nullable: true
  })
  marketId?: IntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  startTimestamp?: IntNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  endTimestamp?: IntNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  startingSqrtPriceX96?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  settlementPriceD18?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => BoolNullableWithAggregatesFilter, {
    nullable: true
  })
  settled?: BoolNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  baseAssetMinPriceTick?: IntNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  baseAssetMaxPriceTick?: IntNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  minPriceD18?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  maxPriceD18?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  marketGroupId?: IntNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  marketParamsFeerate?: IntNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  marketParamsAssertionliveness?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  marketParamsBondcurrency?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  marketParamsBondamount?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  marketParamsClaimstatement?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  marketParamsUniswappositionmanager?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  marketParamsUniswapswaprouter?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  marketParamsUniswapquoter?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  marketParamsOptimisticoraclev3?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => BoolWithAggregatesFilter, {
    nullable: true
  })
  public?: BoolWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  question?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  poolAddress?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  optionName?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  rules?: StringNullableWithAggregatesFilter | undefined;
}
