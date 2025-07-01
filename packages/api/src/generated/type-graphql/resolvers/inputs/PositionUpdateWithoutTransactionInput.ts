import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BoolFieldUpdateOperationsInput } from "../inputs/BoolFieldUpdateOperationsInput";
import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { DecimalFieldUpdateOperationsInput } from "../inputs/DecimalFieldUpdateOperationsInput";
import { IntFieldUpdateOperationsInput } from "../inputs/IntFieldUpdateOperationsInput";
import { MarketUpdateOneWithoutPositionNestedInput } from "../inputs/MarketUpdateOneWithoutPositionNestedInput";
import { NullableBoolFieldUpdateOperationsInput } from "../inputs/NullableBoolFieldUpdateOperationsInput";
import { NullableDecimalFieldUpdateOperationsInput } from "../inputs/NullableDecimalFieldUpdateOperationsInput";
import { NullableStringFieldUpdateOperationsInput } from "../inputs/NullableStringFieldUpdateOperationsInput";

@TypeGraphQL.InputType("PositionUpdateWithoutTransactionInput", {})
export class PositionUpdateWithoutTransactionInput {
  @TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput, {
    nullable: true
  })
  createdAt?: DateTimeFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => IntFieldUpdateOperationsInput, {
    nullable: true
  })
  positionId?: IntFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableStringFieldUpdateOperationsInput, {
    nullable: true
  })
  owner?: NullableStringFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => BoolFieldUpdateOperationsInput, {
    nullable: true
  })
  isLP?: BoolFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  highPriceTick?: NullableDecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  lowPriceTick?: NullableDecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableBoolFieldUpdateOperationsInput, {
    nullable: true
  })
  isSettled?: NullableBoolFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  lpBaseToken?: NullableDecimalFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => NullableDecimalFieldUpdateOperationsInput, {
    nullable: true
  })
  lpQuoteToken?: NullableDecimalFieldUpdateOperationsInput | undefined;

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

  @TypeGraphQL.Field(_type => MarketUpdateOneWithoutPositionNestedInput, {
    nullable: true
  })
  market?: MarketUpdateOneWithoutPositionNestedInput | undefined;
}
