import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BoolFilter } from "../inputs/BoolFilter";
import { CategoryNullableRelationFilter } from "../inputs/CategoryNullableRelationFilter";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DecimalNullableFilter } from "../inputs/DecimalNullableFilter";
import { EventListRelationFilter } from "../inputs/EventListRelationFilter";
import { IntFilter } from "../inputs/IntFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { MarketListRelationFilter } from "../inputs/MarketListRelationFilter";
import { Market_groupWhereInput } from "../inputs/Market_groupWhereInput";
import { ResourceNullableRelationFilter } from "../inputs/ResourceNullableRelationFilter";
import { StringNullableFilter } from "../inputs/StringNullableFilter";
import { market_groupAddressChainIdCompoundUniqueInput } from "../inputs/market_groupAddressChainIdCompoundUniqueInput";

@TypeGraphQL.InputType("Market_groupWhereUniqueInput", {})
export class Market_groupWhereUniqueInput {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id?: number | undefined;

  @TypeGraphQL.Field(_type => market_groupAddressChainIdCompoundUniqueInput, {
    nullable: true
  })
  address_chainId?: market_groupAddressChainIdCompoundUniqueInput | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereInput], {
    nullable: true
  })
  AND?: Market_groupWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereInput], {
    nullable: true
  })
  OR?: Market_groupWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereInput], {
    nullable: true
  })
  NOT?: Market_groupWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  address?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  vaultAddress?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => BoolFilter, {
    nullable: true
  })
  isYin?: BoolFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  chainId?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  deployTimestamp?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  deployTxnBlockNumber?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  owner?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  collateralAsset?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  resourceId?: IntNullableFilter | undefined;

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
  isCumulative?: BoolFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  categoryId?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  question?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  baseTokenName?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  quoteTokenName?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  collateralDecimals?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  collateralSymbol?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  initializationNonce?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  factoryAddress?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  minTradeSize?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => EventListRelationFilter, {
    nullable: true
  })
  event?: EventListRelationFilter | undefined;

  @TypeGraphQL.Field(_type => MarketListRelationFilter, {
    nullable: true
  })
  market?: MarketListRelationFilter | undefined;

  @TypeGraphQL.Field(_type => ResourceNullableRelationFilter, {
    nullable: true
  })
  resource?: ResourceNullableRelationFilter | undefined;

  @TypeGraphQL.Field(_type => CategoryNullableRelationFilter, {
    nullable: true
  })
  category?: CategoryNullableRelationFilter | undefined;
}
