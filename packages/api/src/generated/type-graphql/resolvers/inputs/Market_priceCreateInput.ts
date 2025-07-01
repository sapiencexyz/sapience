import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateNestedOneWithoutMarket_priceInput } from "../inputs/TransactionCreateNestedOneWithoutMarket_priceInput";

@TypeGraphQL.InputType("Market_priceCreateInput", {})
export class Market_priceCreateInput {
  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt?: Date | undefined;

  @TypeGraphQL.Field(_type => GraphQLScalars.BigIntResolver, {
    nullable: false
  })
  timestamp!: bigint;

  @TypeGraphQL.Field(_type => DecimalJSScalar, {
    nullable: false
  })
  value!: Prisma.Decimal;

  @TypeGraphQL.Field(_type => TransactionCreateNestedOneWithoutMarket_priceInput, {
    nullable: true
  })
  transaction?: TransactionCreateNestedOneWithoutMarket_priceInput | undefined;
}
