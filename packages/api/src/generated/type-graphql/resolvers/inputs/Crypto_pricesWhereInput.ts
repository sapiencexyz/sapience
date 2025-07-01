import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { FloatFilter } from "../inputs/FloatFilter";
import { IntFilter } from "../inputs/IntFilter";
import { StringNullableFilter } from "../inputs/StringNullableFilter";

@TypeGraphQL.InputType("Crypto_pricesWhereInput", {})
export class Crypto_pricesWhereInput {
  @TypeGraphQL.Field(_type => [Crypto_pricesWhereInput], {
    nullable: true
  })
  AND?: Crypto_pricesWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Crypto_pricesWhereInput], {
    nullable: true
  })
  OR?: Crypto_pricesWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => [Crypto_pricesWhereInput], {
    nullable: true
  })
  NOT?: Crypto_pricesWhereInput[] | undefined;

  @TypeGraphQL.Field(_type => IntFilter, {
    nullable: true
  })
  id?: IntFilter | undefined;

  @TypeGraphQL.Field(_type => StringNullableFilter, {
    nullable: true
  })
  ticker?: StringNullableFilter | undefined;

  @TypeGraphQL.Field(_type => FloatFilter, {
    nullable: true
  })
  price?: FloatFilter | undefined;

  @TypeGraphQL.Field(_type => DateTimeFilter, {
    nullable: true
  })
  timestamp?: DateTimeFilter | undefined;
}
