import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryUpdateOneWithoutResourceNestedInput } from "../inputs/CategoryUpdateOneWithoutResourceNestedInput";
import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { Resource_priceUpdateManyWithoutResourceNestedInput } from "../inputs/Resource_priceUpdateManyWithoutResourceNestedInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";

@TypeGraphQL.InputType("ResourceUpdateWithoutMarket_groupInput", {})
export class ResourceUpdateWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput, {
    nullable: true
  })
  createdAt?: DateTimeFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput, {
    nullable: true
  })
  name?: StringFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput, {
    nullable: true
  })
  slug?: StringFieldUpdateOperationsInput | undefined;

  @TypeGraphQL.Field(_type => CategoryUpdateOneWithoutResourceNestedInput, {
    nullable: true
  })
  category?: CategoryUpdateOneWithoutResourceNestedInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceUpdateManyWithoutResourceNestedInput, {
    nullable: true
  })
  resource_price?: Resource_priceUpdateManyWithoutResourceNestedInput | undefined;
}
