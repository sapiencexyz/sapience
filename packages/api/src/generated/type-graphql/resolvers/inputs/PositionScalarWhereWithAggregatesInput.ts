import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BoolNullableWithAggregatesFilter } from "../inputs/BoolNullableWithAggregatesFilter";
import { BoolWithAggregatesFilter } from "../inputs/BoolWithAggregatesFilter";
import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { DecimalNullableWithAggregatesFilter } from "../inputs/DecimalNullableWithAggregatesFilter";
import { DecimalWithAggregatesFilter } from "../inputs/DecimalWithAggregatesFilter";
import { IntNullableWithAggregatesFilter } from "../inputs/IntNullableWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringNullableWithAggregatesFilter } from "../inputs/StringNullableWithAggregatesFilter";

@TypeGraphQL.InputType("PositionScalarWhereWithAggregatesInput", {})
export class PositionScalarWhereWithAggregatesInput {
  @TypeGraphQL.Field(_type => [PositionScalarWhereWithAggregatesInput], {
    nullable: true
  })
  AND?: PositionScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionScalarWhereWithAggregatesInput], {
    nullable: true
  })
  OR?: PositionScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionScalarWhereWithAggregatesInput], {
    nullable: true
  })
  NOT?: PositionScalarWhereWithAggregatesInput[] | undefined;

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
  positionId?: IntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  owner?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => BoolWithAggregatesFilter, {
    nullable: true
  })
  isLP?: BoolWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  highPriceTick?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  lowPriceTick?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => BoolNullableWithAggregatesFilter, {
    nullable: true
  })
  isSettled?: BoolNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  lpBaseToken?: DecimalNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalNullableWithAggregatesFilter, {
    nullable: true
  })
  lpQuoteToken?: DecimalNullableWithAggregatesFilter | undefined;

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

  @TypeGraphQL.Field(_type => IntNullableWithAggregatesFilter, {
    nullable: true
  })
  marketId?: IntNullableWithAggregatesFilter | undefined;
}
