import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Collateral_transferUpdateOneWithoutTransactionNestedInput } from "../inputs/Collateral_transferUpdateOneWithoutTransactionNestedInput";
import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { DecimalFieldUpdateOperationsInput } from "../inputs/DecimalFieldUpdateOperationsInput";
import { Enumtransaction_type_enumFieldUpdateOperationsInput } from "../inputs/Enumtransaction_type_enumFieldUpdateOperationsInput";
import { EventUpdateOneWithoutTransactionNestedInput } from "../inputs/EventUpdateOneWithoutTransactionNestedInput";
import { Market_priceUpdateOneWithoutTransactionNestedInput } from "../inputs/Market_priceUpdateOneWithoutTransactionNestedInput";
import { NullableDecimalFieldUpdateOperationsInput } from "../inputs/NullableDecimalFieldUpdateOperationsInput";
import { PositionUpdateOneWithoutTransactionNestedInput } from "../inputs/PositionUpdateOneWithoutTransactionNestedInput";

@TypeGraphQL.InputType("TransactionUpdateInput", {})
export class TransactionUpdateInput {
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

  @TypeGraphQL.Field(_type => Collateral_transferUpdateOneWithoutTransactionNestedInput, {
    nullable: true
  })
  collateral_transfer?: Collateral_transferUpdateOneWithoutTransactionNestedInput | undefined;

  @TypeGraphQL.Field(_type => Market_priceUpdateOneWithoutTransactionNestedInput, {
    nullable: true
  })
  market_price?: Market_priceUpdateOneWithoutTransactionNestedInput | undefined;

  @TypeGraphQL.Field(_type => EventUpdateOneWithoutTransactionNestedInput, {
    nullable: true
  })
  event?: EventUpdateOneWithoutTransactionNestedInput | undefined;

  @TypeGraphQL.Field(_type => PositionUpdateOneWithoutTransactionNestedInput, {
    nullable: true
  })
  position?: PositionUpdateOneWithoutTransactionNestedInput | undefined;
}
