import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferNullableRelationFilter } from "../inputs/Collateral_transferNullableRelationFilter";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DecimalFilter } from "../inputs/DecimalFilter";
import { DecimalNullableFilter } from "../inputs/DecimalNullableFilter";
import { Enumtransaction_type_enumFilter } from "../inputs/Enumtransaction_type_enumFilter";
import { EventNullableRelationFilter } from "../inputs/EventNullableRelationFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { Market_priceNullableRelationFilter } from "../inputs/Market_priceNullableRelationFilter";
import { PositionNullableRelationFilter } from "../inputs/PositionNullableRelationFilter";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";

@TypeGraphQL.InputType("TransactionWhereUniqueInput", {})
export class TransactionWhereUniqueInput {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  id?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  eventId?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketPriceId?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  collateralTransferId?: number | undefined;

  @TypeGraphQL.Field(_type => [TransactionWhereInput], {
    nullable: true
  })
  AND?: TransactionWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionWhereInput], {
    nullable: true
  })
  OR?: TransactionWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionWhereInput], {
    nullable: true
  })
  NOT?: TransactionWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  tradeRatioD18?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => Enumtransaction_type_enumFilter, {
    nullable: true
  })
  type?: Enumtransaction_type_enumFilter | undefined;

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

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  lpBaseDeltaToken?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableFilter, {
    nullable: true
  })
  lpQuoteDeltaToken?: DecimalNullableFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  positionId?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => Collateral_transferNullableRelationFilter, {
    nullable: true
  })
  collateral_transfer?: Collateral_transferNullableRelationFilter | undefined;

  @TypeGraphQL.Field(_type => Market_priceNullableRelationFilter, {
    nullable: true
  })
  market_price?: Market_priceNullableRelationFilter | undefined;

  @TypeGraphQL.Field(_type => EventNullableRelationFilter, {
    nullable: true
  })
  event?: EventNullableRelationFilter | undefined;

  @TypeGraphQL.Field(_type => PositionNullableRelationFilter, {
    nullable: true
  })
  position?: PositionNullableRelationFilter | undefined;
}
