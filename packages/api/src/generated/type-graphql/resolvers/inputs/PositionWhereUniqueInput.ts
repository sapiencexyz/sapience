import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BoolFilter } from "../inputs/BoolFilter";
import { BoolNullableFilter } from "../inputs/BoolNullableFilter";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DecimalFilter } from "../inputs/DecimalFilter";
import { DecimalNullableFilter } from "../inputs/DecimalNullableFilter";
import { IntFilter } from "../inputs/IntFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { MarketNullableRelationFilter } from "../inputs/MarketNullableRelationFilter";
import { PositionWhereInput } from "../inputs/PositionWhereInput";
import { StringNullableFilter } from "../inputs/StringNullableFilter";
import { TransactionListRelationFilter } from "../inputs/TransactionListRelationFilter";
import { positionPositionIdMarketIdCompoundUniqueInput } from "../inputs/positionPositionIdMarketIdCompoundUniqueInput";

@TypeGraphQL.InputType("PositionWhereUniqueInput", {})
export class PositionWhereUniqueInput {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id?: number | undefined;

  @TypeGraphQL.Field(_type => positionPositionIdMarketIdCompoundUniqueInput, {
    nullable: true
  })
  positionId_marketId?: positionPositionIdMarketIdCompoundUniqueInput | undefined;

  @TypeGraphQL.Field(_type => [PositionWhereInput], {
    nullable: true
  })
  AND?: PositionWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionWhereInput], {
    nullable: true
  })
  OR?: PositionWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionWhereInput], {
    nullable: true
  })
  NOT?: PositionWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  positionId?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  owner?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => BoolFilter, {
    nullable: true
  })
  isLP?: BoolFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  highPriceTick?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  lowPriceTick?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => BoolNullableFilter, {
    nullable: true
  })
  isSettled?: BoolNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  lpBaseToken?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  lpQuoteToken?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  baseToken?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  quoteToken?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  borrowedBaseToken?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  borrowedQuoteToken?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalFilter, {
    nullable: true
  })
  collateral?: DecimalFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  marketId?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => MarketNullableRelationFilter, {
    nullable: true
  })
  market?: MarketNullableRelationFilter | undefined;

  @TypeGraphQL.Field(_type => TransactionListRelationFilter, {
    nullable: true
  })
  transaction?: TransactionListRelationFilter | undefined;
}
