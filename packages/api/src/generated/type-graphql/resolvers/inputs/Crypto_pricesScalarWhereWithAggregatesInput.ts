import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { FloatWithAggregatesFilter } from "../inputs/FloatWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringNullableWithAggregatesFilter } from "../inputs/StringNullableWithAggregatesFilter";

@TypeGraphQL.InputType("Crypto_pricesScalarWhereWithAggregatesInput", {})
export class Crypto_pricesScalarWhereWithAggregatesInput {
  @TypeGraphQL.Field(_type => [Crypto_pricesScalarWhereWithAggregatesInput], {
    nullable: true
  })
  AND?: Crypto_pricesScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [Crypto_pricesScalarWhereWithAggregatesInput], {
    nullable: true
  })
  OR?: Crypto_pricesScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => [Crypto_pricesScalarWhereWithAggregatesInput], {
    nullable: true
  })
  NOT?: Crypto_pricesScalarWhereWithAggregatesInput[] | undefined;

  @TypeGraphQL.Field(_type => IntWithAggregatesFilter, {
    nullable: true
  })
  id?: IntWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableWithAggregatesFilter, {
    nullable: true
  })
  ticker?: StringNullableWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => FloatWithAggregatesFilter, {
    nullable: true
  })
  price?: FloatWithAggregatesFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeWithAggregatesFilter, {
    nullable: true
  })
  timestamp?: DateTimeWithAggregatesFilter | undefined;
}
