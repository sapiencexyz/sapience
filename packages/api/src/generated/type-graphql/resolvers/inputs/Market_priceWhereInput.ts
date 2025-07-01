import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BigIntFilter } from "../inputs/BigIntFilter";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DecimalFilter } from "../inputs/DecimalFilter";
import { IntFilter } from "../inputs/IntFilter";
import { TransactionNullableRelationFilter } from "../inputs/TransactionNullableRelationFilter";

@TypeGraphQL.InputType("Market_priceWhereInput", {})
export class Market_priceWhereInput {
  @TypeGraphQL.Field(_type => [Market_priceWhereInput], {
    nullable: true
  })
  AND?: Market_priceWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_priceWhereInput], {
    nullable: true
  })
  OR?: Market_priceWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_priceWhereInput], {
    nullable: true
  })
  NOT?: Market_priceWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  id?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  createdAt?: DateTimeFilter | undefined;

  @TypeGraphQL.Field(_type => BigIntFilter, {
    nullable: true
  })
  timestamp?: BigIntFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalFilter, {
    nullable: true
  })
  value?: DecimalFilter | undefined;

  @TypeGraphQL.Field(_type => TransactionNullableRelationFilter, {
    nullable: true
  })
  transaction?: TransactionNullableRelationFilter | undefined;
}
