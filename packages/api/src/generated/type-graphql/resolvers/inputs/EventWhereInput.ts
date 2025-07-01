import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BigIntFilter } from "../inputs/BigIntFilter";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { IntFilter } from "../inputs/IntFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { JsonFilter } from "../inputs/JsonFilter";
import { Market_groupNullableRelationFilter } from "../inputs/Market_groupNullableRelationFilter";
import { StringFilter } from "../inputs/StringFilter";
import { TransactionNullableRelationFilter } from "../inputs/TransactionNullableRelationFilter";

@TypeGraphQL.InputType("EventWhereInput", {})
export class EventWhereInput {
  @TypeGraphQL.Field(_type => [EventWhereInput], {
    nullable: true
  })
  AND?: EventWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventWhereInput], {
    nullable: true
  })
  OR?: EventWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [EventWhereInput], {
    nullable: true
  })
  NOT?: EventWhereInput[] | undefined;

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
  blockNumber?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => StringFilter, {
    nullable: true
  })
  transactionHash?: StringFilter | undefined;

  @TypeGraphQL.Field(_type => BigIntFilter, {
    nullable: true
  })
  timestamp?: BigIntFilter | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  logIndex?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => JsonFilter, {
    nullable: true
  })
  logData?: JsonFilter | undefined;

  @TypeGraphQL.Field(_type => IntNullableFilter, {
    nullable: true
  })
  marketGroupId?: IntNullableFilter | undefined;

  @TypeGraphQL.Field(_type => Market_groupNullableRelationFilter, {
    nullable: true
  })
  market_group?: Market_groupNullableRelationFilter | undefined;

  @TypeGraphQL.Field(_type => TransactionNullableRelationFilter, {
    nullable: true
  })
  transaction?: TransactionNullableRelationFilter | undefined;
}
