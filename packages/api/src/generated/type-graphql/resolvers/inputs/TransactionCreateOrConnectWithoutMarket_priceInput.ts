import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateWithoutMarket_priceInput } from "../inputs/TransactionCreateWithoutMarket_priceInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionCreateOrConnectWithoutMarket_priceInput", {})
export class TransactionCreateOrConnectWithoutMarket_priceInput {
  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: false
  })
  where!: TransactionWhereUniqueInput;

  @TypeGraphQL.Field(_type => TransactionCreateWithoutMarket_priceInput, {
    nullable: false
  })
  create!: TransactionCreateWithoutMarket_priceInput;
}
