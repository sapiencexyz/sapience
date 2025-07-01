import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionUpdateWithoutMarket_priceInput } from "../inputs/TransactionUpdateWithoutMarket_priceInput";
import { TransactionWhereInput } from "../inputs/TransactionWhereInput";

@TypeGraphQL.InputType("TransactionUpdateToOneWithWhereWithoutMarket_priceInput", {})
export class TransactionUpdateToOneWithWhereWithoutMarket_priceInput {
  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  where?: TransactionWhereInput | undefined;

  @TypeGraphQL.Field(_type => TransactionUpdateWithoutMarket_priceInput, {
    nullable: false
  })
  data!: TransactionUpdateWithoutMarket_priceInput;
}
