import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BoolFilter } from "../inputs/BoolFilter";
import { BoolNullableFilter } from "../inputs/BoolNullableFilter";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DecimalNullableFilter } from "../inputs/DecimalNullableFilter";
import { IntFilter } from "../inputs/IntFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { StringNullableFilter } from "../inputs/StringNullableFilter";

@TypeGraphQL.InputType("MarketScalarWhereInput", {})
export class MarketScalarWhereInput {
  @TypeGraphQL.Field(_type => [MarketScalarWhereInput], {
    nullable: true
  })
  AND?: MarketScalarWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketScalarWhereInput], {
    nullable: true
  })
  OR?: MarketScalarWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [MarketScalarWhereInput], {
    nullable: true
  })
  NOT?: MarketScalarWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  id?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  marketId?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  startTimestamp?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  endTimestamp?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  startingSqrtPriceX96?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  settlementPriceD18?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => BoolNullableFilter, {
    nullable: true
  })
  settled?: BoolNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  baseAssetMinPriceTick?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  baseAssetMaxPriceTick?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  minPriceD18?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  maxPriceD18?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  marketGroupId?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  marketParamsFeerate?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  marketParamsAssertionliveness?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  marketParamsBondcurrency?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  marketParamsBondamount?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  marketParamsClaimstatement?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  marketParamsUniswappositionmanager?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  marketParamsUniswapswaprouter?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  marketParamsUniswapquoter?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  marketParamsOptimisticoraclev3?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => BoolFilter, {
    nullable: true
  })
  public?: BoolFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  question?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  poolAddress?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  optionName?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  rules?: StringNullableFilter | undefined;
}
