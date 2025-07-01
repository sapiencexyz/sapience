import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BigIntWithAggregatesFilter } from "../inputs/BigIntWithAggregatesFilter";
import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { DecimalWithAggregatesFilter } from "../inputs/DecimalWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";

@TypeGraphQL.InputType("Market_priceScalarWhereWithAggregatesInput", {})
export class Market_priceScalarWhereWithAggregatesInput {
  @TypeGraphQL.Field(_type => [Market_priceScalarWhereWithAggregatesInput], {
    nullable: true
  })
  AND?: Market_priceScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_priceScalarWhereWithAggregatesInput], {
    nullable: true
  })
  OR?: Market_priceScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_priceScalarWhereWithAggregatesInput], {
    nullable: true
  })
  NOT?: Market_priceScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => IntWithAggregatesFilter, {
    nullable: true
  })
  id?: IntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeWithAggregatesFilter, {
    nullable: true
  })
  createdAt?: DateTimeWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => BigIntWithAggregatesFilter, {
    nullable: true
  })
  timestamp?: BigIntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DecimalWithAggregatesFilter, {
    nullable: true
  })
  value?: DecimalWithAggregatesFilter | undefined;
}
