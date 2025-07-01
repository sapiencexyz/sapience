import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateWithoutMarket_priceInput } from "../inputs/TransactionCreateWithoutMarket_priceInput";
import { TransactionUpdateWithoutMarket_priceInput } from "../inputs/TransactionUpdateWithoutMarket_priceInput";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";

@TypeGraphQL.InputType("TransactionUpsertWithoutMarket_priceInput", {})
export class TransactionUpsertWithoutMarket_priceInput {
  @TypeGraphQL.Field(_type => TransactionUpdateWithoutMarket_priceInput, {
    nullable: false
  })
  update!: TransactionUpdateWithoutMarket_priceInput;

  @TypeGraphQL.Field(_type => TransactionCreateWithoutMarket_priceInput, {
    nullable: false
  })
  create!: TransactionCreateWithoutMarket_priceInput;

  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  where?: TransactionWhereInput | undefined;
}
