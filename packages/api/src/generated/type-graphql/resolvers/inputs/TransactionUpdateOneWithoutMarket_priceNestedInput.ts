import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateOrConnectWithoutMarket_priceInput } from "../inputs/TransactionCreateOrConnectWithoutMarket_priceInput";
import { TransactionCreateWithoutMarket_priceInput } from "../inputs/TransactionCreateWithoutMarket_priceInput";
import { TransactionUpdateToOneWithWhereWithoutMarket_priceInput } from "../inputs/TransactionUpdateToOneWithWhereWithoutMarket_priceInput";
import { TransactionUpsertWithoutMarket_priceInput } from "../inputs/TransactionUpsertWithoutMarket_priceInput";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";
import { TransactionWhereUniqueInput } from "../inputs/TransactionWhereUniqueInput";

@TypeGraphQL.InputType("TransactionUpdateOneWithoutMarket_priceNestedInput", {})
export class TransactionUpdateOneWithoutMarket_priceNestedInput {
  @TypeGraphQL.Field(_type => TransactionCreateWithoutMarket_priceInput, {
    nullable: true
  })
  create?: TransactionCreateWithoutMarket_priceInput | undefined;

  @TypeGraphQL.Field(_type => TransactionCreateOrConnectWithoutMarket_priceInput, {
    nullable: true
  })
  connectOrCreate?: TransactionCreateOrConnectWithoutMarket_priceInput | undefined;

  @TypeGraphQL.Field(_type => TransactionUpsertWithoutMarket_priceInput, {
    nullable: true
  })
  upsert?: TransactionUpsertWithoutMarket_priceInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  disconnect?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  delete?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => TransactionWhereUniqueInput, {
    nullable: true
  })
  connect?: TransactionWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TransactionUpdateToOneWithWhereWithoutMarket_priceInput, {
    nullable: true
  })
  update?: TransactionUpdateToOneWithWhereWithoutMarket_priceInput | undefined;
}
