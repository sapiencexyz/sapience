import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { transaction_type_enum } from "../../enums/transaction_type_enum";

@TypeGraphQL.InputType("Enumtransaction_type_enumFieldUpdateOperationsInput", {})
export class Enumtransaction_type_enumFieldUpdateOperationsInput {
  @TypeGraphQL.Field(_type => transaction_type_enum, {
    nullable: true
  })
  set?: "addLiquidity" | "removeLiquidity" | "long" | "short" | "settledPosition" | undefined;
}
