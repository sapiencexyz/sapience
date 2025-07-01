import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateOrConnectWithoutMarket_priceInput } from "../inputs/TransactionCreateOrConnectWithoutMarket_priceInput";
import { TransactionCreateWithoutMarket_priceInput } from "../inputs/TransactionCreateWithoutMarket_priceInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionCreateNestedOneWithoutMarket_priceInput", {})
export class TransactionCreateNestedOneWithoutMarket_priceInput {
  @TypeGraphQL.Field(_type => TransactionCreateWithoutMarket_priceInput, {
    nullable: true
  })
  create?: TransactionCreateWithoutMarket_priceInput | undefined;

  @TypeGraphQL.Field(_type => TransactionCreateOrConnectWithoutMarket_priceInput, {
    nullable: true
  })
  connectOrCreate?: TransactionCreateOrConnectWithoutMarket_priceInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: true
  })
  connect?: TransactionWhereUniqueInput | undefined;
}
