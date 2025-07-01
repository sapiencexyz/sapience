import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BigIntFieldUpdateOperationsInput } from "../inputs/BigIntFieldUpdateOperationsInput";
import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { DecimalFieldUpdateOperationsInput } from "../inputs/DecimalFieldUpdateOperationsInput";
import { TransactionUpdateOneWithoutMarket_priceNestedInput } from "../inputs/TransactionUpdateOneWithoutMarket_priceNestedInput";

@TypeGraphQL.InputType("Market_priceUpdateInput", {})
export class Market_priceUpdateInput {
  @TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput, {
    nullable: true
  })
  createdAt?: DateTimeFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => BigIntFieldUpdateOperationsInput, {
    nullable: true
  })
  timestamp?: BigIntFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => DecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  value?: DecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => TransactionUpdateOneWithoutMarket_priceNestedInput, {
    nullable: true
  })
  transaction?: TransactionUpdateOneWithoutMarket_priceNestedInput | undefined;
}
