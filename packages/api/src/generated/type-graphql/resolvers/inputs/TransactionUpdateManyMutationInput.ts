import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { DecimalFieldUpdateOperationsInput } from "../inputs/DecimalFieldUpdateOperationsInput";
import { Enumtransaction_type_enumFieldUpdateOperationsInput } from "../inputs/Enumtransaction_type_enumFieldUpdateOperationsInput";
import { NullableDecimalFieldUpdateOperationsInput } from "../inputs/NullableDecimalFieldUpdateOperationsInput";

@TypeGraphQL.InputType("TransactionUpdateManyMutationInput", {})
export class TransactionUpdateManyMutationInput {
  @TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput, {
    nullable: true
  })
  createdAt?: DateTimeFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  tradeRatioD18?: NullableDecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => Enumtransaction_type_enumFieldUpdateOperationsInput, {
    nullable: true
  })
  type?: Enumtransaction_type_enumFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  baseToken?: NullableDecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  quoteToken?: NullableDecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  borrowedBaseToken?: NullableDecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  borrowedQuoteToken?: NullableDecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => DecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  collateral?: DecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  lpBaseDeltaToken?: NullableDecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  lpQuoteDeltaToken?: NullableDecimalFieldUpdateOperationsInput | undefined;
}
