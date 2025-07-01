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
import { StringNullableFilter } from "../inputs/StringNullableFilter";

@TypeGraphQL.InputType("PositionScalarWhereInput", {})
export class PositionScalarWhereInput {
  @TypeGraphQL.Field(_type => [PositionScalarWhereInput], {
    nullable: true
  })
  AND?: PositionScalarWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionScalarWhereInput], {
    nullable: true
  })
  OR?: PositionScalarWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionScalarWhereInput], {
    nullable: true
  })
  NOT?: PositionScalarWhereInput[] | undefined;

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
}
