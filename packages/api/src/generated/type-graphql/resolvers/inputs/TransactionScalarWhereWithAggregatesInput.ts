import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { DecimalNullableWithAggregatesFilter } from "../inputs/DecimalNullableWithAggregatesFilter";
import { DecimalWithAggregatesFilter } from "../inputs/DecimalWithAggregatesFilter";
import { Enumtransaction_type_enumWithAggregatesFilter } from "../inputs/Enumtransaction_type_enumWithAggregatesFilter";
import { IntNullableWithAggregatesFilter } from "../inputs/IntNullableWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";

@TypeGraphQL.InputType("TransactionScalarWhereWithAggregatesInput", {})
export class TransactionScalarWhereWithAggregatesInput {
  @TypeGraphQL.Field(_type => [TransactionScalarWhereWithAggregatesInput], {
    nullable: true
  })
  AND?: TransactionScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionScalarWhereWithAggregatesInput], {
    nullable: true
  })
  OR?: TransactionScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [TransactionScalarWhereWithAggregatesInput], {
    nullable: true
  })
  NOT?: TransactionScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => IntWithAggregatesFilter, {
    nullable: true
  })
  id?: IntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeWithAggregatesFilter, {
    nullable: true
  })
  createdAt?: DateTimeWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  tradeRatioD18?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => Enumtransaction_type_enumWithAggregatesFilter, {
    nullable: true
  })
  type?: Enumtransaction_type_enumWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  baseToken?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  quoteToken?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  borrowedBaseToken?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  borrowedQuoteToken?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalWithAggregatesFilter, {
    nullable: true
  })
  collateral?: DecimalWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  lpBaseDeltaToken?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  lpQuoteDeltaToken?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  eventId?: IntNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  positionId?: IntNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  marketPriceId?: IntNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  collateralTransferId?: IntNullableWithAggregatesFilter | undefined;
}
