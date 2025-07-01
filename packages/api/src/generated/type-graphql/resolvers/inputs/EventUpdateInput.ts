import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { BigIntFieldUpdateOperationsInput } from "../inputs/BigIntFieldUpdateOperationsInput";
import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { IntFieldUpdateOperationsInput } from "../inputs/IntFieldUpdateOperationsInput";
import { Market_groupUpdateOneWithoutEventNestedInput } from "../inputs/Market_groupUpdateOneWithoutEventNestedInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";
import { TransactionUpdateOneWithoutEventNestedInput } from "../inputs/TransactionUpdateOneWithoutEventNestedInput";

@TypeGraphQL.InputType("EventUpdateInput", {})
export class EventUpdateInput {
  @TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput, {
    nullable: true
  })
  createdAt?: DateTimeFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => IntFieldUpdateOperationsInput, {
    nullable: true
  })
  blockNumber?: IntFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput, {
    nullable: true
  })
  transactionHash?: StringFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => BigIntFieldUpdateOperationsInput, {
    nullable: true
  })
  timestamp?: BigIntFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => IntFieldUpdateOperationsInput, {
    nullable: true
  })
  logIndex?: IntFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => GraphQLScalars.JSONResolver, {
    nullable: true
  })
  logData?: Prisma.InputJsonValue | undefined;

  @TypeGraphQL.Field(_type => Market_groupUpdateOneWithoutEventNestedInput, {
    nullable: true
  })
  market_group?: Market_groupUpdateOneWithoutEventNestedInput | undefined;

  @TypeGraphQL.Field(_type => TransactionUpdateOneWithoutEventNestedInput, {
    nullable: true
  })
  transaction?: TransactionUpdateOneWithoutEventNestedInput | undefined;
}
